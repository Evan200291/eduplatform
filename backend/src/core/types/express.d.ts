// ─────────────────────────────────────────────────────────────────────────────
// Express request augmentation
// The middleware chain attaches the request context here. Handlers read these
// properties instead of re-deriving identity or tenancy, and the optionality is
// deliberate: only routes behind `authenticate` may assume `actor` is present,
// which is enforced by the `getActor()` helper rather than by a cast.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuthenticatedActor, RequestContext, TenantContext } from '../context';

declare global {
  namespace Express {
    interface Request {
      /** Set for every request by `requestContext` middleware. */
      context: RequestContext;
      /** Set by `authenticate` middleware once the access token is verified. */
      actor?: AuthenticatedActor;
      /** Set by `tenantContext` middleware after the actor is known. */
      tenant?: TenantContext;
    }
  }
}

export {};
