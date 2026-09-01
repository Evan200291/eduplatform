/**
 * Query key factory.
 *
 * Every key in the app comes from here, so invalidating after a mutation is a
 * matter of naming a scope (`qk.classes.all`) rather than hand-writing an array
 * that has to match the one used by the query. Keys are hierarchical: an
 * invalidation of `['classes']` clears every list and detail below it.
 */
export const qk = {
  auth: {
    me: ['auth', 'me'] as const,
    sessions: ['auth', 'sessions'] as const,
  },
  theme: {
    active: ['theme', 'active'] as const,
    options: ['theme', 'options'] as const,
    list: (params?: unknown) => ['theme', 'list', params ?? {}] as const,
    detail: (id: string) => ['theme', 'detail', id] as const,
    versions: (id: string) => ['theme', 'versions', id] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    list: (params?: unknown) => ['organizations', 'list', params ?? {}] as const,
    detail: (id: string) => ['organizations', 'detail', id] as const,
  },
  schools: {
    all: ['schools'] as const,
    list: (params?: unknown) => ['schools', 'list', params ?? {}] as const,
    detail: (id: string) => ['schools', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params?: unknown) => ['users', 'list', params ?? {}] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  roles: {
    permissions: ['roles', 'permissions'] as const,
  },
  grades: {
    all: ['grades'] as const,
    list: (params?: unknown) => ['grades', 'list', params ?? {}] as const,
  },
  subjects: {
    all: ['subjects'] as const,
    list: (params?: unknown) => ['subjects', 'list', params ?? {}] as const,
  },
  classes: {
    all: ['classes'] as const,
    list: (params?: unknown) => ['classes', 'list', params ?? {}] as const,
    detail: (id: string) => ['classes', 'detail', id] as const,
    roster: (id: string) => ['classes', 'roster', id] as const,
    mine: ['classes', 'mine'] as const,
  },
  curriculum: {
    all: ['curriculum'] as const,
    list: (params?: unknown) => ['curriculum', 'list', params ?? {}] as const,
    detail: (id: string) => ['curriculum', 'detail', id] as const,
  },
  lessons: {
    all: ['lessons'] as const,
    list: (params?: unknown) => ['lessons', 'list', params ?? {}] as const,
    detail: (id: string) => ['lessons', 'detail', id] as const,
  },
  activities: {
    all: ['activities'] as const,
    list: (params?: unknown) => ['activities', 'list', params ?? {}] as const,
    detail: (id: string) => ['activities', 'detail', id] as const,
    delivery: (id: string) => ['activities', 'delivery', id] as const,
  },
  assignments: {
    all: ['assignments'] as const,
    list: (params?: unknown) => ['assignments', 'list', params ?? {}] as const,
    detail: (id: string) => ['assignments', 'detail', id] as const,
    myWork: ['assignments', 'my-work'] as const,
    monitor: (id: string) => ['assignments', 'monitor', id] as const,
  },
  learningPaths: {
    all: ['learning-paths'] as const,
    list: (params?: unknown) => ['learning-paths', 'list', params ?? {}] as const,
    detail: (id: string) => ['learning-paths', 'detail', id] as const,
  },
  recommendations: {
    all: ['recommendations'] as const,
    pending: (params?: unknown) => ['recommendations', 'pending', params ?? {}] as const,
  },
  progress: {
    all: ['progress'] as const,
    mine: ['progress', 'mine'] as const,
    forStudent: (studentId: string) => ['progress', 'student', studentId] as const,
    summary: (params?: unknown) => ['progress', 'summary', params ?? {}] as const,
    notes: (studentId: string) => ['progress', 'notes', studentId] as const,
  },
  mastery: {
    all: ['mastery'] as const,
    forStudent: (studentId: string) => ['mastery', 'student', studentId] as const,
  },
  gamification: {
    summary: ['gamification', 'summary'] as const,
    missions: ['gamification', 'missions'] as const,
    leaderboard: (scope: string) => ['gamification', 'leaderboard', scope] as const,
    companion: ['gamification', 'companion'] as const,
    profile: (studentId?: string) => ['gamification', 'profile', studentId ?? 'self'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params?: unknown) => ['notifications', 'list', params ?? {}] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
    summary: ['notifications', 'summary'] as const,
    preferences: ['notifications', 'preferences'] as const,
  },
  reports: {
    all: ['reports'] as const,
    list: (params?: unknown) => ['reports', 'list', params ?? {}] as const,
    catalogue: ['reports', 'catalogue'] as const,
    run: (idOrKey: string, params?: unknown) => ['reports', 'run', idOrKey, params ?? {}] as const,
    exports: ['reports', 'exports'] as const,
  },
  dashboard: {
    student: ['dashboard', 'student'] as const,
    teacher: ['dashboard', 'teacher'] as const,
    admin: ['dashboard', 'admin'] as const,
    learner: (studentId?: string) => ['dashboard', 'learner', studentId ?? 'self'] as const,
    attention: ['dashboard', 'attention'] as const,
    school: ['dashboard', 'school'] as const,
  },

  // ── Added alongside the frontend build-out — see [[midas-api-envelope-and-auth-contract]] ──

  assessment: {
    definitions: (params?: unknown) => ['assessment', 'definitions', params ?? {}] as const,
    definition: (id: string) => ['assessment', 'definition', id] as const,
    attempts: (params?: unknown) => ['assessment', 'attempts', params ?? {}] as const,
    attempt: (id: string) => ['assessment', 'attempt', id] as const,
    nextItem: (attemptId: string) => ['assessment', 'next-item', attemptId] as const,
    mastery: (studentId: string, subjectId?: string) =>
      ['assessment', 'mastery', studentId, subjectId ?? 'all'] as const,
  },
  activePath: (subjectId: string, studentId?: string) =>
    ['learning-paths', 'active', subjectId, studentId ?? 'self'] as const,
  points: {
    ledger: (params?: unknown) => ['points', 'ledger', params ?? {}] as const,
    summary: (studentId?: string) => ['points', 'summary', studentId ?? 'self'] as const,
    balance: (studentId?: string) => ['points', 'balance', studentId ?? 'self'] as const,
  },
  badges: {
    list: (params?: unknown) => ['badges', 'list', params ?? {}] as const,
    detail: (id: string) => ['badges', 'detail', id] as const,
    mine: (studentId?: string) => ['badges', 'mine', studentId ?? 'self'] as const,
    progress: (studentId?: string) => ['badges', 'progress', studentId ?? 'self'] as const,
  },
  streaks: {
    mine: (studentId?: string) => ['streaks', 'mine', studentId ?? 'self'] as const,
    config: ['streaks', 'config'] as const,
  },
  rewards: {
    list: (params?: unknown) => ['rewards', 'list', params ?? {}] as const,
    mine: (studentId?: string) => ['rewards', 'mine', studentId ?? 'self'] as const,
  },
  missions: {
    mine: (studentId?: string) => ['missions', 'mine', studentId ?? 'self'] as const,
    summary: (studentId?: string) => ['missions', 'summary', studentId ?? 'self'] as const,
    progress: (params?: unknown) => ['missions', 'progress', params ?? {}] as const,
    list: (params?: unknown) => ['missions', 'list', params ?? {}] as const,
  },
  leaderboard: {
    mine: (studentId?: string) => ['leaderboard', 'mine', studentId ?? 'self'] as const,
    list: ['leaderboard', 'list'] as const,
    detail: (id: string) => ['leaderboard', 'detail', id] as const,
    /** Admin config screen: every board a school has defined, including inactive/archived. */
    config: (params?: unknown) => ['leaderboard', 'config', params ?? {}] as const,
  },
  companion: {
    mine: (studentId?: string) => ['companion', 'mine', studentId ?? 'self'] as const,
    summary: (studentId?: string) => ['companion', 'summary', studentId ?? 'self'] as const,
    events: (studentId?: string) => ['companion', 'events', studentId ?? 'self'] as const,
    species: ['companion', 'species'] as const,
    growthConfig: ['companion', 'growth-config'] as const,
  },
  terms: {
    all: ['terms'] as const,
  },

  // ── Added for the admin panel build-out (tenancy, users, entitlements, subscription, privacy) ──

  schoolSettings: {
    current: ['school-settings', 'current'] as const,
    detail: (schoolId: string) => ['school-settings', 'detail', schoolId] as const,
  },
  invitations: {
    list: (params?: unknown) => ['invitations', 'list', params ?? {}] as const,
  },
  userGroups: {
    list: (params?: unknown) => ['user-groups', 'list', params ?? {}] as const,
    detail: (id: string) => ['user-groups', 'detail', id] as const,
  },
  featureRegistry: {
    list: (params?: unknown) => ['feature-registry', 'list', params ?? {}] as const,
    detail: (key: string) => ['feature-registry', 'detail', key] as const,
  },
  entitlements: {
    catalogue: (params?: unknown) => ['entitlements', 'catalogue', params ?? {}] as const,
    list: (params?: unknown) => ['entitlements', 'list', params ?? {}] as const,
  },
  plans: {
    all: ['plans', 'all'] as const,
  },
  subscriptions: {
    current: ['subscriptions', 'current'] as const,
    currentSeats: ['subscriptions', 'current-seats'] as const,
    list: (params?: unknown) => ['subscriptions', 'list', params ?? {}] as const,
    detail: (id: string) => ['subscriptions', 'detail', id] as const,
    packaging: (id: string) => ['subscriptions', 'packaging', id] as const,
  },
  dataRequests: {
    summary: ['data-requests', 'summary'] as const,
    list: (params?: unknown) => ['data-requests', 'list', params ?? {}] as const,
    detail: (id: string) => ['data-requests', 'detail', id] as const,
  },
  consent: {
    purposes: ['consent', 'purposes'] as const,
    register: ['consent', 'register'] as const,
    list: (params?: unknown) => ['consent', 'list', params ?? {}] as const,
  },
  retention: {
    options: ['retention', 'options'] as const,
    list: (params?: unknown) => ['retention', 'list', params ?? {}] as const,
  },
  audit: {
    summary: (days?: number) => ['audit', 'summary', days ?? 30] as const,
    list: (params?: unknown) => ['audit', 'list', params ?? {}] as const,
    detail: (id: string) => ['audit', 'detail', id] as const,
    targetHistory: (targetType: string, targetId: string) =>
      ['audit', 'target-history', targetType, targetId] as const,
  },
} as const;
