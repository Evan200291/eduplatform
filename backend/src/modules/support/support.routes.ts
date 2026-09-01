// ─────────────────────────────────────────────────────────────────────────────
// Support routes (blueprint 13)
// One router, two audiences. A teacher or parent needs `support.create` and
// `support.read.own`, both of which sit in the self-service bundle every signed-in
// user carries — raising a request must never itself require a permission grant.
// Everything that changes the state of someone else's request requires
// `support.respond` or `support.assign`.
//
// `/policies` is open to any authenticated user on purpose: the blueprint asks
// for the owner, priority, target and closure criteria per category, and the
// person raising the request is the one who most needs to see them.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext } from '../../core/middleware/authenticate';
import { requireAnyPermission, requirePermission } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { supportPolicies, FIRST_RESPONSE_HOURS, RESOLUTION_HOURS } from './support.policy';
import * as support from './support.service';
import * as workflow from './support.workflow';
import {
  assignSchema,
  closeSchema,
  createSupportRequestSchema,
  escalateSchema,
  resolveSchema,
  satisfactionSchema,
  statusChangeSchema,
  supportListQuery,
  supportMessageListQuery,
  supportMessageSchema,
  triageSchema,
} from './support.validation';

const router = Router();
router.use(authenticate, tenantContext);

/** The category table: owner, priority floor, targets, escalation, closure. */
router.get(
  '/policies',
  asyncHandler(async (_req, res) => {
    ok(res, {
      categories: supportPolicies(),
      firstResponseHours: FIRST_RESPONSE_HOURS,
      resolutionHours: RESOLUTION_HOURS,
    });
  }),
);

router.post(
  '/requests',
  requirePermission('support.create'),
  validate({ body: createSupportRequestSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof support.createRequest>[1];
    const view = await support.createRequest(getContext(req), body);
    created(res, view, `/api/v1/support/requests/${view.request.id}`);
  }),
);

router.get(
  '/requests',
  requireAnyPermission('support.read.own', 'support.read.all'),
  validate({ query: supportListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof support.listRequests>[1];
    const { items, totalItems } = await support.listRequests(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Queue counters for the support dashboard, scoped exactly like the list. */
router.get(
  '/summary',
  requireAnyPermission('support.read.own', 'support.read.all'),
  asyncHandler(async (req, res) => {
    ok(res, await support.requestSummary(getContext(req)));
  }),
);

router.get(
  '/requests/:id',
  requireAnyPermission('support.read.own', 'support.read.all'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await support.getRequest(getContext(req), req.params.id));
  }),
);

// ── Conversation ────────────────────────────────────────────────────────────

router.get(
  '/requests/:id/messages',
  requireAnyPermission('support.read.own', 'support.read.all'),
  validate({ params: idParam, query: supportMessageListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof support.listMessages>[2];
    const { items, totalItems } = await support.listMessages(
      getContext(req),
      req.params.id,
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/**
 * No permission middleware here beyond authentication: the service decides,
 * because the requester themselves is allowed to reply to their own request
 * while an agent needs `support.respond` to reply to anyone else's.
 */
router.post(
  '/requests/:id/messages',
  validate({ params: idParam, body: supportMessageSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof support.addMessage>[2];
    created(res, await support.addMessage(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/requests/:id/satisfaction',
  validate({ params: idParam, body: satisfactionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof support.recordSatisfaction>[2];
    ok(res, await support.recordSatisfaction(getContext(req), req.params.id, body));
  }),
);

// ── Agent workflow ──────────────────────────────────────────────────────────

router.post(
  '/requests/:id/triage',
  requirePermission('support.respond'),
  validate({ params: idParam, body: triageSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.triageRequest>[2];
    ok(res, await workflow.triageRequest(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/requests/:id/assign',
  requirePermission('support.assign'),
  validate({ params: idParam, body: assignSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.assignRequest>[2];
    ok(res, await workflow.assignRequest(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/requests/:id/status',
  requirePermission('support.respond'),
  validate({ params: idParam, body: statusChangeSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.changeStatus>[2];
    ok(res, await workflow.changeStatus(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/requests/:id/escalate',
  requirePermission('support.respond'),
  validate({ params: idParam, body: escalateSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.escalateRequest>[2];
    ok(res, await workflow.escalateRequest(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/requests/:id/resolve',
  requirePermission('support.respond'),
  validate({ params: idParam, body: resolveSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.resolveRequest>[2];
    ok(res, await workflow.resolveRequest(getContext(req), req.params.id, body));
  }),
);

/** Either side may close; the service enforces which one may close when. */
router.post(
  '/requests/:id/close',
  validate({ params: idParam, body: closeSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof workflow.closeRequest>[2];
    ok(res, await workflow.closeRequest(getContext(req), req.params.id, body));
  }),
);

export const supportRouter = router;
