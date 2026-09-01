// ─────────────────────────────────────────────────────────────────────────────
// Assessment request schemas
// Blueprint 03: screening "assesses across controlled difficulty bands" and ends
// in a placement rather than a grade. Blueprint 12: raw evidence and inferred
// mastery are separate records.
//
// Two rules are enforced here rather than left to prose:
//  - A learner's answer arrives in one explicitly-typed envelope per question
//    type, so the marker never has to guess what `response` contains.
//  - A teacher override must carry a note. Blueprint 04 requires the override
//    trail to say *why*, so the schema refuses a silent change.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AssessmentKind,
  AttemptStatus,
  ContentStatus,
  DifficultyBand,
  EvidenceConfidence,
  EvidenceSource,
  MasteryLevel,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  keySchema,
  optionalDate,
  optionalText,
  percentSchema,
  text,
} from '../../core/http/validate';
import { contentStatusSchema } from '../curriculum/curriculum.validation';

/** The lifecycle vocabulary is shared with curriculum — declared once, reused. */
export { contentStatusSchema };

const LONG_TEXT = 12_000;
const sortOrderField = z.coerce.number().int().min(0).max(9999).default(0);

// ── Assessment definitions ──────────────────────────────────────────────────

export const assessmentListQuery = listQuerySchema.extend({
  subjectId: idSchema.optional(),
  topicId: idSchema.optional(),
  kind: z.nativeEnum(AssessmentKind).optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  includeArchived: boolQuery(false),
});

export const createAssessmentSchema = z.object({
  subjectId: idSchema,
  /** Null for a cross-topic screening assessment. */
  topicId: idSchema.optional(),
  kind: z.nativeEnum(AssessmentKind),
  title: text(200, 2),
  key: keySchema.optional(),
  description: optionalText(LONG_TEXT),
  /** Number of items to present. Omitted means "all items". */
  itemTarget: z.coerce.number().int().min(1).max(200).optional(),
  timeLimitMinutes: z.coerce.number().int().min(1).max(600).optional(),
  /** Blueprint 03: screening steps up and down through difficulty bands. */
  adaptiveEnabled: z.boolean().default(true),
  startingBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  passThreshold: percentSchema.default(70),
  maxAttempts: z.coerce.number().int().min(1).max(100).optional(),
  cooldownDays: z.coerce.number().int().min(0).max(365).optional(),
  /** Whether a result may raise a learning-path recommendation for the teacher. */
  driveRecommendations: z.boolean().default(true),
  /** Omitted means "use the school's `defaultShuffleItems` setting" (true if unset). */
  shuffleItems: z.boolean().optional(),
  /**
   * Blueprint 03: immediate feedback teaches, but it also lets a learner infer the
   * key on a screening run, so it is off unless the author turns it on.
   */
  showFeedbackImmediately: z.boolean().default(false),
});

export const updateAssessmentSchema = createAssessmentSchema
  .omit({ subjectId: true, kind: true })
  .partial()
  .extend({
    topicId: idSchema.nullable().optional(),
    itemTarget: z.coerce.number().int().min(1).max(200).nullable().optional(),
    timeLimitMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
    maxAttempts: z.coerce.number().int().min(1).max(100).nullable().optional(),
    cooldownDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  });

// ── Items ───────────────────────────────────────────────────────────────────

const assessmentItemInput = z.object({
  activityId: idSchema,
  sortOrder: sortOrderField,
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  /** Relative weight in the raw score. */
  weight: z.coerce.number().int().min(1).max(1000).default(100),
  /** Marks an entry point for the adaptive walk through the bands. */
  isAdaptiveEntry: z.boolean().default(false),
});

export const addAssessmentItemSchema = assessmentItemInput;

export const updateAssessmentItemSchema = assessmentItemInput.omit({ activityId: true }).partial();

/** Replaces the whole item list in one request, which is how the authoring UI saves. */
export const setAssessmentItemsSchema = z.object({
  items: z.array(assessmentItemInput).max(200),
});

export const itemParams = z.object({ id: idSchema, itemId: idSchema });

export const publishAssessmentSchema = z.object({
  /** Recorded on the audit entry so a publication can be explained later. */
  reason: optionalText(400),
});

// ── Attempts ────────────────────────────────────────────────────────────────

