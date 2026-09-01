// ─────────────────────────────────────────────────────────────────────────────
// Learning path and recommendation routes
// Two mounts, matching the two halves of blueprint 03/04:
//
//   /learning-paths    the plan itself — reading it, generating it, editing it,
//                      approving it, and the learner walking through it
//   /recommendations   the proposal queue and the teacher's decision on each
//
// Permission notes: a learner holds `learningpath.read` only. Every write needs
// `learningpath.write`, approval needs `learningpath.approve`, and a decision needs
// `recommendation.decide`. Starting and completing a step is a learner action, so it
// is guarded by `learningpath.read` and narrowed to the learner's own path inside
// the service — a learner cannot pass someone else's path id and be served.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getActor, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as items from './learning.items.service';
import * as paths from './learning.service';
import * as proposals from './recommendations.service';
import {
  activePathQuery,
  addPathItemSchema,
  approvePathSchema,
  createPathSchema,
  createRecommendationSchema,
  decideRecommendationSchema,
  generatePathSchema,
  pathItemListQuery,
  pathItemParams,
  pathListQuery,
  recommendationListQuery,
  removePathItemSchema,
  reorderPathItemsSchema,
  updatePathItemSchema,
  updatePathSchema,
} from './learning.validation';

// ── /learning-paths ─────────────────────────────────────────────────────────

const pathRouter = Router();
pathRouter.use(authenticate, tenantContext, requireSchoolContext);

pathRouter.get(
  '/',
  requirePermission('learningpath.read'),
  validate({ query: pathListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof paths.listPaths>[2];
    const { items: rows, totalItems } = await paths.listPaths(
      getActor(req),
      getSchoolId(req),
      query,
    );
    paginated(res, rows, query.page, query.pageSize, totalItems);
  }),
);

// Declared before `/:id` so "active" is never read as a path id.
pathRouter.get(
  '/active',
  requirePermission('learningpath.read'),
  validate({ query: activePathQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { subjectId: string; studentId?: string };
    ok(
      res,
      await paths.getActivePath(getActor(req), getSchoolId(req), query.subjectId, query.studentId),
    );
  }),
);

pathRouter.post(
  '/',
  requirePermission('learningpath.write'),
  validate({ body: createPathSchema }),
  asyncHandler(async (req, res) => {
    const path = await paths.createPath(getContext(req), getSchoolId(req), req.body);
    created(res, path, `/api/v1/learning-paths/${path.id}`);
  }),
);

/**
 * Blueprint 03: the plan follows the evidence. This lays out the subject from the
 * learner's current mastery picture; it does not mark anything as mastered itself.
 */
pathRouter.post(
  '/generate',
  requirePermission('learningpath.write'),
  validate({ body: generatePathSchema }),
  asyncHandler(async (req, res) => {
    const path = await paths.generatePath(getContext(req), getSchoolId(req), req.body);
    created(res, path, `/api/v1/learning-paths/${path.id}`);
  }),
);

pathRouter.get(
  '/:id',
  requirePermission('learningpath.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await paths.getPath(getActor(req), getSchoolId(req), req.params.id));
  }),
);

pathRouter.patch(
  '/:id',
  requirePermission('learningpath.write'),
  validate({ params: idParam, body: updatePathSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await paths.updatePath(getContext(req), getSchoolId(req), req.params.id, req.body));
  }),
);

pathRouter.post(
  '/:id/approve',
  requirePermission('learningpath.approve'),
  validate({ params: idParam, body: approvePathSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await paths.approvePath(getContext(req), getSchoolId(req), req.params.id, req.body.note),
    );
  }),
);

pathRouter.post(
  '/:id/archive',
  requirePermission('learningpath.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await paths.archivePath(getContext(req), getSchoolId(req), req.params.id));
  }),
);

/** Re-checks every locked step against the learner's current mastery. */
pathRouter.post(
  '/:id/refresh-unlocks',
  requirePermission('learningpath.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const unlocked = await items.refreshPathUnlocks(getSchoolId(req), req.params.id);
    ok(res, { unlocked });
  }),
);

// ── /learning-paths/:id/items ───────────────────────────────────────────────

