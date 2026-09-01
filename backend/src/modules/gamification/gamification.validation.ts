// ─────────────────────────────────────────────────────────────────────────────
// Gamification validation
// Blueprint 12 "Points ledger principle": every change records a reason, source
// event, value, timestamp — and a reversal where necessary. The schemas below
// make that mandatory rather than optional: an award needs a reason, an
// adjustment needs a note explaining itself, and a reversal needs both.
//
// Blueprint 03 shapes the rest: rewards are "cosmetic or recognition-based.
// Nothing purchasable with real money, and nothing that gates learning content",
// so a reward carries a `pointsCost` in ledger points only and no currency field
// exists to validate. Badges must recognise effort as well as attainment, which
// is why `recognisesEffort` is a first-class flag rather than a tag.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AgeMode,
  BadgeTier,
  MasteryLevel,
  PointsReason,
  RewardKind,
  StreakKind,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  jsonValue,
  keySchema,
  optionalDate,
  optionalText,
  text,
} from '../../core/http/validate';

/**
 * A single award is capped well below the Int column limit. The cap is a
 * safety rail against a mis-typed bulk award, not a pedagogical rule.
 */
const POINTS_MAX = 100_000;

/** Reasons a human is allowed to pick. The rest are written by the engine. */
const MANUAL_REASONS = [
  PointsReason.TEACHER_AWARD,
  PointsReason.MANUAL_ADJUSTMENT,
  PointsReason.MASTERY_MILESTONE,
  PointsReason.STREAK_BONUS,
  PointsReason.ONBOARDING_COMPLETION,
] as const;

// ── Points ──────────────────────────────────────────────────────────────────

export const ledgerListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  reason: z.nativeEnum(PointsReason).optional(),
  sourceType: optionalText(40),
  sourceId: optionalText(32),
  from: optionalDate,
  to: optionalDate,
  /** Reversed entries stay in the ledger; this hides them from a running view. */
  includeReversed: boolQuery(true),
});

export const balanceQuery = z.object({
  studentId: idSchema.optional(),
  from: optionalDate,
  to: optionalDate,
});

export const awardPointsSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
    /** Positive for an award. A deduction goes through `adjust`, which is audited differently. */
    points: z.coerce.number().int().min(1).max(POINTS_MAX),
    reason: z.enum(MANUAL_REASONS).default(PointsReason.TEACHER_AWARD),
    note: text(400),
    sourceType: optionalText(40),
    sourceId: optionalText(32),
    occurredAt: optionalDate,
  })
  .strict();

/**
 * A correction. `points` is signed here because an adjustment exists precisely to
 * move a balance either way — but the note is required, so a negative adjustment
 * always carries its explanation into the audit trail.
 */
export const adjustPointsSchema = z
  .object({
    studentId: idSchema,
    points: z.coerce
      .number()
      .int()
      .min(-POINTS_MAX)
      .max(POINTS_MAX)
      .refine((value) => value !== 0, 'An adjustment of zero would record nothing.'),
    note: text(400),
    occurredAt: optionalDate,
  })
  .strict();

export const reversePointsSchema = z.object({ reason: text(400) }).strict();

// ── Badges ──────────────────────────────────────────────────────────────────

/**
 * The machine-checkable rule. Each variant maps to a check in
 * `gamification.rules.ts`; anything else is rejected here so an unreadable rule
 * never reaches the database and silently stops awarding.
 */
export const badgeCriteriaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('points'),
    threshold: z.coerce.number().int().min(1).max(POINTS_MAX),
  }),
  z.object({
    type: z.literal('streak'),
    kind: z.nativeEnum(StreakKind),
    days: z.coerce.number().int().min(2).max(365),
  }),
  z.object({
    type: z.literal('activities'),
    count: z.coerce.number().int().min(1).max(10_000),
  }),
  z.object({
    type: z.literal('assignments'),
    count: z.coerce.number().int().min(1).max(10_000),
    onTimeOnly: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('mastery'),
    count: z.coerce.number().int().min(1).max(1000),
    /**
     * Read against `MasteryRecord.level`. Only levels at or above "developing"
     * are offered: rewarding NOT_ASSESSED or EMERGING would celebrate a gap.
     */
    minLevel: z
      .enum([MasteryLevel.DEVELOPING, MasteryLevel.PROFICIENT, MasteryLevel.MASTERED])
      .default(MasteryLevel.PROFICIENT),
  }),
  z.object({
    type: z.literal('improvement'),
    /** Percentage points gained between the first and latest score on a topic. */
    gainPercent: z.coerce.number().int().min(1).max(100),
  }),
  /** Awarded by a person. Blueprint 03: not everything worth recognising is measurable. */
  z.object({ type: z.literal('manual') }),
]);

export const badgeListQuery = listQuerySchema.extend({
  tier: z.nativeEnum(BadgeTier).optional(),
  activeOnly: boolQuery(true),
  includeArchived: boolQuery(false),
  recognisesEffort: boolQuery().optional(),
  /** Adds the calling learner's own award state to each row. */
  withMine: boolQuery(false),
});

