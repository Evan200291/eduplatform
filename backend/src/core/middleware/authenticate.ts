// ─────────────────────────────────────────────────────────────────────────────
// Authentication middleware
// Verifies the bearer access token, reloads the actor (roles and permissions are
// never trusted from the token) and attaches it to the request.
//
// `getActor` / `getContext` are the only sanctioned way to read the actor in a
// handler: they throw a 401 if the route was mounted without `authenticate`,
// which turns a wiring mistake into an immediate, loud failure.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, RequestHandler } from 'express';
import type { ActorContext, AuthenticatedActor, SchoolActorContext } from '../context';
import { asyncHandler } from '../http/async-handler';
import { tenantContextRequired, unauthenticated } from '../http/errors';
import { loadActor } from '../auth/session.service';
import { bearerToken, verifyAccessToken } from '../auth/tokens';

export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw unauthenticated();

  const claims = verifyAccessToken(token);
  req.actor = await loadActor(claims.sub, claims.sid);
  next();
});

/**
 * Attaches the actor when a token is present but does not require one. Used by
 * endpoints that behave differently for a signed-in user, such as the
 * tenant-aware login screen that resolves branding for an anonymous visitor.
 */
export const authenticateOptional: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) return next();
  try {
    const claims = verifyAccessToken(token);
    req.actor = await loadActor(claims.sub, claims.sid);
  } catch {
    // A bad token on an optional route is treated as "not signed in".
  }
  next();
});

export function getActor(req: Request): AuthenticatedActor {
  if (!req.actor) throw unauthenticated();
  return req.actor;
}

export function getContext(req: Request): ActorContext {
  return {
    actor: getActor(req),
    tenant: req.tenant ?? { organizationId: null, schoolId: null, isImpersonatedTenant: false },
    request: req.context,
  };
}

/** As `getContext`, narrowed to a request that is operating inside a school. */
export function getSchoolContext(req: Request): SchoolActorContext {
  const context = getContext(req);
  if (!context.tenant.schoolId) throw tenantContextRequired();
  return context as SchoolActorContext;
}

/** The active school id, or a 400 when the request has no school context. */
export function getSchoolId(req: Request): string {
  const schoolId = req.tenant?.schoolId;
  if (!schoolId) throw tenantContextRequired();
  return schoolId;
}
