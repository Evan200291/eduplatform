// ─────────────────────────────────────────────────────────────────────────────
// Typed application errors
// Every error the API returns deliberately is an `AppError`. The error handler
// (see ./error-handler.ts) turns these into the single response envelope, and
// anything that is NOT an `AppError` is treated as an unexpected fault: logged
// with a stack and reported to the client as a generic 500.
//
// `code` is a stable machine-readable string the frontend switches on. Never
// change an existing code — add a new one.
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_INACTIVE'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MISMATCH'
  | 'FEATURE_DISABLED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'IMMUTABLE_RECORD'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

/** A single field-level validation problem, shaped for direct form binding. */
export interface FieldIssue {
  path: string;
  message: string;
}

export interface AppErrorOptions {
  /** Field-level problems, populated for `VALIDATION_FAILED`. */
  issues?: FieldIssue[];
  /** Extra machine-readable context, e.g. `{ featureKey: 'gamification.leaderboard' }`. */
  details?: Record<string, unknown>;
  /** The underlying error, logged but never returned to the client. */
  cause?: unknown;
  /** Set for 429 responses. */
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly issues?: FieldIssue[];
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;
  /** True when the message is safe to show a user verbatim. */
  readonly expected = true;

  constructor(statusCode: number, code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.issues = options.issues;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, options?: AppErrorOptions) =>
  new AppError(400, 'VALIDATION_FAILED', message, options);

export const validationFailed = (
  issues: FieldIssue[],
  message = 'The submitted data is invalid.',
) => new AppError(422, 'VALIDATION_FAILED', message, { issues });

export const unauthenticated = (message = 'Sign in to continue.', options?: AppErrorOptions) =>
  new AppError(401, 'UNAUTHENTICATED', message, options);

export const invalidCredentials = (
  // Deliberately identical whether the account exists or the password is wrong,
  // so the endpoint cannot be used to enumerate accounts.
  message = 'Those sign-in details are not correct.',
) => new AppError(401, 'INVALID_CREDENTIALS', message);

export const accountLocked = (unlocksAt: Date) =>
  new AppError(
    423,
    'ACCOUNT_LOCKED',
    'This account is temporarily locked after too many failed attempts.',
    { details: { unlocksAt: unlocksAt.toISOString() } },
  );

export const accountInactive = (status: string) =>
  new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Contact your administrator.', {
    details: { status },
  });

export const sessionExpired = (message = 'Your session has expired. Please sign in again.') =>
  new AppError(401, 'SESSION_EXPIRED', message);

export const forbidden = (
  message = 'You do not have permission to do that.',
  options?: AppErrorOptions,
) => new AppError(403, 'FORBIDDEN', message, options);

export const tenantContextRequired = (
  message = 'A school or organization context is required for this request.',
) => new AppError(400, 'TENANT_CONTEXT_REQUIRED', message);

export const tenantMismatch = (message = 'That record belongs to a different tenant.') =>
  new AppError(403, 'TENANT_MISMATCH', message);

export const featureDisabled = (featureKey: string, reason?: string) =>
  new AppError(403, 'FEATURE_DISABLED', 'That feature is not enabled here.', {
    details: reason ? { featureKey, reason } : { featureKey },
  });

export const notFound = (what = 'Record', options?: AppErrorOptions) =>
  new AppError(404, 'NOT_FOUND', `${what} was not found.`, options);

export const conflict = (message: string, options?: AppErrorOptions) =>
  new AppError(409, 'CONFLICT', message, options);

export const preconditionFailed = (message: string, options?: AppErrorOptions) =>
  new AppError(412, 'PRECONDITION_FAILED', message, options);

/**
 * Blueprint 12: assessment evidence and ledger entries are append-only. Editing
 * one is a programming error, not a user error.
 */
export const immutableRecord = (message: string, options?: AppErrorOptions) =>
  new AppError(409, 'IMMUTABLE_RECORD', message, options);

export const payloadTooLarge = (maxBytes: number) =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', 'That file is larger than the allowed maximum.', {
    details: { maxBytes },
  });

export const unsupportedMediaType = (mimeType: string, allowed: string[]) =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'That file type is not allowed.', {
    details: { mimeType, allowed },
  });

export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', {
    retryAfterSeconds,
  });

export const notImplemented = (message = 'That capability is not available yet.') =>
  new AppError(501, 'NOT_IMPLEMENTED', message);

export const internalError = (cause?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.', { cause });

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
