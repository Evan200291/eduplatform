import type { InternalAxiosRequestConfig } from 'axios';
import { http } from './http';
import { session } from './session';
import { refreshAccessToken } from './refresh';
import { toApiError } from './error';

/** Requests we never retry after a 401 — refreshing them makes no sense. */
const NO_RETRY_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

interface RetryableConfig extends InternalAxiosRequestConfig {
  _midasRetried?: boolean;
}

let installed = false;

/**
 * Wires the cross-cutting request behaviour. Called once from `api/index.ts`.
 *
 * Feature code therefore never sets an Authorization header, never handles a
 * 401 and never inspects an axios error shape — those three concerns live here
 * and only here.
 */
export function installInterceptors(): void {
  if (installed) return;
  installed = true;

  http.interceptors.request.use((config) => {
    const token = session.getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    // Platform staff acting inside a tenant: the backend reads the school from
    // this header, never from a request body.
    const tenantSchoolId = session.getTenantSchoolId();
    if (tenantSchoolId) config.headers['X-Tenant-School'] = tenantSchoolId;

    return config;
  });

  http.interceptors.response.use(
    (response) => response,
    async (cause: unknown) => {
      const error = toApiError(cause);
      const config = (cause as { config?: RetryableConfig }).config;

      const canRetry =
        error.status === 401 &&
        !!config &&
        !config._midasRetried &&
        !NO_RETRY_PATHS.some((path) => (config.url ?? '').startsWith(path));

      if (canRetry) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          config._midasRetried = true;
          return http.request(config);
        }
      }

      // A 401 we could not recover from ends the session exactly once.
      if (error.status === 401 && !session.isExpired()) session.end('expired');

      throw error;
    },
  );
}
