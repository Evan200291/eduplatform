// ─────────────────────────────────────────────────────────────────────────────
// Assessment routes
// Four mounts, because three different audiences use this module:
//
//   /assessments           authoring and lifecycle (curriculum staff)
//   /assessment-attempts   delivery: start, next item, answer, submit (learner)
//   /assessment-responses  the evidence trail and teacher re-marking
//   /topic-evaluations     the inference trail and current mastery (teacher)
//
// Permission notes: a learner holds `assessment.read`, `assessment.attempt.start`
// and `assessment.attempt.read` but never `assessment.write`; re-marking needs
// `assessment.response.override`, which only staff hold. Scoping to "my own
// attempts" is decided inside the service from the actor's grants, never from a
// query parameter.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentStatus } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getActor, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as attempts from './assessment.attempts.service';
import * as evidence from './assessment.responses.service';
import * as assessments from './assessment.service';
import {
  abandonAttemptSchema,
  addAssessmentItemSchema,
  assessmentListQuery,
  attemptListQuery,
  createAssessmentSchema,
  evaluationListQuery,
  itemParams,
  overrideResponseSchema,
  publishAssessmentSchema,
  responseListQuery,
  setAssessmentItemsSchema,
  startAttemptSchema,
  submitAttemptSchema,
  submitResponseSchema,
  updateAssessmentItemSchema,
  updateAssessmentSchema,
} from './assessment.validation';

// ── /assessments ────────────────────────────────────────────────────────────

const definitions = Router();
definitions.use(authenticate, tenantContext, requireSchoolContext);