pathRouter.get(
  '/:id/items',
  requirePermission('learningpath.read'),
  validate({ params: idParam, query: pathItemListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof items.listPathItems>[3];
    const { items: rows, totalItems } = await items.listPathItems(
      getActor(req),
      getSchoolId(req),
      req.params.id,
      query,
    );
    paginated(res, rows, query.page, query.pageSize, totalItems);
  }),
);

pathRouter.post(
  '/:id/items',
  requirePermission('learningpath.write'),
  validate({ params: idParam, body: addPathItemSchema }),
  asyncHandler(async (req, res) => {
    const item = await items.addPathItem(
      getContext(req),
      getSchoolId(req),
      req.params.id,
      req.body,
    );
    created(res, item, `/api/v1/learning-paths/${req.params.id}/items/${item.id}`);
  }),
);

// Before `/:id/items/:itemId` so "reorder" is never read as a step id.
pathRouter.put(
  '/:id/items/reorder',
  requirePermission('learningpath.write'),
  validate({ params: idParam, body: reorderPathItemsSchema }),
  asyncHandler(async (req, res) => {
    const { items: rows, totalItems } = await items.reorderPathItems(
      getContext(req),
      getSchoolId(req),
      req.params.id,
      req.body.items,
    );
    ok(res, rows, { totalItems });
  }),
);

pathRouter.patch(
  '/:id/items/:itemId',
  requirePermission('learningpath.write'),
  validate({ params: pathItemParams, body: updatePathItemSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await items.updatePathItem(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
        req.body,
      ),
    );
  }),
);

/**
 * Blueprint 04: "a teacher can insert or remove steps, and that is recorded." The
 * removal is soft and needs a reason, so the history still shows the step was
 * planned and why it was dropped.
 */
pathRouter.delete(
  '/:id/items/:itemId',
  requirePermission('learningpath.write'),
  validate({ params: pathItemParams, body: removePathItemSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await items.removePathItem(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
        req.body.reason,
      ),
    );
  }),
);

pathRouter.post(
  '/:id/items/:itemId/start',
  requirePermission('learningpath.read'),
  validate({ params: pathItemParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await items.startPathItem(
        getActor(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
      ),
    );
  }),
);

pathRouter.post(
  '/:id/items/:itemId/complete',
  requirePermission('learningpath.read'),
  validate({ params: pathItemParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await items.completePathItem(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
      ),
    );
  }),
);

// ── /recommendations ────────────────────────────────────────────────────────

const recommendationRouter = Router();
recommendationRouter.use(authenticate, tenantContext, requireSchoolContext);

recommendationRouter.get(
  '/',
  requirePermission('recommendation.read'),
  validate({ query: recommendationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof proposals.listRecommendations>[2];
    const { items: rows, totalItems } = await proposals.listRecommendations(
      getActor(req),
      getSchoolId(req),
      query,
    );
    paginated(res, rows, query.page, query.pageSize, totalItems);
  }),
);

/** The counts a teacher dashboard card needs, without pulling the whole queue. */
recommendationRouter.get(
  '/summary',
  requirePermission('recommendation.read'),
  asyncHandler(async (req, res) => {
    ok(res, await proposals.getQueueSummary(getSchoolId(req)));
  }),
);

recommendationRouter.post(
  '/',
  requirePermission('recommendation.decide'),
  validate({ body: createRecommendationSchema }),
  asyncHandler(async (req, res) => {
    const recommendation = await proposals.createRecommendation(
      getContext(req),
      getSchoolId(req),
      req.body,
    );
    created(res, recommendation, `/api/v1/recommendations/${recommendation.id}`);
  }),
);

recommendationRouter.get(
  '/:id',
  requirePermission('recommendation.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await proposals.getRecommendation(getActor(req), getSchoolId(req), req.params.id));
  }),
);

/**
 * Blueprint 04: "The system proposes. The teacher decides." Approve, modify, reject
 * or defer — each recorded with who decided and, for a rejection, why.
 */
recommendationRouter.post(
  '/:id/decide',
  requirePermission('recommendation.decide'),
  validate({ params: idParam, body: decideRecommendationSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await proposals.decideRecommendation(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

export { pathRouter as learningPathRouter, recommendationRouter };
