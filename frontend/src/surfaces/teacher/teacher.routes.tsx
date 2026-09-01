import type { RouteObject } from 'react-router-dom';
import type { Permission } from '@/auth';
import { RequirePermission } from '@/routes/RequirePermission';
import { TeacherSurface } from './TeacherSurface';
import {
  AssignmentDetailPage,
  AssignmentsPage,
  ClassDetailPage,
  ClassesPage,
  LearningPathDetailPage,
  LearningPathsPage,
  RecommendationsPage,
  StudentDetailPage,
  StudentsPage,
  TeacherDashboardPage,
  TeacherNotificationsPage,
  TeacherReportsPage,
} from './pages';

/**
 * Who may open the teacher portal at all.
 *
 * Deliberately not a role check: `class.read` covers teachers, curriculum
 * managers and school admins, and `content.review` lets a content reviewer in —
 * they have no classes but this is where their work lives. A student holds
 * neither, so guessing `/teach` gets them the no-access screen rather than an
 * empty dashboard.
 */
const TEACHER_SURFACE: readonly Permission[] = ['class.read', 'content.review'];

/**
 * Routes under `/teach` (blueprint §04).
 *
 * Child paths are literal relative segments, not `paths.teach.*` calls: those
 * encode their arguments, which is right for a link and wrong for a route pattern.
 */
export const TEACHER_ROUTES: readonly RouteObject[] = [
  {
    element: <RequirePermission anyOf={TEACHER_SURFACE} />,
    children: [
      {
        path: '/teach',
        element: <TeacherSurface />,
        children: [
          { index: true, element: <TeacherDashboardPage /> },
          {
            element: <RequirePermission anyOf={['class.read']} />,
            children: [
              { path: 'classes', element: <ClassesPage /> },
              { path: 'classes/:classId', element: <ClassDetailPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['user.read']} />,
            children: [
              { path: 'students', element: <StudentsPage /> },
              { path: 'students/:studentId', element: <StudentDetailPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['learningpath.read']} />,
            children: [
              { path: 'paths', element: <LearningPathsPage /> },
              { path: 'paths/:pathId', element: <LearningPathDetailPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['assignment.read']} />,
            children: [
              { path: 'assignments', element: <AssignmentsPage /> },
              { path: 'assignments/:assignmentId', element: <AssignmentDetailPage /> },
            ],
          },
          {
            element: <RequirePermission anyOf={['recommendation.read']} />,
            children: [{ path: 'recommendations', element: <RecommendationsPage /> }],
          },
          {
            element: <RequirePermission anyOf={['report.read.scoped', 'report.read.school']} />,
            children: [{ path: 'reports', element: <TeacherReportsPage /> }],
          },
          {
            element: <RequirePermission anyOf={['notification.read']} />,
            children: [{ path: 'notifications', element: <TeacherNotificationsPage /> }],
          },
        ],
      },
    ],
  },
];
