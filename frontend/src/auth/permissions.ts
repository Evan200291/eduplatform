import type { RoleKey, Surface } from '@/types/enums';
import type { ActorProfile } from './auth.types';
import type { Permission } from './permission-catalog';

/**
 * Permission gating.
 *
 * The backend returns a flat, sorted list of permission strings on the profile
 * (`GET /auth/me` → `permissions`). Gating is always a membership test against
 * that list, never a role-name check: the same role can be entitled differently
 * per tenant, so `primaryRole === 'TEACHER'` proves nothing about access.
 *
 * Permission strings are typed against the catalogue, so a typo fails the build
 * rather than silently hiding a feature from everyone.
 */
export type { Permission } from './permission-catalog';
export { PERMISSIONS, PERMISSION_SET } from './permission-catalog';

/** A fast, immutable view over one profile's granted permissions. */
export class PermissionSet {
  private readonly values: ReadonlySet<string>;

  constructor(permissions: readonly string[] = []) {
    this.values = new Set(permissions);
  }

  has(permission: Permission): boolean {
    return this.values.has(permission);
  }

  hasAny(permissions: readonly Permission[]): boolean {
    return permissions.some((permission) => this.values.has(permission));
  }

  hasAll(permissions: readonly Permission[]): boolean {
    return permissions.every((permission) => this.values.has(permission));
  }

  get size(): number {
    return this.values.size;
  }
}

export const EMPTY_PERMISSIONS = new PermissionSet();

/**
 * Which route group a role lands in after sign-in.
 *
 * Parents use the student surface: they see their child's progress and
 * notifications read-only, rather than the platform growing a fourth app.
 */
const HOME_SURFACE: Record<RoleKey, Surface> = {
  PLATFORM_OWNER: 'admin',
  PLATFORM_OPS_ADMIN: 'admin',
  SCHOOL_ADMIN: 'admin',
  BILLING_ADMIN: 'admin',
  SUPPORT_AGENT: 'admin',
  REPORT_VIEWER: 'admin',
  TEACHER: 'teacher',
  CURRICULUM_MANAGER: 'teacher',
  CONTENT_REVIEWER: 'teacher',
  STUDENT: 'student',
  PARENT: 'student',
};

export function homeSurfaceFor(profile: ActorProfile): Surface {
  return HOME_SURFACE[profile.primaryRole] ?? 'student';
}

/** Every surface the user may open, home first. */
export function accessibleSurfaces(profile: ActorProfile): Surface[] {
  const home = homeSurfaceFor(profile);
  const others = new Set<Surface>();

  for (const role of profile.roles) {
    const surface = HOME_SURFACE[role.roleKey];
    if (surface && surface !== home) others.add(surface);
  }

  return [home, ...others];
}
