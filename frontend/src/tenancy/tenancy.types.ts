import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/tenancy` — organizations and schools. */

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'PENDING';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  country: string | null;
  timezone: string;
  locale: string;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
  _count: { schools: number; users: number };
}

export interface OrganizationDetail extends OrganizationSummary {
  contactPhone: string | null;
  internalNotes: string | null;
  schools: Array<{ id: string; name: string; slug: string; code: string; status: TenantStatus }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
  }>;
}

export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  code: string;
  status: TenantStatus;
  city: string | null;
  country: string | null;
  timezone: string;
  defaultAgeMode: string;
  launchedAt: string | null;
  onboardingStage: string | null;
  createdAt: string;
  organization: { id: string; name: string; slug: string };
  _count: { users: number; classes: number; grades: number };
}

export interface SchoolDetail {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  code: string;
  status: TenantStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  locale: string;
  defaultAgeMode: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  welcomeMessage: string | null;
  onboardingStage: string | null;
  launchedAt: string | null;
  suspendedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  organization: { id: string; name: string; slug: string; status: TenantStatus };
  settings: SchoolSettings | null;
  logoMedia: { id: string; storageKey: string; altText: string | null } | null;
  activeTheme: { id: string; name: string; key: string; status: string } | null;
  _count: { users: number; grades: number; classes: number; subjects: number; lessons: number };
}

export interface SchoolSettings {
  id: string;
  schoolId: string;
  pointsEnabled: boolean;
  badgesEnabled: boolean;
  streaksEnabled: boolean;
  companionEnabled: boolean;
  missionsEnabled: boolean;
  leaderboardEnabled: boolean;
  leaderboardScope: string;
  leaderboardIdentityMode: string;
  leaderboardRankingMode: string;
  gamificationIntensity: number;
  companionDecayEnabled: boolean;
  screeningEnabled: boolean;
  screeningMaxItems: number;
  screeningTimeLimitMinutes: number | null;
  ongoingCheckFrequencyDays: number;
  reassessmentCooldownDays: number;
  allowStudentSelfReassess: boolean;
  recommendationApprovalRequired: boolean;
  recommendationAutoApproveHours: number | null;
  homeworkEnabled: boolean;
  defaultLateBehavior: string;
  defaultGraceHours: number;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  digestEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  allowedLoginMethods: string[];
  studentPinRequired: boolean;
  studentCodeLength: number;
  sessionIdleMinutes: number;
  contentReportingEnabled: boolean;
  moderationRequired: boolean;
  allowStudentAvatarUpload: boolean;
  dataRetentionMonths: number;
  parentPortalEnabled: boolean;
  /** `PathMode` values this school permits. Empty/null = every mode allowed. */
  allowedPathModes: string[] | null;
  confidenceThresholdModerate: number;
  confidenceThresholdHigh: number;
  /** Per-`AgeMode` override of an assessment's flat `maxAttempts`. */
  attemptLimitByAgeMode: Record<string, number> | null;
  defaultShuffleItems: boolean;
}

export interface OrganizationListQuery extends ListQuery {
  status?: TenantStatus;
}

export interface SchoolListQuery extends ListQuery {
  status?: TenantStatus;
  organizationId?: string;
}
