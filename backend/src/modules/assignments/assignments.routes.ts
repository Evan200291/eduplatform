// ─────────────────────────────────────────────────────────────────────────────
// Assignment routes
// Two audiences share one mount. Staff set, publish and monitor work; learners see
// what is set for them and hand it in. The split is by permission, not by path:
// `assignment.submit` is held by learners, `assignment.write` / `.grade` / `.excuse`
// by staff, and each service narrows the data to whoever is asking.
//
// `/my-work` and `/attempts` are declared before `/:id` so neither is ever read as
// an assignment id.
// ─────────────────────────────────────────────────────────────────────────────

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
import * as attempts from './assignments.attempts.service';
import * as service from './assignments.service';
import {
  assignmentListQuery,
  attemptListQuery,
  createAssignmentSchema,
  excuseSchema,
  feedbackSchema,
  monitorQuery,
  publishAssignmentSchema,
  setTargetsSchema,
  startAssignmentSchema,
  submitAssignmentSchema,
  updateAssignmentSchema,
} from './assignments.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

/** Staff who mark or set work. Keeps learners off the monitoring endpoints. */
const staffOnly = requireAnyPermission('assignment.write', 'assignment.grade');
/** A learner working, or a member of staff sitting with them. */
const workingOnIt = requireAnyPermission('assignment.submit', 'assignment.grade');

router.get(
  '/',
  requirePermission('assignment.read'),
  validate({ query: assignmentListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof service.listAssignments>[2];
    const { items, totalItems } = await service.listAssignments(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** The learner's home screen figure, and a teacher's view of one learner. */
router.get(
  '/my-work',
  requirePermission('assignment.read'),
  asyncHandler(async (req, res) => {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    ok(res, await attempts.getMyWork(getContext(req), getSchoolId(req), studentId));
  }),
);

// ── Attempts ────────────────────────────────────────────────────────────────

router.get(
  '/attempts',
  requirePermission('assignment.read'),
  validate({ query: attemptListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof attempts.listAttempts>[2];
    const { items, totalItems } = await attempts.listAttempts(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.get(
  '/attempts/:id',
  requirePermission('assignment.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await attempts.getAttempt(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.post(
  '/attempts/:id/feedback',
  requirePermission('assignment.grade'),
  validate({ params: idParam, body: feedbackSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.giveFeedback(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── The definition ──────────────────────────────────────────────────────────

router.post(
  '/',
  requirePermission('assignment.write'),
  validate({ body: createAssignmentSchema }),
  asyncHandler(async (req, res) => {
    created(res, await service.createAssignment(getContext(req), getSchoolId(req), req.body));
  }),
);

router.get(
  '/:id',
  requirePermission('assignment.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await service.getAssignment(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/:id',
  requirePermission('assignment.write'),
  validate({ params: idParam, body: updateAssignmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await service.updateAssignment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

router.put(
  '/:id/targets',
  requirePermission('assignment.write'),
  validate({ params: idParam, body: setTargetsSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await service.setTargets(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/:id/publish',
  requirePermission('assignment.write'),
  validate({ params: idParam, body: publishAssignmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await service.publishAssignment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

/** Picks up learners who joined the class after the work was set. */
router.post(
  '/:id/sync-attempts',
  requirePermission('assignment.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await service.syncAttempts(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.post(
  '/:id/archive',
  requirePermission('assignment.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await service.archiveAssignment(getContext(req), getSchoolId(req), req.params.id),
    );
  }),
);

/** Blueprint 04's monitoring board: one row per targeted learner. */
router.get(
  '/:id/monitor',
  staffOnly,
  validate({ params: idParam, query: monitorQuery }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await service.getMonitorBoard(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.query as unknown as Parameters<typeof service.getMonitorBoard>[3],
      ),
    );
  }),
);

// ── Doing the work ──────────────────────────────────────────────────────────

router.post(
  '/:id/start',
  workingOnIt,
  validate({ params: idParam, body: startAssignmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.startAssignment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.studentId,
      ),
    );
  }),
);

router.post(
  '/:id/submit',
  workingOnIt,
  validate({ params: idParam, body: submitAssignmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.submitAssignment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── Excusing ────────────────────────────────────────────────────────────────
// Both directions need a reason, so an excusal and its reversal are equally
// accountable in the audit trail.

router.post(
  '/:id/excuse',
  requirePermission('assignment.excuse'),
  validate({ params: idParam, body: excuseSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.excuseStudents(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
        true,
      ),
    );
  }),
);

router.post(
  '/:id/unexcuse',
  requirePermission('assignment.excuse'),
  validate({ params: idParam, body: excuseSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await attempts.excuseStudents(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
        false,
      ),
    );
  }),
);

export const assignmentRouter = router;

