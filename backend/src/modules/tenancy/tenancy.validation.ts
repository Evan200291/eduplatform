// ─────────────────────────────────────────────────────────────────────────────
// Tenancy request schemas
// Blueprint 05: an administrator configures an organization and its schools;
// blueprint 06 puts the school-level configuration layer in `SchoolSettings`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AgeMode,
  LateBehavior,
  LeaderboardIdentityMode,
  LeaderboardRankingMode,
  LeaderboardScope,
  LoginMethod,
  PathMode,
  TenantStatus,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  emailSchema,
  hexColor,
  idSchema,
  keySchema,
  optionalText,
  text,
} from '../../core/http/validate';

const countryCode = z
  .string()
  .trim()
  .length(2, 'Use a two-letter country code.')
  .toUpperCase()
  .optional();

const timezone = z
  .string()
  .trim()
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Use a valid IANA timezone such as Europe/London.' },
  );

export const organizationListQuery = listQuerySchema.extend({
  status: z.nativeEnum(TenantStatus).optional(),
});

export const createOrganizationSchema = z.object({
  name: text(180, 2),
  slug: keySchema.optional(),
  contactName: optionalText(140),
  contactEmail: emailSchema.optional(),
  contactPhone: optionalText(40),
  country: countryCode,
  timezone: timezone.default('UTC'),
  locale: z.string().trim().max(16).default('en'),
  internalNotes: optionalText(4000),
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

export const schoolListQuery = listQuerySchema.extend({
  status: z.nativeEnum(TenantStatus).optional(),
  organizationId: idSchema.optional(),
});

export const createSchoolSchema = z.object({
  organizationId: idSchema,
  name: text(180, 2),
  slug: keySchema.optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens.')
    .optional(),
  contactName: optionalText(140),
  contactEmail: emailSchema.optional(),
  contactPhone: optionalText(40),
  addressLine: optionalText(240),
  city: optionalText(120),
  country: countryCode,
  timezone: timezone.default('UTC'),
  locale: z.string().trim().max(16).default('en'),
  defaultAgeMode: z.nativeEnum(AgeMode).default(AgeMode.PRIMARY),
  primaryColor: hexColor.default('#4F46E5'),
  secondaryColor: hexColor.default('#0EA5E9'),
  accentColor: hexColor.default('#F59E0B'),
  welcomeMessage: optionalText(500),
});

export const updateSchoolSchema = createSchoolSchema
  .omit({ organizationId: true })
  .partial()
  .extend({
    logoMediaId: idSchema.nullable().optional(),
    activeThemeId: idSchema.nullable().optional(),
    onboardingStage: optionalText(60),
  });

/** Blueprint 05: suspension and archiving require a reason for the audit trail. */
export const tenantStatusSchema = z.object({
  status: z.nativeEnum(TenantStatus),
  reason: text(400, 3),
});

/**
 * School settings. Every field is optional so the admin UI can patch one control
 * at a time without resending the whole object.
 */
export const updateSchoolSettingsSchema = z
  .object({
    // Gamification
    pointsEnabled: z.boolean(),
    badgesEnabled: z.boolean(),
    streaksEnabled: z.boolean(),
    companionEnabled: z.boolean(),
    missionsEnabled: z.boolean(),
    leaderboardEnabled: z.boolean(),
    leaderboardScope: z.nativeEnum(LeaderboardScope),
    leaderboardIdentityMode: z.nativeEnum(LeaderboardIdentityMode),
    leaderboardRankingMode: z.nativeEnum(LeaderboardRankingMode),
    gamificationIntensity: z.number().int().min(0).max(100),
    companionDecayEnabled: z.boolean(),

    // Assessment and placement
    screeningEnabled: z.boolean(),
    screeningMaxItems: z.number().int().min(4).max(120),
    screeningTimeLimitMinutes: z.number().int().min(1).max(240).nullable(),
    ongoingCheckFrequencyDays: z.number().int().min(1).max(365),
    reassessmentCooldownDays: z.number().int().min(0).max(365),
    allowStudentSelfReassess: z.boolean(),
    recommendationApprovalRequired: z.boolean(),
    recommendationAutoApproveHours: z.number().int().min(1).max(720).nullable(),

    // Homework
    homeworkEnabled: z.boolean(),
    defaultLateBehavior: z.nativeEnum(LateBehavior),
    defaultGraceHours: z.number().int().min(0).max(720),

    // Notifications
    emailNotificationsEnabled: z.boolean(),
    pushNotificationsEnabled: z.boolean(),
    digestEnabled: z.boolean(),
    quietHoursStart: z.number().int().min(0).max(23).nullable(),
    quietHoursEnd: z.number().int().min(0).max(23).nullable(),

    // Identity and access
    allowedLoginMethods: z.array(z.nativeEnum(LoginMethod)).min(1),
    studentPinRequired: z.boolean(),
    studentCodeLength: z.number().int().min(6).max(12),
    sessionIdleMinutes: z.number().int().min(10).max(1440),

    // Safety and privacy
    contentReportingEnabled: z.boolean(),
    moderationRequired: z.boolean(),
    allowStudentAvatarUpload: z.boolean(),
    dataRetentionMonths: z.number().int().min(1).max(240),
    parentPortalEnabled: z.boolean(),

    // Assessment/learning engine config
    /** Empty array or null means every `PathMode` is permitted. */
    allowedPathModes: z.array(z.nativeEnum(PathMode)).nullable(),
    confidenceThresholdModerate: z.number().int().min(1).max(50),
    confidenceThresholdHigh: z.number().int().min(1).max(100),
    /** Per-`AgeMode` override of an assessment's flat `maxAttempts`. */
    attemptLimitByAgeMode: z.record(z.nativeEnum(AgeMode), z.number().int().min(1).max(100)).nullable(),
    defaultShuffleItems: z.boolean(),

    // Companion growth config and streak behavior config are intentionally NOT
    // here: they are gated by `companion.config` / `gamification.config` rather
    // than `school.settings.write`. See companion.validation.ts and
    // gamification.validation.ts, which patch the same `SchoolSettings` row
    // through their own narrower schemas and routes.
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to update.',
  })
  .refine(
    (value) =>
      value.confidenceThresholdModerate === undefined ||
      value.confidenceThresholdHigh === undefined ||
      value.confidenceThresholdModerate < value.confidenceThresholdHigh,
    { message: 'The moderate-confidence threshold must be lower than the high-confidence threshold.' },
  );

/** The unauthenticated lookup used by the tenant-aware sign-in screen. */
export const publicSchoolParams = z.object({
  slug: z.string().trim().min(1).max(80),
});
