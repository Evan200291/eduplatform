import type { RouteObject } from 'react-router-dom';
import type { Permission } from '@/auth';
import { RequirePermission } from '@/routes/RequirePermission';
import { RequireSchoolContext } from '@/routes/RequireSchoolContext';
import { AdminSurface } from './AdminSurface';
import {
  AcademicPage,
  AdminOverviewPage,
  AnalyticsPage,
  AssessmentPage,
  AuditPage,
  BillingPage,
  BrandingPage,
  CurriculumPage,
  FeaturesPage,
  GamificationPage,
  OrganizationDetailPage,
  OrganizationsPage,
  RolesPage,
  SchoolDetailPage,
  SchoolsPage,
  SettingsPage,
  UserDetailPage,
  UsersPage,
} from './pages';

/**
 * Who may open the admin panel at all.
 *
 * One permission per administrative job rather than a role list, because the same
 * panel serves a school administrator, a billing administrator, a support agent,
 * a report viewer and platform operations — each of whom sees a different subset
 * of it once inside.
 */
const ADMIN_SURFACE: readonly Permission[] = [
  'school.update',
  'user.create',
  'role.assign',
  'subscription.read',
  'support.read.all',
  'report.read.school',
  'platform.overview.read',
];

/**
 * Routes under `/admin` (blueprint §05).
 *
 * Child paths are literal relative segments, not `paths.admin.*` calls: those
 * encode their arguments, which is right for a link and wrong for a route pattern.
 */
export const ADMIN_ROUTES: readonly RouteObject[] = [
  {
    element: <RequirePermission anyOf={ADMIN_SURFACE} />,
    children: [
      {
        path: '/admin',
        element: <AdminSurface />,
        children: [
          /*
           * Everything from here to the Organizations block is scoped to one
           * school, so platform staff are asked to pick one before any of it
           * tries to load. Organizations and Schools sit deliberately outside
           * that gate — they are platform-level, and they are where a platform
           * owner goes to find the school they are about to choose.
           */
          {
            element: <RequireSchoolContext />,
            children: [
              { index: true, element: <AdminOverviewPage /> },
              {
                element: <RequirePermission anyOf={['user.read']} />,
                children: [
                  { path: 'users', element: <UsersPage /> },
                  { path: 'users/:userId', element: <UserDetailPage /> },
                ],
              },
              {
                element: <RequirePermission anyOf={['role.assign']} />,
                children: [{ path: 'roles', element: <RolesPage /> }],
              },
              {
                element: <RequirePermission anyOf={['grade.read', 'class.read']} />,
                children: [{ path: 'academic', element: <AcademicPage /> }],
              },
              {
                element: <RequirePermission anyOf={['curriculum.read']} />,
                children: [{ path: 'curriculum', element: <CurriculumPage /> }],
              },
              {
                element: <RequirePermission anyOf={['assessment.read']} />,
                children: [{ path: 'assessment', element: <AssessmentPage /> }],
              },
              {
                element: <RequirePermission anyOf={['gamification.read']} />,
                children: [{ path: 'gamification', element: <GamificationPage /> }],
              },
              {
                element: <RequirePermission anyOf={['theme.read']} />,
                children: [{ path: 'branding', element: <BrandingPage /> }],
              },
              {
                element: (
                  <RequirePermission anyOf={['entitlement.read', 'platform.features.read']} />
                ),
                children: [{ path: 'features', element: <FeaturesPage /> }],
              },
              {
                element: (
                  <RequirePermission anyOf={['school.settings.read', 'platform.settings.read']} />
                ),
                children: [{ path: 'settings', element: <SettingsPage /> }],
              },
              {
                element: (
                  <RequirePermission
                    anyOf={[
                      'report.read.school',
                      'report.read.organization',
                      'report.read.platform',
                    ]}
                  />
                ),
                children: [{ path: 'analytics', element: <AnalyticsPage /> }],
              },
              {
                element: <RequirePermission anyOf={['subscription.read']} />,
                children: [{ path: 'billing', element: <BillingPage /> }],
              },
              {
                element: <RequirePermission anyOf={['audit.read.school', 'audit.read.platform']} />,
                children: [{ path: 'audit', element: <AuditPage /> }],
              },
            ],
          },
          {
            element: <RequirePermission anyOf={['organization.read']} />,
            children: [
              { path: 'organizations', element: <OrganizationsPage /> },
              {
                path: 'organizations/:orgId',
                element: <OrganizationDetailPage />,
              },
            ],
          },
          {
            element: <RequirePermission anyOf={['school.create', 'school.read']} />,
            children: [
              { path: 'schools', element: <SchoolsPage /> },
              { path: 'schools/:schoolId', element: <SchoolDetailPage /> },
            ],
          },
        ],
      },
    ],
  },
];
