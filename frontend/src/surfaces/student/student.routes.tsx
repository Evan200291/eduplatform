import type { RouteObject } from 'react-router-dom';
import { RequirePermission } from '@/routes/RequirePermission';
import { StudentSurface } from './StudentSurface';
import {
  ActivitiesPage,
  ActivityPlayerPage,
  CompanionPage,
  LeaderboardPage,
  MissionsPage,
  ScreeningPage,
  StudentHomePage,
  StudentNotificationsPage,
  StudentProfilePage,
  StudentProgressPage,
} from './pages';

/**
 * Routes under `/learn` (blueprint §03).
 *
 * Child paths are written as literal relative segments rather than taken from
 * `paths`, because the helpers there encode their arguments — correct for a link,
 * wrong for a route pattern, where `:activityId` must survive intact. The two
 * stay in step because both live in this repository and `paths.learn.*` is what
 * every link uses.
 *
 * The surface itself is ungated: parents land here too, and they hold none of the
 * participation permissions, so the gate belongs on each screen. Grouping the
 * gated screens under pathless `RequirePermission` routes keeps one gate per
 * permission instead of one per page.
 */
export const STUDENT_ROUTES: readonly RouteObject[] = [
  {
    path: '/learn',
    element: <StudentSurface />,
    children: [
      { index: true, element: <StudentHomePage /> },
      { path: 'profile', element: <StudentProfilePage /> },
      { path: 'notifications', element: <StudentNotificationsPage /> },
      {
        element: <RequirePermission anyOf={['activity.read']} />,
        children: [
          { path: 'activities', element: <ActivitiesPage /> },
          { path: 'activities/:activityId', element: <ActivityPlayerPage /> },
        ],
      },
      {
        element: <RequirePermission anyOf={['assessment.attempt.start']} />,
        children: [{ path: 'screening', element: <ScreeningPage /> }],
      },
      {
        element: <RequirePermission anyOf={['mission.read']} />,
        children: [{ path: 'missions', element: <MissionsPage /> }],
      },
      {
        element: <RequirePermission anyOf={['companion.read']} />,
        children: [{ path: 'companion', element: <CompanionPage /> }],
      },
      {
        element: <RequirePermission anyOf={['leaderboard.read']} />,
        children: [{ path: 'leaderboard', element: <LeaderboardPage /> }],
      },
      {
        element: <RequirePermission anyOf={['progress.read.own']} />,
        children: [{ path: 'progress', element: <StudentProgressPage /> }],
      },
    ],
  },
];
