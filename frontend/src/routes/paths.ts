import type { Surface } from '@/types/enums';

/**
 * Every URL in the app, in one place.
 *
 * Route strings are duplicated by nature — a `<Route path>` and every `<Link to>`
 * that targets it. Centralising them means renaming a URL is one edit, and a typo
 * in a link is a TypeScript error instead of a blank screen. Functions are used
 * wherever a segment is dynamic so callers cannot forget to encode an id.
 *
 * Keep the shape mirroring the URL hierarchy: `paths.teach.classDetail(id)` reads
 * the same way the address bar does.
 */
export const paths = {
  root: '/',

  login: '/login',
  acceptInvitation: '/accept-invitation',
  changePassword: '/change-password',
  sessions: '/account/sessions',
  preferences: '/account/preferences',

  /** Student platform. */
  learn: {
    base: '/learn',
    home: '/learn',
    activities: '/learn/activities',
    activity: (activityId: string) => `/learn/activities/${encodeURIComponent(activityId)}`,
    missions: '/learn/missions',
    leaderboard: '/learn/leaderboard',
    companion: '/learn/companion',
    progress: '/learn/progress',
    profile: '/learn/profile',
    notifications: '/learn/notifications',
    screening: '/learn/screening',
  },

  /** Teacher portal. */
  teach: {
    base: '/teach',
    dashboard: '/teach',
    classes: '/teach/classes',
    classDetail: (classId: string) => `/teach/classes/${encodeURIComponent(classId)}`,
    students: '/teach/students',
    studentDetail: (studentId: string) => `/teach/students/${encodeURIComponent(studentId)}`,
    paths: '/teach/paths',
    pathDetail: (pathId: string) => `/teach/paths/${encodeURIComponent(pathId)}`,
    assignments: '/teach/assignments',
    assignmentDetail: (assignmentId: string) =>
      `/teach/assignments/${encodeURIComponent(assignmentId)}`,
    recommendations: '/teach/recommendations',
    reports: '/teach/reports',
    notifications: '/teach/notifications',
  },

  /** Admin panel. */
  admin: {
    base: '/admin',
    overview: '/admin',
    organizations: '/admin/organizations',
    organizationDetail: (orgId: string) => `/admin/organizations/${encodeURIComponent(orgId)}`,
    schools: '/admin/schools',
    schoolDetail: (schoolId: string) => `/admin/schools/${encodeURIComponent(schoolId)}`,
    users: '/admin/users',
    userDetail: (userId: string) => `/admin/users/${encodeURIComponent(userId)}`,
    roles: '/admin/roles',
    academic: '/admin/academic',
    curriculum: '/admin/curriculum',
    assessment: '/admin/assessment',
    gamification: '/admin/gamification',
    branding: '/admin/branding',
    features: '/admin/features',
    analytics: '/admin/analytics',
    billing: '/admin/billing',
    audit: '/admin/audit',
    settings: '/admin/settings',
  },

  forbidden: '/no-access',
} as const;

/** Where each surface starts. Pairs with `homeSurfaceFor()` from `@/auth`. */
export const SURFACE_HOME: Record<Surface, string> = {
  student: paths.learn.home,
  teacher: paths.teach.dashboard,
  admin: paths.admin.overview,
};
