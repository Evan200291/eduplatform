/**
 * The API surface, assembled. Import from `@/api` — not from the individual
 * modules — so the interceptors are guaranteed to be installed first.
 */
import { installInterceptors } from './interceptors';

installInterceptors();

export { http } from './http';
export { session, type SessionEnded } from './session';
export { ApiError, toApiError } from './error';
export { refreshAccessToken } from './refresh';
export {
  apiGet,
  apiGetPaged,
  apiGetWithMeta,
  apiPost,
  apiPatch,
  apiPut,
  apiDelete,
  apiUpload,
} from './request';
export type {
  ApiEnvelope,
  ApiErrorBody,
  ApiIssue,
  ErrorCode,
  ListQuery,
  PageMeta,
  Paginated,
} from './types';
export { ERROR_CODES, CLIENT_ERROR_CODES } from './types';
