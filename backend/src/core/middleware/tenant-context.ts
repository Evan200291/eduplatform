// ─────────────────────────────────────────────────────────────────────────────
// Tenant context middleware
// Blueprint 06: "Access is denied unless explicitly allowed by role and active
// tenant context." The active tenant is derived from the actor's own record, not
// from the request, with exactly one exception: platform staff may target a
// tenant explicitly via `X-Tenant-School` / `X-Tenant-Organization`, which is
// flagged as impersonation and audited.
//
// A suspended or archived tenant is closed to its own members but remains
// readable by platform staff, because support and billing still need it.
// ─────────────────────────────────────────────────────────────────────────────

import { TenantStatus } from '@prisma/client';
import type { RequestHandler } from 'express';
import type { AuthenticatedActor, TenantContext } from '../context';
import { asyncHandler } from '../http/async-handler';
import { forbidden, notFound, tenantMismatch } from '../http/errors';
import { prisma } from '../prisma';
import { canAccessOrganization, canAccessSchool } from '../rbac/authorize';

const SCHOOL_HEADER = 'x-tenant-school';
const ORGANIZATION_HEADER = 'x-tenant-organization';

function headerValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 40 ? trimmed : null;
}

/**
 * Requires `authenticate` to have run first. Attaches `req.tenant`.
 *
 * Order matters: the actor is resolved from the token, the requested tenant is
 * then checked against the actor's grants, and only then is it accepted.
 */
export const tenantContext: RequestHandler = asyncHandler(async (req, _res, next) => {
  const actor = req.actor;
  if (!actor) return next();

  const requestedSchoolId = headerValue(req.headers[SCHOOL_HEADER]);
  const requestedOrganizationId = headerValue(req.headers[ORGANIZATION_HEADER]);

  req.tenant = await resolveTenant(actor, requestedSchoolId, requestedOrganizationId);
  next();
});

export async function resolveTenant(
  actor: AuthenticatedActor,
  requestedSchoolId: string | null,
  requestedOrganizationId: string | null,
): Promise<TenantContext> {
  // ── Non-platform actors are pinned to their own tenant ────────────────────
  if (!actor.isPlatformStaff) {
    if (requestedSchoolId && requestedSchoolId !== actor.schoolId) throw tenantMismatch();
    if (requestedOrganizationId && requestedOrganizationId !== actor.organizationId) {
      throw tenantMismatch();
    }

    if (actor.schoolId) await assertTenantOpen(actor.schoolId);

    return {
      organizationId: actor.organizationId,
      schoolId: actor.schoolId,
      isImpersonatedTenant: false,
    };
  }

  // ── Platform staff may target a tenant explicitly ─────────────────────────
  if (requestedSchoolId) {
    const school = await prisma.school.findUnique({
      where: { id: requestedSchoolId },
      select: { id: true, organizationId: true },
    });
    if (!school) throw notFound('School');
    if (!canAccessSchool(actor, school.id)) throw forbidden('That tenant is out of your scope.');

    return {
      organizationId: school.organizationId,
      schoolId: school.id,
      isImpersonatedTenant: actor.schoolId !== school.id,
    };
  }

  if (requestedOrganizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: requestedOrganizationId },
      select: { id: true },
    });
    if (!organization) throw notFound('Organization');
    if (!canAccessOrganization(actor, organization.id)) {
      throw forbidden('That tenant is out of your scope.');
    }

    return {
      organizationId: organization.id,
      schoolId: null,
      isImpersonatedTenant: actor.organizationId !== organization.id,
    };
  }

  return {
    organizationId: actor.organizationId,
    schoolId: actor.schoolId,
    isImpersonatedTenant: false,
  };
}

/**
 * Blueprint 05: a suspended tenant loses access rather than losing its data.
 * The organization is checked as well as the school, because suspending a
 * multi-school customer must close every school under it.
 */
async function assertTenantOpen(schoolId: string): Promise<void> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      status: true,
      organization: { select: { status: true } },
    },
  });

  if (!school) throw notFound('School');

  const closed: TenantStatus[] = [TenantStatus.SUSPENDED, TenantStatus.ARCHIVED];
  if (closed.includes(school.status)) {
    throw forbidden('This school is currently suspended. Please contact your administrator.', {
      details: { tenantStatus: school.status },
    });
  }
  if (closed.includes(school.organization.status)) {
    throw forbidden('This organization is currently suspended.', {
      details: { tenantStatus: school.organization.status },
    });
  }
}
