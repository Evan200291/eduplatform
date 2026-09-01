// ─────────────────────────────────────────────────────────────────────────────
// Permission guards
// Declared at the route so a reader can see the access rule without opening the
// service. Scope is still enforced inside the service — a guard answers "may
// this role do this at all", never "may they do it to this record".
// ─────────────────────────────────────────────────────────────────────────────

import type { RequestHandler } from 'express';
import { getActor } from './authenticate';
import { assertAnyPermission, assertPermission } from '../rbac/authorize';
import { forbidden, tenantContextRequired } from '../http/errors';
import type { Permission } from '../rbac/permissions';

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    assertPermission(getActor(req), permission);
    next();
  };
}

/** Passes when the actor holds at least one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    assertAnyPermission(getActor(req), permissions);
    next();
  };
}

/** Rejects a request that has no active school context. */
export const requireSchoolContext: RequestHandler = (req, _res, next) => {
  getActor(req);
  if (!req.tenant?.schoolId) throw tenantContextRequired();
  next();
};

/** Restricts a route to platform-level staff. */
export const requirePlatformStaff: RequestHandler = (req, _res, next) => {
  const actor = getActor(req);
  if (!actor.isPlatformStaff) {
    throw forbidden('This endpoint is only available to platform staff.');
  }
  next();
};
