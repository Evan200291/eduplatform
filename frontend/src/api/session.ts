/**
 * Holds the access token in memory only.
 *
 * The refresh token lives in an httpOnly cookie scoped to `/api/v1/auth`; the
 * access token deliberately never reaches `localStorage` or `sessionStorage`.
 * That split is what stops an XSS bug from becoming a persistent session
 * takeover, so the token itself must never be persisted. The tenant-school id
 * held alongside it is not a credential and is deliberately handled
 * differently — see below.
 *
 * Deliberately framework-free: the axios interceptors need it before React has
 * mounted, and the auth store needs it after.
 */

export type SessionEnded = 'expired' | 'signed-out';

let accessToken: string | null = null;
let expiresAt: number | null = null;

const TENANT_SCHOOL_STORAGE_KEY = 'midas.tenantSchoolId';

/**
 * Platform staff only: the school they are currently acting inside.
 *
 * Unlike the access token, this isn't a credential — it's just an id — so
 * unlike the token it's safe (and worth doing) to survive a page reload. It's
 * seeded from `sessionStorage` (tab-scoped, cleared on tab close) so a reload
 * doesn't dump a platform owner back to an unscoped "choose a school" state.
 */
let tenantSchoolId: string | null = readStoredTenantSchoolId();

function readStoredTenantSchoolId(): string | null {
  try {
    return sessionStorage.getItem(TENANT_SCHOOL_STORAGE_KEY);
  } catch {
    // Storage can throw in a locked-down environment (private mode, iframes
    // with storage blocked) — fall back to memory-only for the session.
    return null;
  }
}

const endedListeners = new Set<(reason: SessionEnded) => void>();

export const session = {
  getAccessToken: (): string | null => accessToken,

  getExpiresAt: (): number | null => expiresAt,

  setAccessToken(token: string, expiresAtIso?: string): void {
    accessToken = token;
    expiresAt = expiresAtIso ? Date.parse(expiresAtIso) : null;
  },

  clearAccessToken(): void {
    accessToken = null;
    expiresAt = null;
  },

  /** True when the token is missing or within `skewMs` of expiry. */
  isExpired(skewMs = 15_000): boolean {
    if (!accessToken) return true;
    if (expiresAt === null) return false;
    return Date.now() + skewMs >= expiresAt;
  },

  getTenantSchoolId: (): string | null => tenantSchoolId,

  setTenantSchoolId(schoolId: string | null): void {
    tenantSchoolId = schoolId;
    try {
      if (schoolId) sessionStorage.setItem(TENANT_SCHOOL_STORAGE_KEY, schoolId);
      else sessionStorage.removeItem(TENANT_SCHOOL_STORAGE_KEY);
    } catch {
      // Best-effort persistence only — the in-memory value above is authoritative.
    }
  },

  /** Called when the session is gone for good, so the UI can react once. */
  onEnded(listener: (reason: SessionEnded) => void): () => void {
    endedListeners.add(listener);
    return () => endedListeners.delete(listener);
  },

  end(reason: SessionEnded): void {
    this.clearAccessToken();
    this.setTenantSchoolId(null);
    for (const listener of endedListeners) listener(reason);
  },
};
