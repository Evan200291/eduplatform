// ─────────────────────────────────────────────────────────────────────────────
// Curriculum request schemas
// Blueprint 02 "Curriculum engine": Program → Unit → Topic → Objective. The
// hierarchy is explicit so mastery can be attributed to an objective and the
// path engine can respect prerequisites.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentOwnership, ContentStatus, DifficultyBand } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, keySchema, optionalText, text } from '../../core/http/validate';

// ── Programs ────────────────────────────────────────────────────────────────

export const programListQuery = listQuerySchema.extend({
  subjectId: idSchema.optional(),
  gradeId: idSchema.optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  includeArchived: boolQuery(false),
});

export const createProgramSchema = z.object({
  subjectId: idSchema,
  gradeId: idSchema.optional(),
  name: text(180, 2),
  key: keySchema.optional(),
  description: optionalText(4000),
  framework: optionalText(180),
  ownership: z.nativeEnum(ContentOwnership).default(ContentOwnership.SCHOOL_OWNED),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateProgramSchema = createProgramSchema.omit({ subjectId: true }).partial().extend({
  gradeId: idSchema.nullable().optional(),
});

// ── Units ───────────────────────────────────────────────────────────────────

export const unitListQuery = listQuerySchema.extend({
  programId: idSchema.optional(),
  subjectId: idSchema.optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  includeArchived: boolQuery(false),
});

export const createUnitSchema = z.object({
  programId: idSchema,
  name: text(180, 2),
  key: keySchema.optional(),
  description: optionalText(4000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateUnitSchema = createUnitSchema.omit({ programId: true }).partial();

// ── Topics ──────────────────────────────────────────────────────────────────

export const topicListQuery = listQuerySchema.extend({
  unitId: idSchema.optional(),
  subjectId: idSchema.optional(),
  gradeId: idSchema.optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  difficultyBand: z.nativeEnum(DifficultyBand).optional(),
  includeArchived: boolQuery(false),
});

export const createTopicSchema = z.object({
  unitId: idSchema,
  gradeId: idSchema.optional(),
  name: text(180, 2),
  key: keySchema.optional(),
  description: optionalText(4000),
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).default(20),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  /** Blueprint 12: the evidence bar before MASTERED is claimed. */
  masteryThreshold: z.coerce.number().int().min(50).max(100).default(80),
});

export const updateTopicSchema = createTopicSchema.omit({ unitId: true }).partial().extend({
  gradeId: idSchema.nullable().optional(),
});

/** Blueprint 05 content lifecycle: draft → review → approved → published. */
export const contentStatusSchema = z.object({
  status: z.nativeEnum(ContentStatus),
  reason: optionalText(400),
});

// ── Prerequisites ───────────────────────────────────────────────────────────

export const setPrerequisitesSchema = z.object({
  prerequisites: z
    .array(z.object({ requiredTopicId: idSchema, isHard: z.boolean().default(true) }))
    .max(20),
});

// ── Objectives ──────────────────────────────────────────────────────────────

export const objectiveListQuery = listQuerySchema.extend({
  topicId: idSchema.optional(),
});

export const createObjectiveSchema = z.object({
  topicId: idSchema,
  code: text(40, 1),
  statement: text(600, 3),
  notes: optionalText(4000),
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateObjectiveSchema = createObjectiveSchema.omit({ topicId: true }).partial();

/** Reorders siblings in one call so drag-and-drop is a single request. */
export const reorderSchema = z.object({
  items: z.array(z.object({ id: idSchema, sortOrder: z.coerce.number().int().min(0).max(9999) })).min(1).max(500),
});

export type ProgramListQuery = z.infer<typeof programListQuery>;
export type UnitListQuery = z.infer<typeof unitListQuery>;
export type TopicListQuery = z.infer<typeof topicListQuery>;
export type ObjectiveListQuery = z.infer<typeof objectiveListQuery>;
