// ─────────────────────────────────────────────────────────────────────────────
// Privacy validation
// Blueprint 10 turns data rights into a workflow with an owner and a deadline, so
// the schemas here insist on the things that make a request actionable rather than
// merely recorded: who it is about, what they asked for, and — on completion — what
// was actually done, including anything lawfully retained.
//
// Two rules are enforced in the validator rather than left to the UI:
//   • Rejecting a request requires a reason. A refusal with no reason is not a
//     decision a school could defend to a parent or a regulator.
//   • Completing one requires an outcome note. "Done" is not a record of what was
//     deleted, corrected or held back.
// ─────────────────────────────────────────────────────────────────────────────

import { DataRequestKind, DataRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  optionalDate,
  optionalText,
  text,
} from '../../core/http/validate';

/**
 * The lawful bases a school may rely on. Stored as a string column rather than an
 * enum because the vocabulary is legal, not technical, and adding one should not
 * require a migration.
 */
export const LAWFUL_BASES = [
  'CONSENT',
  'CONTRACT',
  'LEGAL_OBLIGATION',
  'PUBLIC_TASK',
  'LEGITIMATE_INTEREST',
  'VITAL_INTERESTS',
] as const;
export type LawfulBasis = (typeof LAWFUL_BASES)[number];
export const lawfulBasisSchema = z.enum(LAWFUL_BASES);

/** What a retention policy does when the clock runs out. */
export const RETENTION_ACTIONS = ['DELETE', 'ANONYMIZE', 'ARCHIVE'] as const;
export type RetentionAction = (typeof RETENTION_ACTIONS)[number];
export const retentionActionSchema = z.enum(RETENTION_ACTIONS);

// ── Data requests ───────────────────────────────────────────────────────────

export const createDataRequestSchema = z
  .object({
    subjectUserId: idSchema,
    kind: z.nativeEnum(DataRequestKind),
    /** What was asked for, in the requester's words where possible. */
    details: optionalText(4_000),
    /** The statutory clock. Left open where the school has not set one yet. */
    dueAt: optionalDate,
    ownerUserId: idSchema.optional(),
  })
  .strict();

export const updateDataRequestSchema = z
  .object({
    details: optionalText(4_000),
    dueAt: optionalDate,
    ownerUserId: idSchema.optional(),
  })
  .strict();

/**
 * A status change is its own request, because each one has different evidence
 * requirements. The service refuses transitions that skip review.
 */
export const transitionDataRequestSchema = z
  .object({
    status: z.nativeEnum(DataRequestStatus),
    /** Required for REJECTED. */
    rejectionReason: optionalText(600),
    /** Required for COMPLETED: what was done, and what was lawfully retained. */
    outcomeNote: optionalText(4_000),
    /** Set where an EXPORT produced a file. */
    exportStorageKey: optionalText(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === DataRequestStatus.REJECTED && !value.rejectionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rejectionReason'],
        message: 'Rejecting a data request requires a reason the school could stand behind.',
      });
    }
    if (value.status === DataRequestStatus.COMPLETED && !value.outcomeNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcomeNote'],
        message:
          'Completing a data request requires an outcome note describing what was done and anything lawfully retained.',
      });
    }
  });

export const dataRequestListQuery = listQuerySchema.extend({
  status: z.nativeEnum(DataRequestStatus).optional(),
  kind: z.nativeEnum(DataRequestKind).optional(),
  subjectUserId: idSchema.optional(),
  /** Requests already past their deadline, which is the queue that matters. */
  overdueOnly: boolQuery(false),
  openOnly: boolQuery(false),
});

// ── Consent and lawful basis ────────────────────────────────────────────────

export const recordConsentSchema = z
  .object({
    /** e.g. `learning_analytics`, `media_publication`. Lower snake case by convention. */
    purpose: text(120, 3),
    lawfulBasis: lawfulBasisSchema,
    granted: z.boolean(),
    /** Null for a school-level basis; set for a per-learner record. */
    userId: idSchema.optional(),
    /** How the school knows: a signed form, a policy acceptance, a meeting note. */
    evidenceNote: optionalText(600),
    policyVersion: optionalText(40),
    effectiveFrom: optionalDate,
  })
  .strict();

export const withdrawConsentSchema = z
  .object({ evidenceNote: optionalText(600) })
  .strict();

export const consentListQuery = listQuerySchema.extend({
  purpose: optionalText(120),
  userId: idSchema.optional(),
  /** School-level rows only, which is what a policy review reads. */
  schoolLevelOnly: boolQuery(false),
  activeOnly: boolQuery(true),
});

// ── Retention ───────────────────────────────────────────────────────────────

export const upsertRetentionPolicySchema = z
  .object({
    dataClass: text(80, 3),
    /** Months, because retention is written in months in every policy document. */
    retainMonths: z.coerce.number().int().min(1).max(600),
    action: retentionActionSchema,
    isActive: z.boolean().optional(),
    notes: optionalText(600),
  })
  .strict();

export const retentionListQuery = listQuerySchema.extend({
  includePlatformDefaults: boolQuery(true),
  activeOnly: boolQuery(false),
});

// ── Audit trail reading ─────────────────────────────────────────────────────

export const auditListQuery = listQuerySchema.extend({
  action: optionalText(120),
  targetType: optionalText(60),
  targetId: optionalText(32),
  actorUserId: idSchema.optional(),
  from: optionalDate,
  to: optionalDate,
  /** Denied and failed attempts only, which is the security review view. */
  problemsOnly: boolQuery(false),
});
