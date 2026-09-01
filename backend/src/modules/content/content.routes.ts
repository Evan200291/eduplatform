// ─────────────────────────────────────────────────────────────────────────────
// Content routes — lessons
// Mounted as `/lessons`. Split from the activity and governance routers so each
// file stays short enough to read in one pass:
//   content.routes.ts            — this file, lessons, and the module's exports
//   content.activities.routes.ts — activities, questions, options, hints
//   content.governance.routes.ts — ownership, publications, reports, reviews
//
// Reads need `lesson.read`; writes need `lesson.write`; moving a lesson along the
// lifecycle needs one of `content.review`, `content.publish`, `content.archive`,
// so a reviewer can approve without being allowed to author.
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
import * as content from './content.service';
import {
  contentStatusSchema,
  createLessonSchema,
  createLessonSectionSchema,
  lessonListQuery,
  reorderSchema,
  sectionParams,
  updateLessonSchema,
  updateLessonSectionSchema,
} from './content.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

/** Shared by lessons and activities; publishing and archiving are separate grants. */
export const lifecycleGuard = requireAnyPermission(
  'content.review',
  'content.publish',
  'content.archive',
);

// ── Lessons ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('lesson.read'),
  validate({ query: lessonListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof content.listLessons>[1];
    const { items, totalItems } = await content.listLessons(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/',
  requirePermission('lesson.write'),
  validate({ body: createLessonSchema }),
  asyncHandler(async (req, res) => {
    const lesson = await content.createLesson(getContext(req), getSchoolId(req), req.body);
    created(res, lesson, `/api/v1/lessons/${lesson.id}`);
  }),
);

router.get(
  '/:id',
  requirePermission('lesson.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await content.getLesson(getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/:id',
  requirePermission('lesson.write'),
  validate({ params: idParam, body: updateLessonSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.updateLesson(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/:id/status',
  lifecycleGuard,
  validate({ params: idParam, body: contentStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.setLessonStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status as ContentStatus,
        req.body.reason,
      ),
    );
  }),
);

// ── Lesson sections ─────────────────────────────────────────────────────────

router.post(
  '/:id/sections',
  requirePermission('lesson.write'),
  validate({ params: idParam, body: createLessonSectionSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await content.addLessonSection(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

router.post(
  '/:id/sections/reorder',
  requirePermission('lesson.write'),
  validate({ params: idParam, body: reorderSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.reorderLessonSections(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.items,
      ),
    );
  }),
);

router.patch(
  '/:id/sections/:sectionId',
  requirePermission('lesson.write'),
  validate({ params: sectionParams, body: updateLessonSectionSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.updateLessonSection(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.sectionId,
        req.body,
      ),
    );
  }),
);

router.delete(
  '/:id/sections/:sectionId',
  requirePermission('lesson.write'),
  validate({ params: sectionParams }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await content.deleteLessonSection(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.params.sectionId,
      ),
    );
  }),
);

export const lessonRouter = router;

