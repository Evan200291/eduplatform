// ─────────────────────────────────────────────────────────────────────────────
// Progress, mastery, judgment and note routes
// Four mounts, because blueprint 12 insists the four record types stay separate in
// the API as well as in the schema:
//
//   /progress             engagement — "did the learner do the work?"
//   /mastery              inference  — "can the learner do the thing?"
//   /teacher-assessments  a teacher's own judgment, first-class evidence
//   /notes                the professional record around the learner
//
// A learner holds `progress.read.own` and `mastery.read`, so they reach the first
// two mounts and see only their own rows — the narrowing happens in the service from
// the class roster, never from a query parameter. No learner or parent role holds
// `note.read`, so the notes mount is staff-only by grant rather than by check.
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
import * as notes from './notes.service';
import * as progress from './progress.service';
import {
  classProgressQuery,
  createNoteSchema,
  createTeacherAssessmentSchema,
  escalateNoteSchema,
  masteryListQuery,
  masteryOverrideSchema,
  noteListQuery,
  progressListQuery,
  progressSummaryQuery,
  teacherAssessmentListQuery,
  updateNoteSchema,
  updateTeacherAssessmentSchema,
  withdrawNoteSchema,
} from './progress.validation';

const anyProgressRead = requireAnyPermission(
  'progress.read.own',
  'progress.read.scoped',
  'progress.read.school',
);

// ── /progress ───────────────────────────────────────────────────────────────

const progressRouter = Router();
progressRouter.use(authenticate, tenantContext, requireSchoolContext);

progressRouter.get(
  '/',
  anyProgressRead,
  validate({ query: progressListQuery }),
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

progressRouter.get(
  '/summary',
  anyProgressRead,
  validate({ query: progressSummaryQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.getProgressSummary>[2];
    ok(res, await progress.getProgressSummary(getContext(req), getSchoolId(req), query));
  }),
);

/** A teacher's class overview: one engagement row per learner. */
progressRouter.get(
  '/classes/:id',
  requireAnyPermission('progress.read.scoped', 'progress.read.school'),
  validate({ params: idParam, query: classProgressQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.getClassProgress>[3];
    ok(
      res,
      await progress.getClassProgress(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        query,
      ),
    );
  }),
);

// ── /mastery ────────────────────────────────────────────────────────────────

const masteryRouter = Router();
masteryRouter.use(authenticate, tenantContext, requireSchoolContext);

masteryRouter.get(
  '/',
  requirePermission('mastery.read'),
  validate({ query: masteryListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.listMastery>[2];
    const { items, totalItems } = await progress.listMastery(getContext(req), getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Blueprint 04: a teacher judgment outranks system inference, and says why. */
masteryRouter.post(
  '/:id/override',
  requirePermission('mastery.override'),
  validate({ params: idParam, body: masteryOverrideSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await progress.overrideMastery(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── /teacher-assessments ────────────────────────────────────────────────────

const judgmentRouter = Router();
judgmentRouter.use(authenticate, tenantContext, requireSchoolContext);

judgmentRouter.get(
  '/',
  requirePermission('mastery.read'),
  validate({ query: teacherAssessmentListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof progress.listTeacherAssessments>[2];
    const { items, totalItems } = await progress.listTeacherAssessments(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

judgmentRouter.post(
  '/',
  requirePermission('teacherassessment.write'),
  validate({ body: createTeacherAssessmentSchema }),
  asyncHandler(async (req, res) => {
    const judgment = await progress.createTeacherAssessment(
      getContext(req),
      getSchoolId(req),
      req.body,
    );
    created(res, judgment, `/api/v1/teacher-assessments/${judgment.id}`);
  }),
);

judgmentRouter.patch(
  '/:id',
  requirePermission('teacherassessment.write'),
  validate({ params: idParam, body: updateTeacherAssessmentSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await progress.updateTeacherAssessment(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

// ── /notes ──────────────────────────────────────────────────────────────────

const noteRouter = Router();
noteRouter.use(authenticate, tenantContext, requireSchoolContext);

noteRouter.get(
  '/',
  requirePermission('note.read'),
  validate({ query: noteListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof notes.listNotes>[2];
    const { items, totalItems } = await notes.listNotes(getContext(req), getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Declared before `/:id` so "summary" is never read as a note id. */
noteRouter.get(
  '/summary',
  requirePermission('note.read'),
  asyncHandler(async (req, res) => {
    ok(res, await notes.getNoteSummary(getContext(req), getSchoolId(req)));
  }),
);

noteRouter.post(
  '/',
  requirePermission('note.write'),
  validate({ body: createNoteSchema }),
  asyncHandler(async (req, res) => {
    const note = await notes.createNote(getContext(req), getSchoolId(req), req.body);
    created(res, note, `/api/v1/notes/${note.id}`);
  }),
);

noteRouter.get(
  '/:id',
  requirePermission('note.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await notes.getNote(getContext(req), getSchoolId(req), req.params.id));
  }),
);

noteRouter.patch(
  '/:id',
  requirePermission('note.write'),
  validate({ params: idParam, body: updateNoteSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await notes.updateNote(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Never a hard delete: a note is withdrawn with a reason and kept. */
noteRouter.post(
  '/:id/withdraw',
  requirePermission('note.write'),
  validate({ params: idParam, body: withdrawNoteSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await notes.withdrawNote(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.reason,
      ),
    );
  }),
);

noteRouter.post(
  '/:id/escalate',
  requirePermission('note.escalate'),
  validate({ params: idParam, body: escalateNoteSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await notes.escalateNote(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

export {
  judgmentRouter as teacherAssessmentRouter,
  masteryRouter,
  noteRouter as teacherNoteRouter,
  progressRouter,
};
