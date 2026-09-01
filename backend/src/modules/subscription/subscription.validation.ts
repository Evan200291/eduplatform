// ─────────────────────────────────────────────────────────────────────────────
// Subscription and entitlement request schemas (blueprint 09 / 06)
// Two rules shape this file. Money is always integer minor units, because a
// float price on a per-student contract eventually bills someone a penny wrong.
// And an entitlement row must name exactly one target for its scope type — a
// CLASS-scoped row with no classId would silently apply to nobody, which is the
// worst outcome for a switch an administrator believes they just set.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import {
  BillingInterval,
  EntitlementScopeType,
  RoleKey,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { listQuerySchema, paginationSchema } from '../../core/http/pagination';
import { idSchema, jsonValue, optionalDate, optionalText, text } from '../../core/http/validate';

// ── Primitives ──────────────────────────────────────────────────────────────

/** Integer minor units: 1250 is £12.50. Capped well above any school contract. */
const minorAmount = z.coerce.number().int().min(0).max(100_000_000);

const seatCount = z.coerce.number().int().min(0).max(200_000);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code such as GBP.');

// ── Subscriptions ───────────────────────────────────────────────────────────

export const subscriptionListQuery = listQuerySchema.extend({
  plan: z.nativeEnum(SubscriptionPlan).optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  organizationId: idSchema.optional(),
  schoolId: idSchema.optional(),
  /** Contracts ending inside N days. The renewal conversation starts here. */
  expiringWithinDays: z.coerce.number().int().min(1).max(400).optional(),
});

const subscriptionTerms = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  interval: z.nativeEnum(BillingInterval).optional(),
  licensedStudentSeats: seatCount.optional(),
  licensedTeacherSeats: seatCount.optional(),
  pricePerStudentMinor: minorAmount.nullable().optional(),
  pricePerTeacherMinor: minorAmount.nullable().optional(),
  currency: currencyCode.optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  renewsAt: z.coerce.date().nullable().optional(),
  autoRenew: z.boolean().optional(),
  purchaseOrderRef: optionalText(80),
  invoiceEmail: z.string().trim().toLowerCase().email().max(190).optional(),
  notes: optionalText(2000),
});

/** Dates must describe a real term, whichever direction the caller sends them. */
function checkTerm(
  value: { startsAt?: Date | null; endsAt?: Date | null; trialEndsAt?: Date | null },
  ctx: z.RefinementCtx,
): void {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'The contract must end after it starts.',
    });
  }
  if (value.startsAt && value.trialEndsAt && value.trialEndsAt < value.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['trialEndsAt'],
      message: 'A trial cannot end before the contract starts.',
    });
  }
}

export const createSubscriptionSchema = subscriptionTerms
  .extend({
    /** Enterprise agreements sit on the organization; single schools on the school. */
    organizationId: idSchema.optional(),
    schoolId: idSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.organizationId && !value.schoolId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schoolId'],
        message: 'Attach the subscription to a school or to an organization.',
      });
    }
    checkTerm(value, ctx);
  });

export const updateSubscriptionSchema = subscriptionTerms
  .partial()
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Send at least one field to change.' });
    }
    checkTerm(value, ctx);
  });

export const cancelSubscriptionSchema = z
  .object({
    /** Blueprint 09 records the reason for every commercial outcome. */
    reason: text(300, 3),
    /** Omitted means "at the end of the current term". */
    effectiveAt: optionalDate,
    /** Ends access now rather than at the term end. Rarely correct mid-year. */
    immediate: z.boolean().optional(),
  })
  .strict();

export const renewSubscriptionSchema = z
  .object({
    plan: z.nativeEnum(SubscriptionPlan).optional(),
    interval: z.nativeEnum(BillingInterval).optional(),
    endsAt: z.coerce.date(),
    renewsAt: z.coerce.date().nullable().optional(),
    licensedStudentSeats: seatCount.optional(),
    licensedTeacherSeats: seatCount.optional(),
    pricePerStudentMinor: minorAmount.nullable().optional(),
    pricePerTeacherMinor: minorAmount.nullable().optional(),
    changeSummary: optionalText(500),
  })
  .strict();

// ── Entitlements ────────────────────────────────────────────────────────────

/** Which id a scope type needs. PLATFORM needs none; PLAN names a plan. */
const SCOPE_TARGET: Record<EntitlementScopeType, string | null> = {
  [EntitlementScopeType.PLATFORM]: null,
  [EntitlementScopeType.PLAN]: 'plan',
  [EntitlementScopeType.ORGANIZATION]: 'organizationId',
  [EntitlementScopeType.SCHOOL]: 'schoolId',
  [EntitlementScopeType.ROLE]: 'roleKey',
  [EntitlementScopeType.GRADE]: 'gradeId',
  [EntitlementScopeType.CLASS]: 'classId',
  [EntitlementScopeType.SUBJECT]: 'subjectId',
  [EntitlementScopeType.USER_GROUP]: 'userGroupId',
};

export const setEntitlementSchema = z
  .object({
    featureKey: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[a-z][A-Za-z0-9.]*$/, 'A feature key looks like gamification.leaderboard.'),
    scopeType: z.nativeEnum(EntitlementScopeType),
    enabled: z.boolean(),
    value: jsonValue.optional(),
    plan: z.nativeEnum(SubscriptionPlan).optional(),
    organizationId: idSchema.optional(),
    schoolId: idSchema.optional(),
    subscriptionId: idSchema.optional(),
    roleKey: z.nativeEnum(RoleKey).optional(),
    gradeId: idSchema.optional(),
    classId: idSchema.optional(),
    subjectId: idSchema.optional(),
    userGroupId: idSchema.optional(),
    precedence: z.coerce.number().int().min(0).max(1000).optional(),
    /** Blueprint 06: every visibility decision is auditable and reasoned. */
    reason: optionalText(300),
    isSafetyRule: z.boolean().optional(),
    effectiveFrom: z.coerce.date().nullable().optional(),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const required = SCOPE_TARGET[value.scopeType];
    if (required && !(value as Record<string, unknown>)[required]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [required],
        message: `A ${value.scopeType} entitlement must name its ${required}.`,
      });
    }
    if (value.effectiveFrom && value.effectiveTo && value.effectiveTo <= value.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveTo'],
        message: 'The window must end after it begins.',
      });
    }
  });

export const entitlementListQuery = paginationSchema.extend({
  featureKey: z.string().trim().max(120).optional(),
  scopeType: z.nativeEnum(EntitlementScopeType).optional(),
  includeInherited: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .default(true),
});

/**
 * "Explain" answers the question an administrator actually has: not "is there a
 * row?" but "what will this user see, and which rule decided it?".
 */
export const explainFeaturesSchema = z
  .object({
    featureKeys: z.array(z.string().trim().min(3).max(120)).min(1).max(60).optional(),
    roleKey: z.nativeEnum(RoleKey).optional(),
    gradeId: idSchema.optional(),
    classId: idSchema.optional(),
    subjectId: idSchema.optional(),
    userGroupIds: z.array(idSchema).max(20).optional(),
  })
  .strict();

export const featureCatalogueQuery = z.object({
  category: z
    .enum([
      'learning',
      'assessment',
      'gamification',
      'communication',
      'reporting',
      'administration',
      'safety',
      'commercial',
    ])
    .optional(),
  configurableOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .default(false),
});
