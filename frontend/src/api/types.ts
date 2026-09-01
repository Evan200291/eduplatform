/**
 * Wire types for the Midas API. These mirror
 * `backend/src/core/http/respond.ts` and `backend/src/core/http/errors.ts`
 * exactly — if the backend envelope changes, it changes here and nowhere else.
 */

/** Every 2xx body is `{ data }`, with `meta` added for lists. 204 has no body. */
export interface ApiEnvelope<T, M = unknown> {
  data: T;
  meta?: M;
}

/** `meta` on any paginated list response. */
export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

/** A field-level validation failure, shaped for direct binding to a form. */
export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  issues?: ApiIssue[];
  details?: unknown;
}

/**
 * The stable error codes the UI is allowed to branch on. Never match on
 * `message` — it is human-facing copy and will change.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_INACTIVE',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'TENANT_CONTEXT_REQUIRED',
  'TENANT_MISMATCH',
  'FEATURE_DISABLED',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'IMMUTABLE_RECORD',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes invented client-side for faults that never reach the server. */
export const CLIENT_ERROR_CODES = {
  network: 'NETWORK_UNREACHABLE',
  aborted: 'REQUEST_ABORTED',
  unknown: 'UNKNOWN_ERROR',
} as const;

/** Common list query parameters accepted across backend modules. */
export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
