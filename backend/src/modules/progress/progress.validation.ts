// ─────────────────────────────────────────────────────────────────────────────
// Progress, mastery and teacher-note validation
// Blueprint 12 keeps two questions apart: "did the learner do it?" (progress) and
// "can the learner do it?" (mastery). The query schemas below never let a caller
// blur the two — each list endpoint answers exactly one of them.
//
// Blueprint 04 adds the third kind of record: a teacher's own judgment, and the
// notes that surround it. Notes carry a visibility and a sensitivity, and both are
// enumerated here so an unlabelled note cannot be written.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DifficultyBand,
  EvidenceConfidence,
  MasteryLevel,
  NoteKind,
  NoteSensitivity,
  NoteVisibility,
  PathItemStatus,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  dateQuery,
  idSchema,
  optionalDate,
  optionalText,
  percentSchema,
  text,
} from '../../core/http/validate';

// ── Progress records ────────────────────────────────────────────────────────

export const progressListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  lessonId: idSchema.optional(),
  activityId: idSchema.optional(),
  status: z.nativeEnum(PathItemStatus).optional(),
  /** Only rows touched on or after this moment — the "this week" view. */
  since: optionalDate,
  until: optionalDate,
  completedOnly: boolQuery(false),
});

/**
 * A single learner's engagement rollup. `groupBy` decides what the buckets are;
 * the default answers "how is this learner doing across the subject?".
 */
export const progressSummaryQuery = z.object({
  studentId: idSchema.optional(),
  subjectId: idSchema.optional(),
  since: optionalDate,
  until: optionalDate,
  groupBy: z.enum(['TOPIC', 'LESSON', 'DAY']).default('TOPIC'),
});

/** Class-wide engagement for a teacher's overview screen. */
export const classProgressQuery = z.object({
  subjectId: idSchema.optional(),
  since: optionalDate,
  until: optionalDate,
});

// ── Mastery ─────────────────────────────────────────────────────────────────

export const masteryListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  level: z.nativeEnum(MasteryLevel).optional(),
  band: z.nativeEnum(DifficultyBand).optional(),
  confidence: z.nativeEnum(EvidenceConfidence).optional(),
  /** Only teacher-set rows, or only system-inferred rows. */
  teacherOverride: z.coerce.boolean().optional(),
  /** Blueprint 03: mastery decays. These are the rows asking to be re-checked. */
  dueForReview: boolQuery(false),
  objectiveLevel: boolQuery(false),
});

/**
 * Blueprint 04: "A teacher judgment outranks system inference." An override needs a
 * reason, because the next teacher to read the record has to know why the system's
 * measure was set aside.
 */
export const masteryOverrideSchema = z.object({
  level: z.nativeEnum(MasteryLevel),
  band: z.nativeEnum(DifficultyBand).optional(),
  scorePercent: percentSchema.optional(),
  note: text(600, 4),
  /** Clearing an override hands the row back to the inference engine. */
  clearOverride: z.boolean().default(false),
});

/** Creating or moving a mastery row for a target that has no evidence yet. */
export const masteryTargetSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema,
  topicId: idSchema.optional(),
  objectiveId: idSchema.optional(),
});

// ── Teacher judgments ───────────────────────────────────────────────────────

export const teacherAssessmentListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  teacherId: idSchema.optional(),
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  level: z.nativeEnum(MasteryLevel).optional(),
  since: optionalDate,
});

export const createTeacherAssessmentSchema = z.object({
  studentId: idSchema,
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  level: z.nativeEnum(MasteryLevel),
  band: z.nativeEnum(DifficultyBand).optional(),
  comment: optionalText(4000),
  /**
   * Whether this judgment should move the learner's mastery record. A teacher may
   * want to log an impression without changing the learner's position yet.
   */
  countsAsEvidence: z.boolean().default(true),
  assessedAt: optionalDate,
});

export const updateTeacherAssessmentSchema = z.object({
  level: z.nativeEnum(MasteryLevel).optional(),
  band: z.nativeEnum(DifficultyBand).optional(),
  comment: optionalText(4000),
  countsAsEvidence: z.boolean().optional(),
});

// ── Teacher notes ───────────────────────────────────────────────────────────

export const noteListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  authorId: idSchema.optional(),
  kind: z.nativeEnum(NoteKind).optional(),
  visibility: z.nativeEnum(NoteVisibility).optional(),
  sensitivity: z.nativeEnum(NoteSensitivity).optional(),
  /** Notes with follow-up still outstanding — a teacher's own to-do list. */
  followUpDue: boolQuery(false),
  escalatedOnly: boolQuery(false),
  includeWithdrawn: boolQuery(false),
  since: optionalDate,
});

export const createNoteSchema = z.object({
  studentId: idSchema,
  kind: z.nativeEnum(NoteKind).default(NoteKind.OBSERVATION),
  visibility: z.nativeEnum(NoteVisibility).default(NoteVisibility.PRIVATE_TEACHER),
  sensitivity: z.nativeEnum(NoteSensitivity).default(NoteSensitivity.ROUTINE),
  title: optionalText(200),
  body: text(8000, 2),
  followUpDueAt: optionalDate,
});

export const updateNoteSchema = z.object({
  kind: z.nativeEnum(NoteKind).optional(),
  visibility: z.nativeEnum(NoteVisibility).optional(),
  sensitivity: z.nativeEnum(NoteSensitivity).optional(),
  title: optionalText(200),
  body: text(8000, 2).optional(),
  followUpDueAt: optionalDate,
  /** Marking the follow-up done, without editing the note's substance. */
  followUpDone: z.boolean().optional(),
});

/** Blueprint 04: notes are withdrawn with a reason, never deleted. */
export const withdrawNoteSchema = z.object({ reason: text(400, 4) });

/**
 * Blueprint 04: "Safeguarding notes are escalated rather than shared." Escalation
 * names the person taking it on, so responsibility is never left implicit.
 */
export const escalateNoteSchema = z.object({
  escalatedToId: idSchema,
  note: optionalText(600),
});

export const activityFeedQuery = z.object({
  studentId: idSchema.optional(),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export const dateRangeQuery = z.object({ from: dateQuery, to: dateQuery });

export type ProgressListQuery = z.infer<typeof progressListQuery>;
export type ProgressSummaryQuery = z.infer<typeof progressSummaryQuery>;
export type ClassProgressQuery = z.infer<typeof classProgressQuery>;
export type MasteryListQuery = z.infer<typeof masteryListQuery>;
export type MasteryOverrideInput = z.infer<typeof masteryOverrideSchema>;
export type TeacherAssessmentListQuery = z.infer<typeof teacherAssessmentListQuery>;
export type CreateTeacherAssessmentInput = z.infer<typeof createTeacherAssessmentSchema>;
export type NoteListQuery = z.infer<typeof noteListQuery>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type EscalateNoteInput = z.infer<typeof escalateNoteSchema>;
export type ActivityFeedQuery = z.infer<typeof activityFeedQuery>;
