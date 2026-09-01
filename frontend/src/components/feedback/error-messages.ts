import { ApiError, CLIENT_ERROR_CODES } from '@/api';

/**
 * User-facing copy for each error code the backend can return.
 *
 * The server's `message` is written for a developer reading a log. This maps the
 * stable `code` to something a teacher or a nine-year-old can act on, which is
 * why gating and messaging both key off `code` and never off `message`.
 *
 * `action` is the recovery hint — every error a user can do something about
 * should say what.
 */
interface ErrorCopy {
  title: string;
  action?: string;
}

const COPY: Record<string, ErrorCopy> = {
  VALIDATION_FAILED: {
    title: 'Some details need fixing.',
    action: 'Check the highlighted fields and try again.',
  },
  UNAUTHENTICATED: { title: 'Please sign in to continue.' },
  INVALID_CREDENTIALS: {
    title: 'Those sign-in details did not match.',
    action: 'Check them and try again. Your teacher can reset them for you.',
  },
  ACCOUNT_LOCKED: {
    title: 'This account is locked.',
    action: 'Ask a teacher or school administrator to unlock it.',
  },
  ACCOUNT_INACTIVE: {
    title: 'This account is not active yet.',
    action: 'A school administrator needs to activate it.',
  },
  SESSION_EXPIRED: {
    title: 'You were signed out.',
    action: 'Sign in again to pick up where you left off.',
  },
  FORBIDDEN: {
    title: 'You do not have access to this.',
    action: 'If you think you should, ask your school administrator.',
  },
  TENANT_CONTEXT_REQUIRED: {
    title: 'Choose a school first.',
    action: 'Pick the school you want to work in, then retry.',
  },
  TENANT_MISMATCH: { title: 'That item belongs to a different school.' },
  FEATURE_DISABLED: {
    title: 'This feature is switched off for your school.',
    action: 'A school administrator can turn it on.',
  },
  NOT_FOUND: { title: 'We could not find that.', action: 'It may have been moved or removed.' },
  CONFLICT: {
    title: 'That conflicts with something that already exists.',
    action: 'Try a different name or code.',
  },
  PRECONDITION_FAILED: {
    title: 'Something changed while you were working.',
    action: 'Reload and try again.',
  },
  IMMUTABLE_RECORD: { title: 'This record can no longer be changed.' },
  PAYLOAD_TOO_LARGE: { title: 'That file is too big.', action: 'Try a smaller file.' },
  UNSUPPORTED_MEDIA_TYPE: { title: 'That file type is not supported.' },
  RATE_LIMITED: { title: 'Too many attempts.', action: 'Wait a moment, then try again.' },
  NOT_IMPLEMENTED: { title: 'This is not available yet.' },
  INTERNAL_ERROR: {
    title: 'Something went wrong on our side.',
    action: 'Try again. If it keeps happening, contact support with the reference below.',
  },
  [CLIENT_ERROR_CODES.network]: {
    title: 'No connection.',
    action: 'Check your internet connection and try again.',
  },
  [CLIENT_ERROR_CODES.aborted]: { title: 'That request was cancelled.' },
  [CLIENT_ERROR_CODES.unknown]: {
    title: 'Something unexpected happened.',
    action: 'Try again.',
  },
};

const FALLBACK: ErrorCopy = {
  title: 'Something went wrong.',
  action: 'Try again in a moment.',
};

export function errorCopy(error: unknown): ErrorCopy {
  if (error instanceof ApiError) return COPY[error.code] ?? FALLBACK;
  return FALLBACK;
}

/** The support reference to show alongside a server fault. */
export function errorReference(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null;
}
