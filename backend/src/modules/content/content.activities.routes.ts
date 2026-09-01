// ─────────────────────────────────────────────────────────────────────────────
// Content routes — activities, questions, options and hints
// Mounted as `/activities`. Sibling of content.routes.ts; see that file's header
// for the split.
//
// The learner-facing route is `GET /activities/:id/deliver`. It is the only one a
// student calls, and the service behind it selects columns explicitly so no
// answer key can leave the server — see DELIVERY_QUESTION_SELECT in
// content.service.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContentStatus } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { lifecycleGuard } from './content.routes';
import * as questions from './content.questions.service';
import * as content from './content.service';
import {
  activityListQuery,
  contentStatusSchema,
  createActivitySchema,
  createAnswerOptionSchema,
  createHintSchema,
  createQuestionSchema,
  hintParams,
  optionParams,
  publishActivitySchema,
  questionParams,
  reorderSchema,
  setActivityObjectivesSchema,
  updateActivitySchema,
  updateAnswerOptionSchema,
  updateHintSchema,
  updateQuestionSchema,
} from './content.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

// ── Activities ──────────────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('activity.read'),
  validate({ query: activityListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof content.listActivities>[1];
    const { items, totalItems } = await content.listActivities(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/',
  requirePermission('activity.write'),
  validate({ body: createActivitySchema }),
  asyncHandler(async (req, res) => {
    const activity = await content.createActivity(getContext(req), getSchoolId(req), req.body);
    created(res, activity, `/api/v1/activities/${activity.id}`);
  }),
);

router.get(
  '/:id',
  requirePermission('activity.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await content.getActivity(getSchoolId(req), req.params.id));
  }),
);

/**
 * Learner-facing presentation payload. `activity.read` is held by students, and
 * the service strips every answer key, so this is the same route for everyone.
 */
router.get(
  '/:id/deliver',
  requirePermission('activity.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await content.getActivityForDelivery(getSchoolId(req), req.params.id));
  }),
);

router.get(
  '/:id/versions',
  requirePermission('activity.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await content.listActivityVersions(getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/:id',
  requirePermission('activity.write'),
  validate({ params: idParam, body: updateActivitySchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.updateActivity(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Every move except PUBLISHED; publishing goes through `/publish` below. */
router.post(
  '/:id/status',
  lifecycleGuard,
  validate({ params: idParam, body: contentStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.setActivityStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status as ContentStatus,
        req.body.reason,
      ),
    );
  }),
);

/** Writes the immutable version snapshot blueprint 12 requires. */
router.post(
  '/:id/publish',
  requirePermission('content.publish'),
  validate({ params: idParam, body: publishActivitySchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.publishActivity(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

router.put(
  '/:id/objectives',
  requirePermission('activity.write'),
  validate({ params: idParam, body: setActivityObjectivesSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.setActivityObjectives(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.objectives,
      ),
    );
  }),
);

// ── Questions ───────────────────────────────────────────────────────────────
// Authoring routes: these return answer keys, so they require `activity.write`
// rather than `activity.read`.

router.get(
  '/:id/questions',
  requirePermission('activity.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await questions.listQuestions(getSchoolId(req), req.params.id));
  }),
);

router.post(
  '/:id/questions',
  requirePermission('activity.write'),
  validate({ params: idParam, body: createQuestionSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await questions.createQuestion(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/:id/questions/reorder',
  requirePermission('activity.write'),
  validate({ params: idParam, body: reorderSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.reorderQuestions(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.items,
      ),
    );
  }),
);

router.patch(
  '/:id/questions/:questionId',
  requirePermission('activity.write'),
  validate({ params: questionParams, body: updateQuestionSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.updateQuestion(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.questionId,
        req.body,
      ),
    );
  }),
);

router.delete(
  '/:id/questions/:questionId',
  requirePermission('activity.write'),
  validate({ params: questionParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.deleteQuestion(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.questionId,
      ),
    );
  }),
);

export const activityRouter = router;

// ── Question sub-resources ──────────────────────────────────────────────────
// Mounted separately as `/questions`, because an option and a hint belong to a
// question rather than to an activity. `:id` here is the question id, which is
// what `optionParams` and `hintParams` validate.

const questionRouter = Router();
questionRouter.use(authenticate, tenantContext, requireSchoolContext);

questionRouter.post(
  '/:id/options',
  requirePermission('activity.write'),
  validate({ params: idParam, body: createAnswerOptionSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await questions.addAnswerOption(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

questionRouter.patch(
  '/:id/options/:optionId',
  requirePermission('activity.write'),
  validate({ params: optionParams, body: updateAnswerOptionSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.updateAnswerOption(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.optionId,
        req.body,
      ),
    );
  }),
);

questionRouter.delete(
  '/:id/options/:optionId',
  requirePermission('activity.write'),
  validate({ params: optionParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.deleteAnswerOption(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.optionId,
      ),
    );
  }),
);

questionRouter.post(
  '/:id/hints',
  requirePermission('activity.write'),
  validate({ params: idParam, body: createHintSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await questions.addHint(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

questionRouter.patch(
  '/:id/hints/:hintId',
  requirePermission('activity.write'),
  validate({ params: hintParams, body: updateHintSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.updateHint(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.hintId,
        req.body,
      ),
    );
  }),
);

questionRouter.delete(
  '/:id/hints/:hintId',
  requirePermission('activity.write'),
  validate({ params: hintParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await questions.deleteHint(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.hintId,
      ),
    );
  }),
);

export const questionSubResourceRouter = questionRouter;

