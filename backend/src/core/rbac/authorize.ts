// ─────────────────────────────────────────────────────────────────────────────
// Authorization checks
// Holding a permission is only half of an access decision. The other half is
// scope: blueprint 05 says "a teacher sees their classes, a school admin sees
// their school, platform staff see the platform". These helpers make the scope
// half explicit at every call site, and they throw rather than return false so a
// forgotten `if` cannot become a data leak.
//
// Every function here is pure. Checks that need to read the database (does this
// teacher actually teach this student?) live in ./scope.service.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey, RoleScopeType } from '@prisma/client';
import type { ActorContext, AuthenticatedActor, TenantContext } from '../context';
import { forbidden, tenantContextRequired, tenantMismatch } from '../http/errors';
import type { Permission } from './permissions';

/**
 * Deterministic join of a role grant's scope ids, stored on
 * `UserRoleAssignment.scopeKey`. The unique index uses this single column
 * because a composite index over five id columns exceeds InnoDB's key limit
 * under utf8mb4 — see backend/prisma/schema/21-identity-access.prisma.
 */
export function roleScopeKey(scope: {
  schoolId?: string | null;
  gradeId?: string | null;
  classId?: string | null;
  subjectId?: string | null;
}): string {
  return [scope.schoolId ?? '', scope.gradeId ?? '', scope.classId ?? '', scope.subjectId ?? ''].join(
    ':',
  );
}

export function hasPermission(actor: AuthenticatedActor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export function hasAnyPermission(
  actor: AuthenticatedActor,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => actor.permissions.has(permission));
}

export function hasAllPermissions(
  actor: AuthenticatedActor,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => actor.permissions.has(permission));
}

export function assertPermission(actor: AuthenticatedActor, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw forbidden('You do not have permission to do that.', {
      details: { requiredPermission: permission },
    });
  }
}

export function assertAnyPermission(
  actor: AuthenticatedActor,
  permissions: readonly Permission[],
): void {
  if (!hasAnyPermission(actor, permissions)) {
    throw forbidden('You do not have permission to do that.', {
      details: { requiredAnyOf: permissions },
    });
  }
}

export function isPlatformStaff(actor: AuthenticatedActor): boolean {
  return actor.isPlatformStaff;
}

export function hasRole(actor: AuthenticatedActor, roleKey: RoleKey): boolean {
  return actor.roles.some((grant) => grant.roleKey === roleKey);
}

/** True when the actor's only meaningful role is STUDENT. */
export function isStudent(actor: AuthenticatedActor): boolean {
  return actor.primaryRole === RoleKey.STUDENT;
}

// ── Tenant scope ────────────────────────────────────────────────────────────

/**
 * The set of school ids this actor may act inside based on role grants alone.
 * A `null` return means "not limited by grants" — platform staff — and callers
 * must still respect the active tenant context.
 */
export function grantedSchoolIds(actor: AuthenticatedActor): string[] | null {
  if (actor.isPlatformStaff) return null;
  const ids = new Set<string>();
  if (actor.schoolId) ids.add(actor.schoolId);
  for (const grant of actor.roles) {
    if (grant.schoolId) ids.add(grant.schoolId);
  }
  return [...ids];
}

export function canAccessSchool(actor: AuthenticatedActor, schoolId: string): boolean {
  const granted = grantedSchoolIds(actor);
  if (granted === null) return true;
  return granted.includes(schoolId);
}

export function canAccessOrganization(actor: AuthenticatedActor, organizationId: string): boolean {
  if (actor.isPlatformStaff) return true;
  if (actor.organizationId === organizationId) return true;
  return actor.roles.some(
    (grant) =>
      grant.scopeType === RoleScopeType.ORGANIZATION && grant.organizationId === organizationId,
  );
}

/** Returns the active school id, or throws if the request has no school context. */
export function requireSchoolId(tenant: TenantContext | undefined): string {
  if (!tenant?.schoolId) throw tenantContextRequired();
  return tenant.schoolId;
}

/**
 * Guards a record fetched from the database. Every service that reads a
 * school-owned row calls this before returning it, so an id from a different
 * tenant produces a 403 instead of a cross-tenant read.
 */
export function assertSameSchool(tenant: TenantContext | undefined, recordSchoolId: string | null): void {
  const activeSchoolId = requireSchoolId(tenant);
  if (recordSchoolId !== null && recordSchoolId !== activeSchoolId) throw tenantMismatch();
}

/** As `assertSameSchool`, but allows platform-owned rows where `schoolId` is null. */
export function assertSameSchoolOrPlatform(
  tenant: TenantContext | undefined,
  recordSchoolId: string | null,
): void {
  if (recordSchoolId === null) return;
  assertSameSchool(tenant, recordSchoolId);
}

// ── Teacher scope ───────────────────────────────────────────────────────────

/** Class ids the actor teaches or is enrolled in, from role grants. */
export function grantedClassIds(actor: AuthenticatedActor): string[] {
  return [...new Set(actor.roles.map((grant) => grant.classId).filter((id): id is string => !!id))];
}

export function grantedGradeIds(actor: AuthenticatedActor): string[] {
  return [...new Set(actor.roles.map((grant) => grant.gradeId).filter((id): id is string => !!id))];
}

export function grantedSubjectIds(actor: AuthenticatedActor): string[] {
  return [
    ...new Set(actor.roles.map((grant) => grant.subjectId).filter((id): id is string => !!id)),
  ];
}

/**
 * True when the actor can read data for the whole school rather than only for
 * the classes they are attached to.
 */
export function hasSchoolWideRead(actor: AuthenticatedActor): boolean {
  return (
    actor.permissions.has('progress.read.school') || actor.permissions.has('report.read.school')
  );
}

// ── Self-access ─────────────────────────────────────────────────────────────

export function isSelf(actor: AuthenticatedActor, userId: string): boolean {
  return actor.userId === userId;
}

/**
 * Allows an action on `userId` when the actor is that user, or holds the given
 * permission for other people. Used by profile, notification and progress reads.
 */
export function assertSelfOr(
  actor: AuthenticatedActor,
  userId: string,
  permission: Permission,
): void {
  if (isSelf(actor, userId)) return;
  assertPermission(actor, permission);
}

/** Convenience wrapper for handlers that already destructured the context. */
export function assertContextPermission(context: ActorContext, permission: Permission): void {
  assertPermission(context.actor, permission);
}