export const startAttemptSchema = z.object({
  /**
   * Staff starting an attempt on a learner's behalf (a supervised screening).
   * Omitted means "the signed-in student", which is the normal case.
   */
  studentId: idSchema.optional(),
  /** Practice attempts do not affect placement or mastery. */
  isPractice: z.boolean().default(false),
  deviceInfo: optionalText(300),
});

export const attemptListQuery = listQuerySchema.extend({
  assessmentId: idSchema.optional(),
  studentId: idSchema.optional(),
  status: z.nativeEnum(AttemptStatus).optional(),
  kind: z.nativeEnum(AssessmentKind).optional(),
  includePractice: boolQuery(true),
  completedFrom: optionalDate,
  completedTo: optionalDate,
});

/**
 * One envelope per question type. The marker requires the field matching the
 * stored question type, so a MULTIPLE_CHOICE answer cannot be submitted as a
 * number and quietly marked wrong.
 */
export const responsePayloadSchema = z.object({
  /** MULTIPLE_CHOICE — the option ids the learner selected. */
  optionIds: z.array(idSchema).max(24).optional(),
  /** TRUE_FALSE. */
  booleanValue: z.boolean().optional(),
  /** NUMERIC. */
  numericValue: z.coerce.number().min(-1e12).max(1e12).optional(),
  /** SHORT_TEXT. Compared case-insensitively against the accepted answers. */
  textValue: z.string().trim().max(400).optional(),
  /** MATCHING — one entry per pair the learner joined. */
  pairs: z
    .array(z.object({ optionId: idSchema, matchKey: text(120, 1) }))
    .max(24)
    .optional(),
  /** SORTING — the learner's ordering of the items. */
  orderedOptionIds: z.array(idSchema).max(24).optional(),
  /** Blueprint 03: skipping is a legitimate action, recorded rather than punished. */
  skipped: z.boolean().default(false),
});

export const submitResponseSchema = z.object({
  questionId: idSchema,
  response: responsePayloadSchema,
  /** Recorded, never penalised, unless the hint itself declares a points cost. */
  hintsUsed: z.coerce.number().int().min(0).max(20).default(0),
  attemptsUsed: z.coerce.number().int().min(1).max(20).default(1),
  timeSpentSeconds: z.coerce.number().int().min(0).max(86_400).default(0),
});

/**
 * Finalises the attempt. Responses may be sent one at a time during the run and
 * omitted here, or batched in this request for an offline-tolerant client.
 */
export const submitAttemptSchema = z.object({
  responses: z.array(submitResponseSchema).max(200).optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
});

export const abandonAttemptSchema = z.object({ reason: optionalText(400) });

/**
 * Blueprint 04 override trail: who changed the mark, to what, and why. The note
 * is required because an unexplained override cannot be reviewed later.
 */
export const overrideResponseSchema = z.object({
  isCorrect: z.boolean(),
  /** Omitted awards full marks on a correct override and none on an incorrect one. */
  pointsAwarded: z.coerce.number().min(0).max(10_000).optional(),
  note: text(500, 4),
});

// ── Evidence and evaluations ────────────────────────────────────────────────

export const evaluationListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  topicId: idSchema.optional(),
  subjectId: idSchema.optional(),
  attemptId: idSchema.optional(),
  band: z.nativeEnum(DifficultyBand).optional(),
  masteryLevel: z.nativeEnum(MasteryLevel).optional(),
  evidenceSource: z.nativeEnum(EvidenceSource).optional(),
  confidence: z.nativeEnum(EvidenceConfidence).optional(),
  /** Superseded rows are kept for history and hidden unless asked for. */
  includeSuperseded: boolQuery(false),
});

export const responseListQuery = listQuerySchema.extend({
  questionId: idSchema.optional(),
  activityId: idSchema.optional(),
  onlyIncorrect: boolQuery(false),
  onlyOverridden: boolQuery(false),
});

export type AssessmentListQuery = z.infer<typeof assessmentListQuery>;
export type AttemptListQuery = z.infer<typeof attemptListQuery>;
export type EvaluationListQuery = z.infer<typeof evaluationListQuery>;
export type ResponseListQuery = z.infer<typeof responseListQuery>;
export type ResponsePayload = z.infer<typeof responsePayloadSchema>;
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
