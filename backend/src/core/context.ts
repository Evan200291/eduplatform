// ─────────────────────────────────────────────────────────────────────────────
// Request context
// Blueprint 06: "Access is denied unless explicitly allowed by role and active
// tenant context." Everything an authorization decision needs lives on this
// object, is assembled once per request by the middleware chain, and is never
// re-read from the client afterwards.
//
// Nothing here is taken from a request body. The actor comes from a verified
// access token; the tenant comes from the actor's own record plus, for platform
// staff only, an explicit `X-Tenant-School` header.
// ─────────────────────────────────────────────────────────────────────────────

import type { RoleKey, RoleScopeType } from '@prisma/client';
import type { Permission } from './rbac/permissions';

/** One role grant, narrowed to what an authorization check needs. */
export interface ActorRoleScope {
  roleKey: RoleKey;
  scopeType: RoleScopeType;
  organizationId: string | null;
  schoolId: string | null;
  gradeId: string | null;
  classId: string | null;
  subjectId: string | null;
}

export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  primaryRole: RoleKey;
  /** Home tenant recorded on the user row. Platform staff have both as null. */
  organizationId: string | null;
  schoolId: string | null;
  displayName: string;
  email: string | null;
  roles: ActorRoleScope[];
  /** Flattened permission set, computed once per request. */
  permissions: ReadonlySet<Permission>;
  /** True when any grant is scoped at PLATFORM level. */
  isPlatformStaff: boolean;
}

/**
 * The tenant the request is acting inside. `schoolId` is null only for
 * platform-level endpoints and for organization-wide reads.
 */
export interface TenantContext {
  organizationId: string | null;
  schoolId: string | null;
  /** True when platform staff are acting inside a tenant they do not belong to. */
  isImpersonatedTenant: boolean;
}

/** Ids of the class/grade/subject a teacher is scoped to, cached per request. */
export interface TeacherScope {
  classIds: string[];
  gradeIds: string[];
  subjectIds: string[];
}

export interface RequestContext {
  requestId: string;
  startedAt: number;
  ipAddress?: string;
  userAgent?: string;
}

/** Assembled per request; the shape services receive instead of raw Express. */
export interface ActorContext {
  actor: AuthenticatedActor;
  tenant: TenantContext;
  request: RequestContext;
}

/**
 * Narrows an `ActorContext` to one where `schoolId` is guaranteed. Route
 * handlers that operate on school-owned data call `requireSchool()` from
 * ./middleware/tenant-context so this type is safe to assume downstream.
 */
export interface SchoolActorContext extends ActorContext {
  tenant: TenantContext & { schoolId: string };
}
