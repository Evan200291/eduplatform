import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { Permission } from '@/auth';
import { RequirePermission } from '@/routes/RequirePermission';
import { RequireSchoolContext } from '@/routes/RequireSchoolContext';
import { AdminSurface } from './AdminSurface';

/*
 * Each surface's screens load as one chunk the first time someone enters
 * that surface, so a learner never downloads the admin panel. The shells
 * already render a Suspense fallback around their outlet.
 */
const loadPages = () => import('./pages');
const AcademicPage = lazy(() => loadPages().then((m) => ({ default: m.AcademicPage })));
const AdminOverviewPage = lazy(() => loadPages().then((m) => ({ default: m.AdminOverviewPage })));
const AgreementsPage = lazy(() => loadPages().then((m) => ({ default: m.AgreementsPage })));
const AnalyticsPage = lazy(() => loadPages().then((m) => ({ default: m.AnalyticsPage })));
const AssessmentPage = lazy(() => loadPages().then((m) => ({ default: m.AssessmentPage })));
const AuditPage = lazy(() => loadPages().then((m) => ({ default: m.AuditPage })));
const BillingPage = lazy(() => loadPages().then((m) => ({ default: m.BillingPage })));
const BrandingPage = lazy(() => loadPages().then((m) => ({ default: m.BrandingPage })));
const CurriculumPage = lazy(() => loadPages().then((m) => ({ default: m.CurriculumPage })));
const FeaturesPage = lazy(() => loadPages().then((m) => ({ default: m.FeaturesPage })));
const GamificationPage = lazy(() => loadPages().then((m) => ({ default: m.GamificationPage })));
const ModerationPage = lazy(() => loadPages().then((m) => ({ default: m.ModerationPage })));
const ContentRightsPage = lazy(() => loadPages().then((m) => ({ default: m.ContentRightsPage })));
const MediaLibraryPage = lazy(() => loadPages().then((m) => ({ default: m.MediaLibraryPage })));
const PrivacyPage = lazy(() => loadPages().then((m) => ({ default: m.PrivacyPage })));
const OrganizationDetailPage = lazy(() => loadPages().then((m) => ({ default: m.OrganizationDetailPage })));
const OrganizationsPage = lazy(() => loadPages().then((m) => ({ default: m.OrganizationsPage })));
const PlatformOpsPage = lazy(() => loadPages().then((m) => ({ default: m.PlatformOpsPage })));
const RolesPage = lazy(() => loadPages().then((m) => ({ default: m.RolesPage })));
const SchoolDetailPage = lazy(() => loadPages().then((m) => ({ default: m.SchoolDetailPage })));
const SchoolsPage = lazy(() => loadPages().then((m) => ({ default: m.SchoolsPage })));
const SettingsPage = lazy(() => loadPages().then((m) => ({ default: m.SettingsPage })));
const SupportPage = lazy(() => loadPages().then((m) => ({ default: m.SupportPage })));
const UserDetailPage = lazy(() => loadPages().then((m) => ({ default: m.UserDetailPage })));
const UsersPage = lazy(() => loadPages().then((m) => ({ default: m.UsersPage })));

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
              {
                element: <RequirePermission anyOf={['content.report.review']} />,
                children: [{ path: 'moderation', element: <ModerationPage /> }],
              },
              {
                element: <RequirePermission anyOf={['content.ownership.read']} />,
                children: [{ path: 'content-ownership', element: <ContentRightsPage /> }],
              },
              {
                element: <RequirePermission anyOf={['media.read']} />,
                children: [{ path: 'media', element: <MediaLibraryPage /> }],
              },
              {
                element: <RequirePermission anyOf={['datarequest.read', 'consent.read']} />,
                children: [{ path: 'privacy', element: <PrivacyPage /> }],
              },
              {
                element: <RequirePermission anyOf={['support.create', 'support.read.all']} />,
                children: [{ path: 'support', element: <SupportPage /> }],
              },
            ],
          },
          {
            element: <RequirePermission anyOf={['platform.overview.read', 'platform.jobs.read']} />,
            children: [{ path: 'platform', element: <PlatformOpsPage /> }],
          },
          {
            element: <RequirePermission anyOf={['subscription.write']} />,
            children: [{ path: 'agreements', element: <AgreementsPage /> }],
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
