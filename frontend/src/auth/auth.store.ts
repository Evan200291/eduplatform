import { create } from 'zustand';
import { ApiError, refreshAccessToken, session } from '@/api';
import * as authApi from './auth.api';
import { EMPTY_PERMISSIONS, PermissionSet } from './permissions';
import type { ActorProfile, LoginCredentials, TenantContext } from './auth.types';

/**
 * `unknown` only exists before `bootstrap()` finishes. Guards must render a
 * loading state for it rather than redirecting, otherwise a hard refresh
 * bounces a signed-in user to the login screen.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  profile: ActorProfile | null;
  tenant: TenantContext | null;
  permissions: PermissionSet;
  /** Set when a session ended by itself, so the login screen can explain why. */
  endedReason: 'expired' | null;

  bootstrap: () => Promise<void>;
  signIn: (credentials: LoginCredentials) => Promise<ActorProfile>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  /** Platform staff only: act inside another school via the `X-Tenant-School` header. */
  setTenantSchool: (schoolId: string | null) => Promise<void>;
  clearEndedReason: () => void;
}

const anonymous = {
  status: 'anonymous' as AuthStatus,
  profile: null,
  tenant: null,
  permissions: EMPTY_PERMISSIONS,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  ...anonymous,
  status: 'unknown',
  endedReason: null,

  /**
   * Restores a session on page load. The access token is memory-only, so after a
   * refresh the only proof of identity is the httpOnly refresh cookie — try to
   * exchange it before deciding the visitor is anonymous.
   */
  async bootstrap() {
    if (get().status !== 'unknown') return;

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      set({ ...anonymous, endedReason: null });
      return;
    }

    try {
      const { profile, tenant } = await authApi.fetchProfile();
      set({
        status: 'authenticated',
        profile,
        tenant,
        permissions: new PermissionSet(profile.permissions),
        endedReason: null,
      });
    } catch {
      set({ ...anonymous });
    }
  },

  async signIn(credentials) {
    const result = await authApi.login(credentials);
    set({
      status: 'authenticated',
      profile: result.user,
      tenant: null,
      permissions: new PermissionSet(result.user.permissions),
      endedReason: null,
    });
    // The tenant block only comes back from /auth/me; fetch it without blocking
    // the caller's redirect.
    void get().reloadProfile();
    return result.user;
  },

  async signOut() {
    await authApi.logout();
  },

  async reloadProfile() {
    try {
      const { profile, tenant } = await authApi.fetchProfile();
      set({ profile, tenant, permissions: new PermissionSet(profile.permissions) });
    } catch (cause) {
      // A 401 is already handled by `session.end`; anything else is transient
      // and must not blank out a working session.
      if (cause instanceof ApiError && cause.status === 401) return;
    }
  },

  async setTenantSchool(schoolId) {
    session.setTenantSchoolId(schoolId);
    await get().reloadProfile();
  },

  clearEndedReason() {
    set({ endedReason: null });
  },
}));

/**
 * The transport layer can end a session at any moment (failed refresh, revoked
 * token). Mirroring that into the store here means no component has to poll.
 */
session.onEnded((reason) => {
  useAuthStore.setState({
    ...anonymous,
    endedReason: reason === 'expired' ? 'expired' : null,
  });
});
