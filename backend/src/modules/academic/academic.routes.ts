// ─────────────────────────────────────────────────────────────────────────────
// Academic structure routes
// Mounted as `/grades`, `/terms`, `/subjects` and `/classes`. Every router runs
// `authenticate` + `tenantContext` first, then `requireSchoolContext`, so a
// handler never has to wonder which school it is operating in.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getActor, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as academic from './academic.service';
import {
  archiveSchema,
  assignTeacherSchema,
  classListQuery,
  classSubjectSchema,
  classTeacherParams,
  createClassSchema,
  createGradeSchema,
  createSubjectSchema,
  createTermSchema,
  gradeListQuery,
  rosterAddSchema,
  rosterListQuery,
  rosterRemoveSchema,
  setClassSubjectsSchema,
  subjectListQuery,
  termListQuery,
  updateClassSchema,
  updateGradeSchema,
  updateSubjectSchema,
  updateTermSchema,
} from './academic.validation';

// ── Grades ──────────────────────────────────────────────────────────────────

const grades = Router();
grades.use(authenticate, tenantContext, requireSchoolContext);

grades.get(
  '/',
  requirePermission('grade.read'),
  validate({ query: gradeListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof academic.listGrades>[1];
    const { items, totalItems } = await academic.listGrades(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

grades.post(
  '/',
  requirePermission('grade.write'),
  validate({ body: createGradeSchema }),
  asyncHandler(async (req, res) => {
    const grade = await academic.createGrade(getContext(req), getSchoolId(req), req.body);
    created(res, grade, `/api/v1/grades/${grade.id}`);
  }),
);

grades.get(
  '/:id',
  requirePermission('grade.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await academic.getGrade(getSchoolId(req), req.params.id));
  }),
);

grades.patch(
  '/:id',
  requirePermission('grade.write'),
  validate({ params: idParam, body: updateGradeSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.updateGrade(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

grades.post(
  '/:id/archive',
  requirePermission('grade.write'),
  validate({ params: idParam, body: archiveSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.archiveGrade(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.reason,
      ),
    );
  }),
);

export const gradeRouter = grades;

// ── Academic terms ──────────────────────────────────────────────────────────

const terms = Router();
terms.use(authenticate, tenantContext, requireSchoolContext);

terms.get(
  '/',
  requirePermission('term.read'),
  validate({ query: termListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof academic.listTerms>[1];
    const { items, totalItems } = await academic.listTerms(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

terms.post(
  '/',
  requirePermission('term.write'),
  validate({ body: createTermSchema }),
  asyncHandler(async (req, res) => {
    const term = await academic.createTerm(getContext(req), getSchoolId(req), req.body);
    created(res, term, `/api/v1/terms/${term.id}`);
  }),
);

terms.patch(
  '/:id',
  requirePermission('term.write'),
  validate({ params: idParam, body: updateTermSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.updateTerm(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

export const termRouter = terms;

// ── Subjects ────────────────────────────────────────────────────────────────

const subjects = Router();
subjects.use(authenticate, tenantContext, requireSchoolContext);

subjects.get(
  '/',
  requirePermission('subject.read'),
  validate({ query: subjectListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof academic.listSubjects>[1];
    const { items, totalItems } = await academic.listSubjects(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

subjects.post(
  '/',
  requirePermission('subject.write'),
  validate({ body: createSubjectSchema }),
  asyncHandler(async (req, res) => {
    const subject = await academic.createSubject(getContext(req), getSchoolId(req), req.body);
    created(res, subject, `/api/v1/subjects/${subject.id}`);
  }),
);

subjects.get(
  '/:id',
  requirePermission('subject.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await academic.getSubject(getSchoolId(req), req.params.id));
  }),
);

subjects.patch(
  '/:id',
  requirePermission('subject.write'),
  validate({ params: idParam, body: updateSubjectSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.updateSubject(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

subjects.post(
  '/:id/archive',
  requirePermission('subject.write'),
  validate({ params: idParam, body: archiveSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.archiveSubject(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.reason,
      ),
    );
  }),
);

export const subjectRouter = subjects;

// ── Classes ─────────────────────────────────────────────────────────────────

const classes = Router();
classes.use(authenticate, tenantContext, requireSchoolContext);

classes.get(
  '/',
  requirePermission('class.read'),
  validate({ query: classListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof academic.listClasses>[2];
    const { items, totalItems } = await academic.listClasses(getContext(req), getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** The teacher portal's own class list — no school-wide read required. */
classes.get(
  '/mine',
  requirePermission('class.read'),
  asyncHandler(async (req, res) => {
    ok(res, await academic.myClasses(getContext(req), getSchoolId(req)));
  }),
);

/** The learner's own class list, used by the student home screen. */
classes.get(
  '/enrolled',
  asyncHandler(async (req, res) => {
    ok(res, await academic.myEnrolledClasses(getActor(req).userId, getSchoolId(req)));
  }),
);

classes.post(
  '/',
  requirePermission('class.write'),
  validate({ body: createClassSchema }),
  asyncHandler(async (req, res) => {
    const record = await academic.createClass(getContext(req), getSchoolId(req), req.body);
    created(res, record, `/api/v1/classes/${record.id}`);
  }),
);

classes.get(
  '/:id',
  requirePermission('class.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await academic.getClass(getSchoolId(req), req.params.id));
  }),
);

classes.patch(
  '/:id',
  requirePermission('class.write'),
  validate({ params: idParam, body: updateClassSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.updateClass(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

classes.post(
  '/:id/archive',
  requirePermission('class.write'),
  validate({ params: idParam, body: archiveSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.archiveClass(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.reason,
      ),
    );
  }),
);

classes.put(
  '/:id/subjects',
  requirePermission('class.write'),
  validate({ params: idParam, body: setClassSubjectsSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.setClassSubjects(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.subjectIds,
      ),
    );
  }),
);

classes.patch(
  '/:id/subjects',
  requirePermission('class.write'),
  validate({ params: idParam, body: classSubjectSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.updateClassSubject(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

classes.get(
  '/:id/students',
  requirePermission('class.read'),
  validate({ params: idParam, query: rosterListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof academic.listRoster>[2];
    const { items, totalItems } = await academic.listRoster(
      getSchoolId(req),
      req.params.id,
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

classes.post(
  '/:id/students',
  requirePermission('class.roster.write'),
  validate({ params: idParam, body: rosterAddSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.addStudentsToClass(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.userIds,
      ),
    );
  }),
);

classes.post(
  '/:id/students/remove',
  requirePermission('class.roster.write'),
  validate({ params: idParam, body: rosterRemoveSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.removeStudentsFromClass(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.userIds,
        req.body.hard,
      ),
    );
  }),
);

classes.get(
  '/:id/teachers',
  requirePermission('class.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await academic.listClassTeachers(getSchoolId(req), req.params.id));
  }),
);

classes.post(
  '/:id/teachers',
  requirePermission('class.write'),
  validate({ params: idParam, body: assignTeacherSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await academic.assignClassTeacher(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

classes.delete(
  '/:id/teachers/:teacherId',
  requirePermission('class.write'),
  validate({ params: classTeacherParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await academic.removeClassTeacher(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.teacherId,
      ),
    );
  }),
);

export const classRouter = classes;
