// ─────────────────────────────────────────────────────────────────────────────
// Dashboard routes — one mount, three audiences
// Blueprint 03 gives the learner home, blueprint 04 the teacher dashboard and
// blueprint 05 the school administrator's overview. They are separate endpoints
// rather than one shape-shifting response, because a frontend that has to guess
// which fields it received cannot be typed.
//
// `GET /dashboard` is the exception: it dispatches on the caller's own grants so
// a shared login can land on the right home without the client knowing the role
// first. That is the only place the role is inferred; every other route is gated
// by an existing permission.
//
// No new permissions were introduced for the dashboard. A learner reaches their
// own home with `self.learning.participate`, staff reach the teacher view with
// `progress.read.scoped` or `progress.read.school`, and the school overview
// needs `progress.read.school`, which only school-wide readers hold.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { toSkipTake } from '../../core/http/pagination';
import { ok, paginated } from '../../core/http/respond';
import { validate } from '../../core/http/validate';
import { authenticate, getActor, getContext, getSchoolId } from '../../core/middleware/authenticate';
import {
  requireAnyPermission,
  requirePermission,
  requireSchoolContext,
} from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { hasPermission } from '../../core/rbac/authorize';
import { learnerDashboard } from './dashboard.learner.service';
import { schoolDashboard } from './dashboard.school.service';
import { attentionList, teacherDashboard } from './dashboard.teacher.service';
import {
  attentionListQuery,
  learnerDashboardQuery,
  schoolDashboardQuery,
  teacherDashboardQuery,
} from './dashboard.validation';

const staffProgressRead = requireAnyPermission('progress.read.scoped', 'progress.read.school');
const learnerRead = requireAnyPermission('self.learning.participate', 'progress.read.own');

const dashboardRouter = Router();
dashboardRouter.use(authenticate, tenantContext, requireSchoolContext);

/**
 * Where this user's home is. Returned rather than redirected, so the SPA router
 * decides the URL and the API stays a data API.
 */
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const actor = getActor(req);
    const view = hasPermission(actor, 'progress.read.school')
      ? 'SCHOOL'
      : hasPermission(actor, 'progress.read.scoped')
        ? 'TEACHER'
        : 'LEARNER';

    ok(res, {
      view,
      path: view === 'SCHOOL' ? '/dashboard/school' : view === 'TEACHER' ? '/dashboard/teacher' : '/dashboard/learner',
      availableViews: [
        ...(hasPermission(actor, 'progress.read.school') ? ['SCHOOL'] : []),
        ...(hasPermission(actor, 'progress.read.scoped') ? ['TEACHER'] : []),
        ...(hasPermission(actor, 'self.learning.participate') ||
        hasPermission(actor, 'progress.read.own')
          ? ['LEARNER']
          : []),
      ],
    });
  }),
);

/** Blueprint 03 Home. Staff may pass `studentId` to see what a learner sees. */
dashboardRouter.get(
  '/learner',
  learnerRead,
  validate({ query: learnerDashboardQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof learnerDashboard>[2];
    ok(res, await learnerDashboard(getContext(req), getSchoolId(req), query));
  }),
);

/** Blueprint 04 Teacher dashboard. */
dashboardRouter.get(
  '/teacher',
  staffProgressRead,
  validate({ query: teacherDashboardQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof teacherDashboard>[2];
    ok(res, await teacherDashboard(getContext(req), getSchoolId(req), query));
  }),
);

/** The full "students needing attention" list behind the card. */
dashboardRouter.get(
  '/attention',
  staffProgressRead,
  validate({ query: attentionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof attentionList>[2];
    const { skip, take } = toSkipTake(query);
    const { items, totalItems } = await attentionList(
      getContext(req),
      getSchoolId(req),
      query,
      skip,
      take,
    );
    paginated(res, items, query.page, query.pageSize, totalItems, {
      minSeverity: query.minSeverity,
    });
  }),
);

/** Blueprint 05 Overview, for a school administrator. */
dashboardRouter.get(
  '/school',
  requirePermission('progress.read.school'),
  validate({ query: schoolDashboardQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof schoolDashboard>[2];
    ok(res, await schoolDashboard(getContext(req), getSchoolId(req), query));
  }),
);

export { dashboardRouter };
