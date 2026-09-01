import axios from 'axios';
import { env } from '@/lib/env';

const shared = {
  baseURL: env.apiBaseUrl,
  /** Required so the httpOnly refresh cookie is sent on `/auth/*` calls. */
  withCredentials: true,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
} as const;

/**
 * The instance all feature code uses. Interceptors (auth header, tenant header,
 * error normalisation, silent refresh) are attached in `interceptors.ts`.
 */
export const http = axios.create(shared);

/**
 * A bare instance with no interceptors, used only by the refresh flow. Sharing
 * `http` there would make a failed refresh trigger another refresh forever.
 */
export const authHttp = axios.create(shared);
