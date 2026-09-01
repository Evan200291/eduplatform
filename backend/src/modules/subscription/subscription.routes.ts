// ─────────────────────────────────────────────────────────────────────────────
// Subscription and entitlement routes (blueprint 09 / 06)
// Two routers because the audiences differ. `/subscriptions` is commercial: a
// billing admin or platform staff, and `subscription.write` is deliberately not
// granted to a school admin — a school cannot upgrade its own plan by pressing a
// button. `/entitlements` is configuration: a school admin turning features on
// and off inside what their plan already includes.
//
// Every entitlement write returns the resulting decision, so the UI can show
// "saved, but your plan does not include this" instead of a silent no-op.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, noContent, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { planCatalogue, planPackaging } from './subscription.plans';
import * as subscriptions from './subscription.service';
import * as entitlements from './entitlements.service';
import {
  cancelSubscriptionSchema,
  createSubscriptionSchema,
  entitlementListQuery,
  explainFeaturesSchema,
  featureCatalogueQuery,
  renewSubscriptionSchema,
  setEntitlementSchema,
  subscriptionListQuery,
  updateSubscriptionSchema,
} from './subscription.validation';

// ── Subscriptions ───────────────────────────────────────────────────────────

const subscriptionRouterInstance = Router();
subscriptionRouterInstance.use(authenticate, tenantContext);

/**
 * The packaging catalogue. Read-only and identical for everyone, because the
 * upgrade conversation needs the school to see what the next plan contains.
 */
subscriptionRouterInstance.get(
  '/plans',
  requirePermission('subscription.read'),
  asyncHandler(async (_req, res) => {
    ok(res, { plans: planCatalogue() });
  }),
);

subscriptionRouterInstance.get(
  '/current',
  requirePermission('subscription.read'),
  requireSchoolContext,
  asyncHandler(async (req, res) => {
    const detail = await subscriptions.currentSubscription(getContext(req), getSchoolId(req));
    // No subscription is a legitimate state, not a 404: a school in onboarding
    // has none yet, and the admin panel needs to say so calmly.
    ok(res, detail ?? { subscription: null, state: null, plan: null, gatedFeatures: [], seats: null });
  }),
);

subscriptionRouterInstance.get(
  '/current/seats',
  requirePermission('subscription.read'),
  requireSchoolContext,
  asyncHandler(async (req, res) => {
    const schoolId = getSchoolId(req);
    const detail = await subscriptions.currentSubscription(getContext(req), schoolId);
    ok(res, {
      seats: detail?.seats ?? (await subscriptions.seatUsage(schoolId, 0, 0)),
      licensed: !!detail,
    });
  }),
);

subscriptionRouterInstance.get(
  '/',
  requirePermission('subscription.read'),
  validate({ query: subscriptionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof subscriptions.listSubscriptions>[1];
    const { items, totalItems } = await subscriptions.listSubscriptions(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

subscriptionRouterInstance.post(
  '/',
  requirePermission('subscription.write'),
  validate({ body: createSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof subscriptions.createSubscription>[1];
    const detail = await subscriptions.createSubscription(getContext(req), body);
    created(res, detail, `/api/v1/subscriptions/${detail.subscription.id}`);
  }),
);

subscriptionRouterInstance.get(
  '/:id',
  requirePermission('subscription.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await subscriptions.getSubscription(getContext(req), req.params.id));
  }),
);

subscriptionRouterInstance.get(
  '/:id/packaging',
  requirePermission('subscription.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const detail = await subscriptions.getSubscription(getContext(req), req.params.id);
    ok(res, planPackaging(detail.subscription.plan));
  }),
);

subscriptionRouterInstance.patch(
  '/:id',
  requirePermission('subscription.write'),
  validate({ params: idParam, body: updateSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof subscriptions.updateSubscription>[2];
    ok(res, await subscriptions.updateSubscription(getContext(req), req.params.id, body));
  }),
);

subscriptionRouterInstance.post(
  '/:id/cancel',
  requirePermission('subscription.write'),
  validate({ params: idParam, body: cancelSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof subscriptions.cancelSubscription>[2];
    ok(res, await subscriptions.cancelSubscription(getContext(req), req.params.id, body));
  }),
);

subscriptionRouterInstance.post(
  '/:id/renew',
  requirePermission('subscription.write'),
  validate({ params: idParam, body: renewSubscriptionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof subscriptions.renewSubscription>[2];
    ok(res, await subscriptions.renewSubscription(getContext(req), req.params.id, body));
  }),
);

export const subscriptionRouter = subscriptionRouterInstance;

// ── Entitlements ────────────────────────────────────────────────────────────

const entitlementRouterInstance = Router();
entitlementRouterInstance.use(authenticate, tenantContext);

/** Platform staff outside a tenant read the platform-level rows; hence null. */
function schoolScope(req: Request): string | null {
  return getContext(req).tenant.schoolId;
}

entitlementRouterInstance.get(
  '/features',
  requirePermission('entitlement.read'),
  validate({ query: featureCatalogueQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof entitlements.featureCatalogue>[2];
    ok(res, {
      features: await entitlements.featureCatalogue(getContext(req), schoolScope(req), query),
    });
  }),
);

entitlementRouterInstance.post(
  '/explain',
  requirePermission('entitlement.read'),
  validate({ body: explainFeaturesSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof entitlements.explainFeatures>[2];
    ok(res, {
      features: await entitlements.explainFeatures(getContext(req), schoolScope(req), body),
    });
  }),
);

entitlementRouterInstance.get(
  '/',
  requirePermission('entitlement.read'),
  validate({ query: entitlementListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof entitlements.listEntitlements>[2];
    const { items, totalItems } = await entitlements.listEntitlements(
      getContext(req),
      schoolScope(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

entitlementRouterInstance.put(
  '/',
  requirePermission('entitlement.write'),
  validate({ body: setEntitlementSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof entitlements.setEntitlement>[1];
    ok(res, await entitlements.setEntitlement(getContext(req), body));
  }),
);

entitlementRouterInstance.delete(
  '/:id',
  requirePermission('entitlement.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await entitlements.deleteEntitlement(getContext(req), req.params.id);
    noContent(res);
  }),
);

export const entitlementRouter = entitlementRouterInstance;
