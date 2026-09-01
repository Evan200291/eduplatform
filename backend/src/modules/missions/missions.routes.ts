// ─────────────────────────────────────────────────────────────────────────────
// Mission routes
// The mount point for `/api/v1/missions`. Authentication and tenancy are applied
// once at the top so no individual route can forget them.
//
// `mission.read` is held by learners and staff alike; `mission.write` is the
// teacher's. That split is the whole authorisation story: a learner reads their
// board and acknowledges a finished mission, staff define missions and decide who
// is on them.
//
// Sub-paths are declared before `/:id` so `/mine` is never read as an id.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as missions from './missions.service';
import * as progress from './missions.progress.service';
import {
  cancelMissionSchema,
  createMissionSchema,
  enrolMissionSchema,
  markSeenSchema,
  missionListQuery,
  missionProgressListQuery,
  myMissionsQuery,
  refreshProgressSchema,
  studentScopeQuery,
  updateMissionSchema,
} from './missions.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

// ── The learner's board ─────────────────────────────────────────────────────

/** What the learner is working towards, measured at the moment of the request. */
router.get(
  '/mine',
  requirePermission('mission.read'),
  validate({ query: myMissionsQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.myMissions>[2];
    ok(res, await progress.myMissions(getContext(req), getSchoolId(req), query));
  }),
);

/** Headline counts for a dashboard card. */
router.get(
  '/summary',
  requirePermission('mission.read'),
  validate({ query: studentScopeQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await progress.missionSummary(getContext(req), getSchoolId(req), studentId));
  }),
);

/** Re-measure now, for the moment right after a learner finishes something. */
router.post(
  '/refresh',
  requirePermission('mission.read'),
  validate({ body: refreshProgressSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await progress.refreshProgress(getContext(req), getSchoolId(req), req.body));
  }),
);

/** Stops the celebration replaying on every visit. */
router.post(
  '/progress/seen',
  requirePermission('mission.read'),
  validate({ body: markSeenSchema }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.body as { studentId?: string };
    const seen = await progress.markMissionsSeen(getContext(req), getSchoolId(req), studentId);
    ok(res, { seen });
  }),
);

// ── The teacher's monitor ───────────────────────────────────────────────────

/** Who is where, across the learners the caller is responsible for. */
router.get(
  '/progress',
  requirePermission('mission.read'),
  validate({ query: missionProgressListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.listProgress>[2];
    const { items, totalItems } = await progress.listProgress(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

// ── The catalogue ───────────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('mission.read'),
  validate({ query: missionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof missions.listMissions>[2];
    const { items, totalItems } = await missions.listMissions(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/',
  requirePermission('mission.write'),
  validate({ body: createMissionSchema }),
  asyncHandler(async (req, res) => {
    created(res, await missions.createMission(getContext(req), getSchoolId(req), req.body));
  }),
);

router.get(
  '/:id',
  requirePermission('mission.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await missions.getMission(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/:id',
  requirePermission('mission.write'),
  validate({ params: idParam, body: updateMissionSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await missions.updateMission(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Withdrawn from the board. Rows already in flight are left to finish. */
router.post(
  '/:id/archive',
  requirePermission('mission.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await missions.archiveMission(getContext(req), getSchoolId(req), req.params.id));
  }),
);

/** Adding named learners, for the nudge meant for a few rather than a class. */
router.post(
  '/:id/enrol',
  requirePermission('mission.write'),
  validate({ params: idParam, body: enrolMissionSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await missions.enrolStudents(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Withdrawing it from named learners. Finished rows are left alone. */
router.post(
  '/:id/cancel',
  requirePermission('mission.write'),
  validate({ params: idParam, body: cancelMissionSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await missions.cancelForStudents(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

export const missionRouter = router;
