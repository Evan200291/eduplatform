// ─────────────────────────────────────────────────────────────────────────────
// Feature guard
// Blueprint 06: "Hiding a feature in the interface is not enough. The server must
// refuse the action." This middleware is that refusal — the frontend also hides
// the control, but the two are independent and the server is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, RequestHandler } from 'express';
import { asyncHandler } from '../http/async-handler';
import { assertFeatureEnabled, type FeatureScope } from '../features/feature.service';
import { getActor } from './authenticate';

/** Builds the scope for a feature check from the request's own context. */
export function featureScopeFor(req: Request, extra: Partial<FeatureScope> = {}): FeatureScope {
  const actor = getActor(req);
  return {
    organizationId: req.tenant?.organizationId ?? actor.organizationId,
    schoolId: req.tenant?.schoolId ?? actor.schoolId,
    roleKey: actor.primaryRole,
    ...extra,
  };
}

export function requireFeature(featureKey: string): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    await assertFeatureEnabled(featureKey, featureScopeFor(req));
    next();
  });
}

/** Requires every listed feature. */
export function requireFeatures(...featureKeys: string[]): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const scope = featureScopeFor(req);
    for (const featureKey of featureKeys) {
      await assertFeatureEnabled(featureKey, scope);
    }
    next();
  });
}
