// ─────────────────────────────────────────────────────────────────────────────
// Central error handler
// One place decides what the client is told. Expected failures keep their
// message; anything unrecognised becomes a generic 500 and is logged with a
// stack, because a raw database or driver message leaks schema details.
//
// Response shape, matching ./respond.ts:
//   { "error": { "code", "message", "issues"?, "details"?, "requestId" } }
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { env } from '../../config/env';
import { logger } from '../logger';
import { AppError, isAppError, type ErrorCode, type FieldIssue } from './errors';

const log = logger.child({ module: 'http' });

interface NormalizedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  issues?: FieldIssue[];
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
  /** False for faults we did not anticipate; these are logged at error level. */
  expected: boolean;
}

function normalize(error: unknown): NormalizedError {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      issues: error.issues,
      details: error.details,
      retryAfterSeconds: error.retryAfterSeconds,
      expected: true,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: 'VALIDATION_FAILED',
      message: 'The submitted data is invalid.',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
      expected: true,
    };
  }

  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'That file is larger than the allowed maximum.',
        details: { maxBytes: env.storage.maxUploadBytes },
        expected: true,
      };
    }
    return {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'That upload could not be accepted.',
      details: { multerCode: error.code, field: error.field },
      expected: true,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return normalizePrisma(error);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    // Reaching here means a service built an invalid query — a bug, not input.
    return {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
      expected: false,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      statusCode: 503,
      code: 'INTERNAL_ERROR',
      message: 'The service is temporarily unavailable. Please try again shortly.',
      expected: false,
    };
  }

  // `express.json()` rejects malformed bodies with a SyntaxError carrying `body`.
  if (
    error instanceof SyntaxError &&
    'body' in error &&
    typeof (error as { status?: number }).status === 'number'
  ) {
    return {
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'The request body is not valid JSON.',
      expected: true,
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side.',
    expected: false,
  };
}

function normalizePrisma(error: Prisma.PrismaClientKnownRequestError): NormalizedError {
  const target = Array.isArray(error.meta?.target)
    ? (error.meta?.target as string[]).join(', ')
    : typeof error.meta?.target === 'string'
      ? error.meta.target
      : undefined;

  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: target
          ? `That value is already in use (${target}).`
          : 'That value is already in use.',
        details: target ? { fields: target } : undefined,
        expected: true,
      };
    case 'P2003':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A related record is missing or still in use.',
        expected: true,
      };
    case 'P2014':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'That change would break a required relationship.',
        expected: true,
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'That record was not found.',
        expected: true,
      };
    case 'P2000':
      return {
        statusCode: 422,
        code: 'VALIDATION_FAILED',
        message: 'One of the submitted values is too long.',
        expected: true,
      };
    default:
      return {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side.',
        expected: false,
      };
  }
}

/** 404 handler for unmatched routes. Mounted after every router. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.path}.`,
      requestId: req.context?.requestId,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalized = normalize(error);

  const logPayload = {
    requestId: req.context?.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
    userId: req.actor?.userId,
    schoolId: req.tenant?.schoolId,
  };

  if (normalized.expected) {
    // Expected failures are the normal cost of doing business; keep them quiet
    // unless they are server-side.
    if (normalized.statusCode >= 500) log.error({ ...logPayload, err: error }, normalized.message);
    else log.info(logPayload, normalized.message);
  } else {
    log.error({ ...logPayload, err: error }, 'unhandled error');
  }

  if (res.headersSent) return;

  if (normalized.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(normalized.retryAfterSeconds));
  }

  const body: Record<string, unknown> = {
    code: normalized.code,
    message: normalized.message,
    requestId: req.context?.requestId,
  };
  if (normalized.issues) body.issues = normalized.issues;
  if (normalized.details) body.details = normalized.details;

  // A stack is only ever returned outside production, and only for faults.
  if (!env.isProduction && !normalized.expected && error instanceof Error) {
    body.stack = error.stack?.split('\n').slice(0, 12);
  }

  res.status(normalized.statusCode).json({ error: body });
};

/** Re-exported so route files import guards and this handler from one place. */
export { AppError };
