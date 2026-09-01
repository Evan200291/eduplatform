// ─────────────────────────────────────────────────────────────────────────────
// Learning path validation
// Blueprint 03 defines four path modes and blueprint 04 defines the decision set a
// teacher may take on a proposal. Both are enumerated here so an invalid mode or an
// unnamed decision never reaches the service.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EvidenceConfidence,
  EvidenceSource,
  PathItemStatus,
  PathMode,
  RecommendationOrigin,
  RecommendationStatus,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, optionalDate, optionalText, text } from '../../core/http/validate';

// ── Paths ───────────────────────────────────────────────────────────────────

export const pathListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  subjectId: idSchema.optional(),
  mode: z.nativeEnum(PathMode).optional(),
  onlyActive: boolQuery(true),
  includeArchived: boolQuery(false),
  awaitingApproval: boolQuery(false),
});

export const createPathSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema,
  mode: z.nativeEnum(PathMode).default(PathMode.HYBRID),
  name: text(180, 2).optional(),
  notes: optionalText(2000),
  /**
   * Blueprint 04: a path is inert until approved. A school may build one already
   * approved, but that has to be asked for explicitly.
   */
  requiresApproval: z.boolean().default(true),
});

export const updatePathSchema = z.object({
  mode: z.nativeEnum(PathMode).optional(),
  name: text(180, 2).optional(),
  notes: optionalText(2000),
  isActive: z.boolean().optional(),
  generatorNote: optionalText(600),
});

export const approvePathSchema = z.object({ note: optionalText(600) });

/**
 * Generates a path from the learner's current mastery picture. Blueprint 03: the
 * path follows the evidence, so the only inputs are which subject and how far
 * ahead to plan.
 */
export const generatePathSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema,
  mode: z.nativeEnum(PathMode).default(PathMode.HYBRID),
  /** How many topics to lay out. A path longer than a term is not a plan. */
  topicLimit: z.coerce.number().int().min(1).max(40).default(12),
  /** Include topics already mastered, locked, so the learner can see the whole map. */
  includeMastered: z.boolean().default(false),
  replaceExisting: z.boolean().default(true),
});

/**
 * The learner's own question — "what am I working on in this subject?" A member of
 * staff may ask it on a named learner's behalf; a learner may only ask it of
 * themselves, which the service enforces from their grants rather than from here.
 */
export const activePathQuery = z.object({
  subjectId: idSchema,
  studentId: idSchema.optional(),
});

// ── Path items ──────────────────────────────────────────────────────────────

/** Exactly one target per step; the service rejects zero or more than one. */
export const pathItemTargetSchema = z.object({
  topicId: idSchema.optional(),
  lessonId: idSchema.optional(),
  activityId: idSchema.optional(),
  assessmentId: idSchema.optional(),
});

export const addPathItemSchema = pathItemTargetSchema.extend({
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  status: z.nativeEnum(PathItemStatus).default(PathItemStatus.LOCKED),
  isRequired: z.boolean().default(true),
  dueAt: optionalDate,
  reason: optionalText(400),
});

export const updatePathItemSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  status: z.nativeEnum(PathItemStatus).optional(),
  isRequired: z.boolean().optional(),
  dueAt: optionalDate,
  reason: optionalText(400),
});

export const removePathItemSchema = z.object({ reason: text(400, 4) });

export const reorderPathItemsSchema = z.object({
  items: z
    .array(z.object({ id: idSchema, sortOrder: z.coerce.number().int().min(0).max(10_000) }))
    .min(1)
    .max(200),
});

export const pathItemParams = z.object({ id: idSchema, itemId: idSchema });

export const pathItemListQuery = listQuerySchema.extend({
  status: z.nativeEnum(PathItemStatus).optional(),
  includeRemoved: boolQuery(false),
});

// ── Recommendations ─────────────────────────────────────────────────────────

export const recommendationListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  status: z.nativeEnum(RecommendationStatus).optional(),
  origin: z.nativeEnum(RecommendationOrigin).optional(),
  evidenceSource: z.nativeEnum(EvidenceSource).optional(),
  confidence: z.nativeEnum(EvidenceConfidence).optional(),
  /** The teacher's queue: everything still waiting on a decision. */
  pendingOnly: boolQuery(false),
  minPriority: z.coerce.number().int().min(0).max(100).optional(),
});

/**
 * Blueprint 04: the decision set is approve, modify, reject or defer, and each one
 * is recorded with the teacher who made it. A rejection needs a reason — that is
 * the feedback the inference engine would otherwise never receive.
 */
export const decideRecommendationSchema = z
  .object({
    decision: z.enum(['APPROVE', 'MODIFY', 'REJECT', 'DEFER']),
    note: optionalText(600),
    /** MODIFY only: the change the teacher actually wants applied. */
    appliedChange: z.record(z.unknown()).optional(),
    /** DEFER only: when to raise it again. */
    deferUntil: optionalDate,
    /** Whether approving should also write the steps into the learner's path. */
    applyToPath: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'REJECT' && (!value.note || value.note.trim().length < 4)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A rejection needs a short reason.',
      });
    }
    if (value.decision === 'MODIFY' && !value.appliedChange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appliedChange'],
        message: 'Describe the change you want applied instead.',
      });
    }
  });

export const createRecommendationSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  rationale: text(2000, 8),
  proposal: z.record(z.unknown()),
  priority: z.coerce.number().int().min(0).max(100).default(50),
});

export type PathListQuery = z.infer<typeof pathListQuery>;
export type PathItemListQuery = z.infer<typeof pathItemListQuery>;
export type RecommendationListQuery = z.infer<typeof recommendationListQuery>;
export type CreatePathInput = z.infer<typeof createPathSchema>;
export type GeneratePathInput = z.infer<typeof generatePathSchema>;
export type AddPathItemInput = z.infer<typeof addPathItemSchema>;
export type DecideRecommendationInput = z.infer<typeof decideRecommendationSchema>;
