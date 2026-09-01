import { authHttp } from './http';
import { session } from './session';
import type { ApiEnvelope } from './types';

/** `POST /auth/refresh` returns the same body as login. */
interface RefreshResponse {
  accessToken: string;
  expiresAt: string;
}

let inFlight: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Single-flight on purpose: a page that fires six queries at once must not send
 * six refreshes. The first caller performs the request, the rest await the same
 * promise and get the same answer.
 *
 * Resolves `true` when a new token is in place, `false` when the session is
 * genuinely over (in which case `session.end('expired')` has already fired).
 */
export function refreshAccessToken(): Promise<boolean> {
  inFlight ??= run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<boolean> {
  try {
    const response = await authHttp.post<ApiEnvelope<RefreshResponse>>('/auth/refresh');
    const { accessToken, expiresAt } = response.data.data;
    session.setAccessToken(accessToken, expiresAt);
    return true;
  } catch {
    // Any failure here means the refresh cookie is missing, expired or revoked.
    session.end('expired');
    return false;
  }
}
