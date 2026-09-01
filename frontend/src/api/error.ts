import axios from 'axios';
import { CLIENT_ERROR_CODES, type ApiErrorBody, type ApiIssue } from './types';

/**
 * Every failure the app sees is one of these, whatever its origin — a server
 * error envelope, a dropped connection, or a cancelled request. UI code can
 * therefore always read `.code`, `.issues` and `.requestId` without guessing at
 * axios internals.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly issues: ApiIssue[];
  readonly details: unknown;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    requestId?: string | null;
    issues?: ApiIssue[];
    details?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId ?? null;
    this.issues = init.issues ?? [];
    this.details = init.details;
  }

  /** True for faults where retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.code === CLIENT_ERROR_CODES.network ||
      this.code === 'RATE_LIMITED' ||
      this.code === 'INTERNAL_ERROR'
    );
  }

  /** Field errors keyed by form path, ready to hand to a form library. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of this.issues) {
      if (!(issue.path in out)) out[issue.path] = issue.message;
    }
    return out;
  }
}

function isErrorBody(value: unknown): value is { error: ApiErrorBody } {
  if (!value || typeof value !== 'object') return false;
  const candidate = (value as { error?: unknown }).error;
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as ApiErrorBody).code === 'string'
  );
}

/** Normalises anything thrown by the transport layer into an `ApiError`. */
export function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;

  if (axios.isCancel(cause)) {
    return new ApiError({
      code: CLIENT_ERROR_CODES.aborted,
      message: 'The request was cancelled.',
      status: 0,
    });
  }

  if (axios.isAxiosError(cause)) {
    const status = cause.response?.status ?? 0;
    const body = cause.response?.data;

    if (isErrorBody(body)) {
      return new ApiError({
        code: body.error.code,
        message: body.error.message,
        status,
        requestId: body.error.requestId ?? cause.response?.headers?.['x-request-id'] ?? null,
        issues: body.error.issues,
        details: body.error.details,
      });
    }

    if (!cause.response) {
      return new ApiError({
        code: CLIENT_ERROR_CODES.network,
        message: 'Cannot reach the server. Check your connection and try again.',
        status: 0,
      });
    }

    return new ApiError({
      code: CLIENT_ERROR_CODES.unknown,
      message: cause.message || 'The server returned an unexpected response.',
      status,
    });
  }

  return new ApiError({
    code: CLIENT_ERROR_CODES.unknown,
    message: cause instanceof Error ? cause.message : 'Something went wrong.',
    status: 0,
  });
}
