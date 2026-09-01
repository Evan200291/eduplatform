/**
 * Identity, session and permission gating.
 *
 * Import from `@/auth` rather than the individual files.
 *
 * The shape of the layer:
 *  - `auth.types.ts`        wire types, mirrored from the backend
 *  - `auth.api.ts`          the six endpoints, and nothing else
 *  - `permission-catalog.ts` the generated list of permission strings
 *  - `permissions.ts`       `PermissionSet` + which surface a role starts in
 *  - `auth.store.ts`        the one source of truth for "who is signed in"
 *  - `use-auth.ts`          narrow selector hooks + imperative `authActions`
 */

export * as authApi from './auth.api';
export { useAuthStore, type AuthStatus } from './auth.store';
export {
  EMPTY_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_SET,
  PermissionSet,
  accessibleSurfaces,
  homeSurfaceFor,
  type Permission,
} from './permissions';
export {
  authActions,
  useAuthStatus,
  useCan,
  useCanAll,
  useCanAny,
  useIsAuthenticated,
  useProfile,
  useTenant,
} from './use-auth';
export type {
  AcceptInvitationInput,
  ActiveSession,
  ActorProfile,
  AuthSessionResponse,
  ChangePasswordInput,
  LoginCredentials,
  OrganizationRef,
  RoleAssignment,
  SchoolRef,
  TenantContext,
  TenantStatus,
} from './auth.types';
