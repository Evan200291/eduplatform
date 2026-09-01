// ─────────────────────────────────────────────────────────────────────────────
// Curriculum routes
// Mounted as `/curriculum`. Reads need `curriculum.read` (teachers and learners
// have it); writes need `curriculum.write`; lifecycle moves are separated into
// `content.review`, `content.publish` and `content.archive` so a reviewer can be
// allowed to approve without being allowed to author.
// ─────────────────────────────────────────────────────────────────────────────

import type { ContentStatus } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import {
  requireAnyPermission,
  requirePermission,
  requireSchoolContext,
} from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as curriculum from './curriculum.service';
import {
  contentStatusSchema,
  createObjectiveSchema,
  createProgramSchema,
  createTopicSchema,
  createUnitSchema,
  objectiveListQuery,
  programListQuery,
  reorderSchema,
  setPrerequisitesSchema,
  topicListQuery,
  unitListQuery,
  updateObjectiveSchema,
  updateProgramSchema,
  updateTopicSchema,
  updateUnitSchema,
} from './curriculum.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

/** Publishing and archiving are separate grants from reviewing. */
const lifecycleGuard = requireAnyPermission('content.review', 'content.publish', 'content.archive');

// ── Programs ────────────────────────────────────────────────────────────────

router.get(
  '/programs',
  requirePermission('curriculum.read'),
  validate({ query: programListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof curriculum.listPrograms>[1];
    const { items, totalItems } = await curriculum.listPrograms(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/programs',
  requirePermission('curriculum.write'),
  validate({ body: createProgramSchema }),
  asyncHandler(async (req, res) => {
    const program = await curriculum.createProgram(getContext(req), getSchoolId(req), req.body);
    created(res, program, `/api/v1/curriculum/programs/${program.id}`);
  }),
);

router.get(
  '/programs/:id',
  requirePermission('curriculum.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await curriculum.getProgram(getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/programs/:id',
  requirePermission('curriculum.write'),
  validate({ params: idParam, body: updateProgramSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.updateProgram(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/programs/:id/status',
  lifecycleGuard,
  validate({ params: idParam, body: contentStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.setProgramStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status as ContentStatus,
        req.body.reason,
      ),
    );
  }),
);

// ── Units ───────────────────────────────────────────────────────────────────

router.get(
  '/units',
  requirePermission('curriculum.read'),
  validate({ query: unitListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof curriculum.listUnits>[1];
    const { items, totalItems } = await curriculum.listUnits(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/units',
  requirePermission('curriculum.write'),
  validate({ body: createUnitSchema }),
  asyncHandler(async (req, res) => {
    const unit = await curriculum.createUnit(getContext(req), getSchoolId(req), req.body);
    created(res, unit, `/api/v1/curriculum/units/${unit.id}`);
  }),
);

router.patch(
  '/units/:id',
  requirePermission('curriculum.write'),
  validate({ params: idParam, body: updateUnitSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.updateUnit(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/units/:id/status',
  lifecycleGuard,
  validate({ params: idParam, body: contentStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.setUnitStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status as ContentStatus,
        req.body.reason,
      ),
    );
  }),
);

// ── Topics ──────────────────────────────────────────────────────────────────

router.get(
  '/topics',
  requirePermission('curriculum.read'),
  validate({ query: topicListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof curriculum.listTopics>[1];
    const { items, totalItems } = await curriculum.listTopics(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/topics',
  requirePermission('curriculum.write'),
  validate({ body: createTopicSchema }),
  asyncHandler(async (req, res) => {
    const topic = await curriculum.createTopic(getContext(req), getSchoolId(req), req.body);
    created(res, topic, `/api/v1/curriculum/topics/${topic.id}`);
  }),
);

router.get(
  '/topics/:id',
  requirePermission('curriculum.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await curriculum.getTopic(getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/topics/:id',
  requirePermission('curriculum.write'),
  validate({ params: idParam, body: updateTopicSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.updateTopic(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/topics/:id/status',
  lifecycleGuard,
  validate({ params: idParam, body: contentStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.setTopicStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status as ContentStatus,
        req.body.reason,
      ),
    );
  }),
);

router.put(
  '/topics/:id/prerequisites',
  requirePermission('curriculum.write'),
  validate({ params: idParam, body: setPrerequisitesSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.setTopicPrerequisites(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.prerequisites,
      ),
    );
  }),
);

// ── Objectives ──────────────────────────────────────────────────────────────

router.get(
  '/objectives',
  requirePermission('curriculum.read'),
  validate({ query: objectiveListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof curriculum.listObjectives>[1];
    const { items, totalItems } = await curriculum.listObjectives(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/objectives',
  requirePermission('curriculum.write'),
  validate({ body: createObjectiveSchema }),
  asyncHandler(async (req, res) => {
    created(res, await curriculum.createObjective(getContext(req), getSchoolId(req), req.body));
  }),
);

router.patch(
  '/objectives/:id',
  requirePermission('curriculum.write'),
  validate({ params: idParam, body: updateObjectiveSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await curriculum.updateObjective(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

router.delete(
  '/objectives/:id',
  requirePermission('curriculum.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await curriculum.deleteObjective(getContext(req), getSchoolId(req), req.params.id));
  }),
);

// ── Reordering ──────────────────────────────────────────────────────────────

for (const kind of ['programs', 'units', 'topics', 'objectives'] as const) {
  const singular = kind.slice(0, -1) as 'program' | 'unit' | 'topic' | 'objective';
  router.post(
    `/${kind}/reorder`,
    requirePermission('curriculum.write'),
    validate({ body: reorderSchema }),
    asyncHandler(async (req, res) => {
      ok(res, await curriculum.reorder(getContext(req), getSchoolId(req), singular, req.body.items));
    }),
  );
}

export const curriculumRouter = router;
