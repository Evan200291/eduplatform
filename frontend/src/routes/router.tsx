import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ACCOUNT_ROUTES } from '@/surfaces/account/account.routes';
import { ADMIN_ROUTES } from '@/surfaces/admin/admin.routes';
import { CHANGE_PASSWORD_ROUTE, GUEST_ROUTES } from '@/surfaces/auth/auth.routes';
import { STUDENT_ROUTES } from '@/surfaces/student/student.routes';
import { TEACHER_ROUTES } from '@/surfaces/teacher/teacher.routes';
import { ForbiddenPage } from '@/surfaces/system/ForbiddenPage';
import { NotFoundPage } from '@/surfaces/system/NotFoundPage';
import { RequireAuth } from './RequireAuth';
import { RootRedirect } from './RootRedirect';
import { paths } from './paths';

/**
 * The whole route table, assembled from one file per surface.
 *
 * This file only composes: each surface owns its own paths, screens and
 * permission gates next to its navigation, so adding a teacher screen never
 * means editing the router. Read top to bottom and the four zones are visible —
 * public, guest-only, authenticated, and the two error pages.
 *
 * Layering is deliberate. `RequireAuth` sits above every surface so the
 * "signed in?" question is answered once; `RequirePermission` sits inside each
 * surface so a user who lacks one screen still gets the rest. Neither is
 * security: the API re-checks every request, and these guards exist so people
 * are not shown doors that will not open.
 *
 * Screens are imported eagerly. The app is small enough that a second network
 * round-trip mid-navigation would cost a learner more than the extra kilobytes;
 * when the bundle warrants splitting, add `lazy:` to the surface route objects —
 * the shells already render a `Suspense` fallback.
 */
export const ROUTES: RouteObject[] = [
  { path: paths.root, element: <RootRedirect /> },

  GUEST_ROUTES,

  {
    element: <RequireAuth />,
    children: [
      CHANGE_PASSWORD_ROUTE,
      ...ACCOUNT_ROUTES,
      ...STUDENT_ROUTES,
      ...TEACHER_ROUTES,
      ...ADMIN_ROUTES,
    ],
  },

  // Both are reachable without a session on purpose: a signed-out user following
  // a stale link should be told what happened, not bounced to a login form.
  { path: paths.forbidden, element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
];

export function createRouter() {
  return createBrowserRouter(ROUTES);
}