definitions.get(
  '/',
  requirePermission('assessment.read'),
  validate({ query: assessmentListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof assessments.listAssessments>[1];
    const { items, totalItems } = await assessments.listAssessments(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

definitions.post(
  '/',
  requirePermission('assessment.write'),
  validate({ body: createAssessmentSchema }),
  asyncHandler(async (req, res) => {
    const assessment = await assessments.createAssessment(getContext(req), getSchoolId(req), req.body);
    created(res, assessment, `/api/v1/assessments/${assessment.id}`);
  }),
);

definitions.get(
  '/:id',
  requirePermission('assessment.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await assessments.getAssessment(getSchoolId(req), req.params.id));
  }),
);

definitions.patch(
  '/:id',
  requirePermission('assessment.write'),
  validate({ params: idParam, body: updateAssessmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await assessments.updateAssessment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

/**
 * Publishing checks that every item points at published content, so the delivery
 * path never has to discover unpublished content mid-attempt.
 */
definitions.post(
  '/:id/publish',
  requirePermission('assessment.publish'),
  validate({ params: idParam, body: publishAssessmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await assessments.publishAssessment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

/** Lifecycle moves other than publishing: review, revise, archive. */
for (const [path, status, permission] of [
  ['/:id/submit-for-review', ContentStatus.IN_REVIEW, 'assessment.write'],
  ['/:id/approve', ContentStatus.APPROVED, 'assessment.publish'],
  ['/:id/revise', ContentStatus.REVISED, 'assessment.write'],
  ['/:id/archive', ContentStatus.ARCHIVED, 'assessment.publish'],
] as const) {
  definitions.post(
    path,
    requirePermission(permission),
    validate({ params: idParam, body: publishAssessmentSchema }),
    asyncHandler(async (req, res) => {
      ok(
        res,
        await assessments.setAssessmentStatus(
          getContext(req),
          getSchoolId(req),
          req.params.id,
          status,
          req.body.reason,
        ),
      );
    }),
  );
}

// ── /assessments/:id/items ──────────────────────────────────────────────────

definitions.get(
  '/:id/items',
  requirePermission('assessment.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await assessments.listAssessmentItems(getSchoolId(req), req.params.id));
  }),
);

definitions.post(
  '/:id/items',
  requirePermission('assessment.write'),
  validate({ params: idParam, body: addAssessmentItemSchema }),
  asyncHandler(async (req, res) => {
    const item = await assessments.addAssessmentItem(
      getContext(req),
      getSchoolId(req),
      req.params.id,
      req.body,
    );
    created(res, item, `/api/v1/assessments/${req.params.id}/items/${item.id}`);
  }),
);

definitions.put(
  '/:id/items',
  requirePermission('assessment.write'),
  validate({ params: idParam, body: setAssessmentItemsSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await assessments.setAssessmentItems(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.items,
      ),
    );
  }),
);

definitions.patch(
  '/:id/items/:itemId',
  requirePermission('assessment.write'),
  validate({ params: itemParams, body: updateAssessmentItemSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await assessments.updateAssessmentItem(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
        req.body,
      ),
    );
  }),
);

definitions.delete(
  '/:id/items/:itemId',
  requirePermission('assessment.write'),
  validate({ params: itemParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await assessments.removeAssessmentItem(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.itemId,
      ),
    );
  }),
);

/** Starting an attempt lives under the assessment it belongs to. */
definitions.post(
  '/:id/attempts',
  requirePermission('assessment.attempt.start'),
  validate({ params: idParam, body: startAttemptSchema }),
  asyncHandler(async (req, res) => {
    const attempt = await attempts.startAttempt(
      getContext(req),
      getSchoolId(req),
      req.params.id,
      req.body,
    );
    created(res, attempt, `/api/v1/assessment-attempts/${attempt.id}`);
  }),
);

// ── /assessment-attempts ────────────────────────────────────────────────────

const attemptRouter = Router();
attemptRouter.use(authenticate, tenantContext, requireSchoolContext);

attemptRouter.get(
  '/',
  requirePermission('assessment.attempt.read'),
  validate({ query: attemptListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof attempts.listAttempts>[2];
    const { items, totalItems } = await attempts.listAttempts(getActor(req), getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

attemptRouter.get(
  '/:id',
  requirePermission('assessment.attempt.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await attempts.getAttempt(getActor(req), getSchoolId(req), req.params.id));
  }),
);

/**
 * The delivery endpoint. Returns the next item with its answer key removed, or
 * `{ done: true }` once the item target is met.
 */
attemptRouter.get(
  '/:id/next-item',
  requirePermission('assessment.attempt.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await attempts.getNextItem(getActor(req), getSchoolId(req), req.params.id));
  }),
);

attemptRouter.post(
  '/:id/responses',
  requirePermission('assessment.attempt.start'),
  validate({ params: idParam, body: submitResponseSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.recordResponse(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

attemptRouter.get(
  '/:id/responses',
  requirePermission('assessment.attempt.read'),
  validate({ params: idParam, query: responseListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof attempts.listAttemptResponses>[3];
    const { items, totalItems } = await attempts.listAttemptResponses(
      getActor(req),
      getSchoolId(req),
      req.params.id,
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

attemptRouter.post(
  '/:id/submit',
  requirePermission('assessment.attempt.start'),
  validate({ params: idParam, body: submitAttemptSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.submitAttempt(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

attemptRouter.post(
  '/:id/abandon',
  requirePermission('assessment.attempt.start'),
  validate({ params: idParam, body: abandonAttemptSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.abandonAttempt(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── /assessment-responses ───────────────────────────────────────────────────

const responseRouter = Router();
responseRouter.use(authenticate, tenantContext, requireSchoolContext);

/**
 * Blueprint 04: a teacher may correct a mark, and the correction is recorded with a
 * reason. The attempt's totals and the inference drawn from it are recomputed here,
 * not left stale.
 */
responseRouter.post(
  '/:id/override',
  requirePermission('assessment.response.override'),
  validate({ params: idParam, body: overrideResponseSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await evidence.overrideResponse(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── /topic-evaluations ──────────────────────────────────────────────────────

const evaluationRouter = Router();
evaluationRouter.use(authenticate, tenantContext, requireSchoolContext);

evaluationRouter.get(
  '/',
  requirePermission('mastery.read'),
  validate({ query: evaluationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof evidence.listTopicEvaluations>[2];
    const { items, totalItems } = await evidence.listTopicEvaluations(
      getActor(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** The current picture rather than the history: topic rows and objective rows. */
evaluationRouter.get(
  '/students/:id/mastery',
  requirePermission('mastery.read'),
  validate({ params: idParam, query: evaluationListQuery.partial() }),
  asyncHandler(async (req, res) => {
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    ok(
      res,
      await evidence.getStudentMastery(
        getActor(req),
        getSchoolId(req),
        req.params.id,
        subjectId,
      ),
    );
  }),
);

export const assessmentRouter = definitions;
export const assessmentAttemptRouter = attemptRouter;
export const studentResponseRouter = responseRouter;
export const topicEvaluationRouter = evaluationRouter;
