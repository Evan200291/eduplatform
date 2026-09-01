import { useAuthStore } from './auth.store';
import type { Permission } from './permissions';

/**
 * Narrow selector hooks. Components should use these rather than subscribing to
 * the whole store, so a profile reload does not re-render every screen.
 */

export const useAuthStatus = () => useAuthStore((state) => state.status);
export const useProfile = () => useAuthStore((state) => state.profile);
export const useTenant = () => useAuthStore((state) => state.tenant);
export const useIsAuthenticated = () => useAuthStore((state) => state.status === 'authenticated');

/** True when the signed-in user holds the permission. False while unauthenticated. */
export function useCan(permission: Permission): boolean {
  return useAuthStore((state) => state.permissions.has(permission));
}

/** True when the user holds at least one of the permissions. */
export function useCanAny(permissions: readonly Permission[]): boolean {
  return useAuthStore((state) => state.permissions.hasAny(permissions));
}

/** True when the user holds every one of the permissions. */
export function useCanAll(permissions: readonly Permission[]): boolean {
  return useAuthStore((state) => state.permissions.hasAll(permissions));
}

/** Imperative access for event handlers, where a hook cannot be called. */
export const authActions = {
  bootstrap: () => useAuthStore.getState().bootstrap(),
  signIn: useAuthStore.getState().signIn,
  signOut: () => useAuthStore.getState().signOut(),
  reloadProfile: () => useAuthStore.getState().reloadProfile(),
  setTenantSchool: (schoolId: string | null) =>
    useAuthStore.getState().setTenantSchool(schoolId),
  can: (permission: Permission) => useAuthStore.getState().permissions.has(permission),
};