export const createBadgeSchema = z
  .object({
    key: keySchema,
    name: text(140),
    description: text(500),
    tier: z.nativeEnum(BadgeTier).default(BadgeTier.BRONZE),
    pointsValue: z.coerce.number().int().min(0).max(POINTS_MAX).default(0),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(true),
    recognisesEffort: z.boolean().default(false),
    criteria: badgeCriteriaSchema,
    criteriaLabel: text(300),
    iconMediaId: idSchema.optional(),
    iconKey: optionalText(60),
  })
  .strict();

export const updateBadgeSchema = createBadgeSchema
  .omit({ key: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const awardBadgeSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
    reason: text(400),
  })
  .strict();

export const revokeBadgeSchema = z
  .object({ studentIds: z.array(idSchema).min(1).max(200), reason: text(400) })
  .strict();

export const studentBadgeListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  badgeId: idSchema.optional(),
  includeRevoked: boolQuery(false),
  unseenOnly: boolQuery(false),
});

// ── Streaks ─────────────────────────────────────────────────────────────────

export const streakListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  kind: z.nativeEnum(StreakKind).optional(),
  /** Learners whose streak lapses today unless they do something. */
  atRiskOnly: boolQuery(false),
});

/**
 * A teacher restoring a freeze after an authorised absence. Blueprint 03: streaks
 * "encourage habit without punishing absence", so illness should not cost a child
 * three weeks of effort.
 */
export const grantFreezeSchema = z
  .object({
    studentId: idSchema,
    kind: z.nativeEnum(StreakKind),
    freezes: z.coerce.number().int().min(1).max(5).default(1),
    reason: text(400),
  })
  .strict();

/**
 * The three streak-behavior knobs a school may configure. Every field required so
 * the admin form always saves a complete, unambiguous state.
 */
export const streakConfigSchema = z
  .object({
    /** Freezes granted to a brand-new streak, and restored when one breaks. */
    defaultFreezes: z.number().int().min(0).max(30),
    /** Whether Saturday/Sunday count toward a daily-granularity streak's continuity. */
    weekendsCount: z.boolean(),
    /** Cap on accumulated freezes. Null means unlimited. */
    maxFreezes: z.number().int().min(0).max(90).nullable(),
  })
  .strict();

export type StreakConfigInput = z.infer<typeof streakConfigSchema>;

// ── Rewards ─────────────────────────────────────────────────────────────────

export const rewardListQuery = listQuerySchema.extend({
  kind: z.nativeEnum(RewardKind).optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  activeOnly: boolQuery(true),
  includeArchived: boolQuery(false),
  /** Only what the calling learner can currently afford. */
  affordableOnly: boolQuery(false),
  withMine: boolQuery(false),
});

export const createRewardSchema = z
  .object({
    key: keySchema,
    name: text(140),
    description: optionalText(500),
    kind: z.nativeEnum(RewardKind),
    pointsCost: z.coerce.number().int().min(0).max(POINTS_MAX).default(0),
    payload: jsonValue.optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(true),
    ageMode: z.nativeEnum(AgeMode).optional(),
    previewMediaId: idSchema.optional(),
  })
  .strict();

export const updateRewardSchema = createRewardSchema
  .omit({ key: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

export const redeemRewardSchema = z
  .object({
    /** Staff may redeem on a learner's behalf; a learner may only redeem for themselves. */
    studentId: idSchema.optional(),
    equip: z.boolean().default(false),
  })
  .strict();

export const grantRewardSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
    reason: text(400),
    /** A granted reward costs nothing, so recognition never depends on a balance. */
    equip: z.boolean().default(false),
  })
  .strict();

export const equipRewardSchema = z
  .object({ studentId: idSchema.optional(), equip: z.boolean().default(true) })
  .strict();

export const studentRewardListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  kind: z.nativeEnum(RewardKind).optional(),
  equippedOnly: boolQuery(false),
});

export const summaryQuery = z.object({ studentId: idSchema.optional() }).strict();

// ── Inferred types ──────────────────────────────────────────────────────────

export type LedgerListQuery = z.infer<typeof ledgerListQuery>;
export type BalanceQuery = z.infer<typeof balanceQuery>;
export type AwardPointsInput = z.infer<typeof awardPointsSchema>;
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;
export type ReversePointsInput = z.infer<typeof reversePointsSchema>;
export type BadgeCriteria = z.infer<typeof badgeCriteriaSchema>;
export type BadgeListQuery = z.infer<typeof badgeListQuery>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type AwardBadgeInput = z.infer<typeof awardBadgeSchema>;
export type RevokeBadgeInput = z.infer<typeof revokeBadgeSchema>;
export type StudentBadgeListQuery = z.infer<typeof studentBadgeListQuery>;
export type StreakListQuery = z.infer<typeof streakListQuery>;
export type GrantFreezeInput = z.infer<typeof grantFreezeSchema>;
export type RewardListQuery = z.infer<typeof rewardListQuery>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
export type GrantRewardInput = z.infer<typeof grantRewardSchema>;
export type EquipRewardInput = z.infer<typeof equipRewardSchema>;
export type StudentRewardListQuery = z.infer<typeof studentRewardListQuery>;
export type SummaryQuery = z.infer<typeof summaryQuery>;
