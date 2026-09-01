// ─────────────────────────────────────────────────────────────────────────────
// Content request schemas
// Blueprint 03 "Lessons and activities — supported initial forms" and blueprint
// 05 content lifecycle. Two rules are enforced here rather than left to prose:
//  - An answer key is validated against the question type, so a MULTIPLE_CHOICE
//    question cannot be stored with a numeric key and no correct option.
//  - Text columns are `@db.Text` (65,535 *bytes* in MySQL). Caps below are in
//    characters and stay inside that budget even at 4 bytes per character.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ActivityType,
  AgeMode,
  ContentOwnership,
  ContentReportReason,
  ContentStatus,
  DifficultyBand,
  ModerationDecision,
  QuestionType,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  jsonValue,
  keySchema,
  optionalText,
  text,
} from '../../core/http/validate';
import { contentStatusSchema, reorderSchema } from '../curriculum/curriculum.validation';

/** The lifecycle vocabulary is shared with curriculum — declared once, reused. */
export { contentStatusSchema, reorderSchema };

/** Longest safe length for a `@db.Text` column under utf8mb4. */
const LONG_TEXT = 12_000;

const sortOrderField = z.coerce.number().int().min(0).max(9999).default(0);

// ── Lessons ─────────────────────────────────────────────────────────────────

export const lessonListQuery = listQuerySchema.extend({
  topicId: idSchema.optional(),
  unitId: idSchema.optional(),
  subjectId: idSchema.optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  difficultyBand: z.nativeEnum(DifficultyBand).optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  includeArchived: boolQuery(false),
});

const lessonSectionInput = z.object({
  heading: text(200, 2),
  body: text(LONG_TEXT, 1),
  /** EXPLANATION or WORKED_EXAMPLE in practice; any type is accepted. */
  kind: z.nativeEnum(ActivityType).default(ActivityType.EXPLANATION),
  sortOrder: sortOrderField,
  mediaId: idSchema.optional(),
});

export const createLessonSchema = z.object({
  topicId: idSchema,
  title: text(200, 2),
  key: keySchema.optional(),
  summary: optionalText(600),
  /** Teaching content as Markdown; rendered client-side with a safe renderer. */
  body: optionalText(LONG_TEXT),
  ownership: z.nativeEnum(ContentOwnership).default(ContentOwnership.SCHOOL_OWNED),
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).default(15),
  ageMode: z.nativeEnum(AgeMode).optional(),
  sortOrder: sortOrderField,
  /** Blueprint 07: content may declare that it needs audio support to be usable. */
  requiresAudio: z.boolean().default(false),
  heroMediaId: idSchema.optional(),
  /** Authoring convenience: seed the first sections in the same request. */
  sections: z.array(lessonSectionInput).max(50).optional(),
});

export const updateLessonSchema = createLessonSchema
  .omit({ topicId: true, sections: true })
  .partial()
  .extend({
    heroMediaId: idSchema.nullable().optional(),
    ageMode: z.nativeEnum(AgeMode).nullable().optional(),
  });

export const createLessonSectionSchema = lessonSectionInput;

export const updateLessonSectionSchema = lessonSectionInput
  .partial()
  .extend({ mediaId: idSchema.nullable().optional() });

export const sectionParams = z.object({ id: idSchema, sectionId: idSchema });

// ── Activities ──────────────────────────────────────────────────────────────

export const activityListQuery = listQuerySchema.extend({
  topicId: idSchema.optional(),
  lessonId: idSchema.optional(),
  subjectId: idSchema.optional(),
  type: z.nativeEnum(ActivityType).optional(),
  status: z.nativeEnum(ContentStatus).optional(),
  difficultyBand: z.nativeEnum(DifficultyBand).optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  screeningEligible: boolQuery(false).optional(),
  includeArchived: boolQuery(false),
});

export const createActivitySchema = z.object({
  topicId: idSchema,
  lessonId: idSchema.optional(),
  title: text(200, 2),
  key: keySchema.optional(),
  type: z.nativeEnum(ActivityType),
  instructions: optionalText(LONG_TEXT),
  /** Type-specific settings: mini-game rules, sorting buckets, matching pairs. */
  config: jsonValue.optional(),
  ownership: z.nativeEnum(ContentOwnership).default(ContentOwnership.SCHOOL_OWNED),
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).default(10),
  pointsValue: z.coerce.number().int().min(0).max(10_000).default(10),
  maxAttempts: z.coerce.number().int().min(1).max(100).optional(),
  passThreshold: z.coerce.number().int().min(0).max(100).default(70),
  ageMode: z.nativeEnum(AgeMode).optional(),
  sortOrder: sortOrderField,
  /** Blueprint 03: only vetted items may appear in the screening assessment. */
  screeningEligible: z.boolean().default(false),
  thumbnailMediaId: idSchema.optional(),
  /** Objectives this activity provides evidence for, with relative weights. */
  objectives: z
    .array(z.object({ objectiveId: idSchema, weight: z.coerce.number().int().min(1).max(1000).default(100) }))
    .max(20)
    .optional(),
});

export const updateActivitySchema = createActivitySchema
  .omit({ topicId: true, objectives: true })
  .partial()
  .extend({
    lessonId: idSchema.nullable().optional(),
    thumbnailMediaId: idSchema.nullable().optional(),
    ageMode: z.nativeEnum(AgeMode).nullable().optional(),
    maxAttempts: z.coerce.number().int().min(1).max(100).nullable().optional(),
  });

export const setActivityObjectivesSchema = z.object({
  objectives: z
    .array(z.object({ objectiveId: idSchema, weight: z.coerce.number().int().min(1).max(1000).default(100) }))
    .max(20),
});

/**
 * Blueprint 05: "a revision must say whether it invalidates prior evidence."
 * Publishing snapshots the activity into an immutable `ActivityVersion`.
 */
export const publishActivitySchema = z.object({
  changeSummary: optionalText(500),
  invalidatesPriorEvidence: z.boolean().default(false),
  reviewNotes: optionalText(LONG_TEXT),
});

// ── Questions, options and hints ────────────────────────────────────────────

const answerOptionInput = z.object({
  label: text(600, 1),
  isCorrect: z.boolean().default(false),
  sortOrder: sortOrderField,
  /** Blueprint 03: distractor feedback turns a wrong answer into teaching. */
  feedback: optionalText(600),
  /** Grouping key for MATCHING pairs and SORTING buckets. */
  matchKey: optionalText(120),
  mediaId: idSchema.optional(),
});

const hintInput = z.object({
  body: text(2000, 1),
  sortOrder: sortOrderField,
  /** Default 0 — blueprint 03 records hint use rather than punishing it. */
  pointsCost: z.coerce.number().int().min(0).max(100).default(0),
});

const questionShape = {
  type: z.nativeEnum(QuestionType),
  prompt: text(LONG_TEXT, 1),
  explanation: optionalText(LONG_TEXT),
  config: jsonValue.optional(),
  promptMediaId: idSchema.optional(),
  objectiveId: idSchema.optional(),
  difficultyBand: z.nativeEnum(DifficultyBand).default(DifficultyBand.DEVELOPING),
  pointsValue: z.coerce.number().int().min(0).max(1000).default(1),
  sortOrder: sortOrderField,
  timeLimitSeconds: z.coerce.number().int().min(5).max(3600).optional(),
} as const;

const answerKeyShape = {
  correctNumeric: z.coerce.number().min(-1e12).max(1e12).optional(),
  /** Absolute tolerance applied to `correctNumeric`. */
  numericTolerance: z.coerce.number().min(0).max(1e6).optional(),
  correctBoolean: z.boolean().optional(),
  /** Accepted strings for SHORT_TEXT; compared case-insensitively. */
  correctText: z.array(text(200, 1)).max(20).optional(),
} as const;

const questionBase = z.object({
  ...questionShape,
  ...answerKeyShape,
  options: z.array(answerOptionInput).max(24).optional(),
  hints: z.array(hintInput).max(6).optional(),
});

type QuestionDraft = z.infer<typeof questionBase>;

/**
 * Checks that the answer key matches the question type. Exported because the
 * update route reaches it with a partial body and the stored type, so the
 * service re-runs the same rule rather than duplicating it.
 */
export function answerKeyIssues(draft: {
  type: QuestionType;
  correctNumeric?: number | null;
  correctBoolean?: boolean | null;
  correctText?: string[] | null;
  options?: { isCorrect?: boolean; matchKey?: string | null }[] | null;
}): string[] {
  const issues: string[] = [];
  const options = draft.options ?? [];

  switch (draft.type) {
    case QuestionType.MULTIPLE_CHOICE:
      if (options.length < 2) issues.push('A multiple-choice question needs at least two options.');
      if (!options.some((option) => option.isCorrect === true)) {
        issues.push('Mark at least one option as correct.');
      }
      break;
    case QuestionType.TRUE_FALSE:
      if (draft.correctBoolean === undefined || draft.correctBoolean === null) {
        issues.push('Set correctBoolean for a true/false question.');
      }
      break;
    case QuestionType.NUMERIC:
      if (draft.correctNumeric === undefined || draft.correctNumeric === null) {
        issues.push('Set correctNumeric for a numeric question.');
      }
      break;
    case QuestionType.SHORT_TEXT:
      if (!draft.correctText || draft.correctText.length === 0) {
        issues.push('Provide at least one accepted answer for a short-text question.');
      }
      break;
    case QuestionType.MATCHING:
      if (options.length < 2) issues.push('A matching question needs at least two pairs.');
      if (options.some((option) => !option.matchKey)) {
        issues.push('Every matching option needs a matchKey identifying its pair.');
      }
      break;
    case QuestionType.SORTING:
      if (options.length < 2) issues.push('A sorting question needs at least two items.');
      break;
    default:
      break;
  }

  return issues;
}

function applyAnswerKeyRule(draft: QuestionDraft, ctx: z.RefinementCtx): void {
  for (const message of answerKeyIssues(draft)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['type'] });
  }
}

export const createQuestionSchema = questionBase.superRefine(applyAnswerKeyRule);

/**
 * `.partial()` cannot follow `.superRefine()`, so the update shape is declared
 * from the same pieces and the answer-key rule runs in the service, where the
 * stored question type is known.
 */
export const updateQuestionSchema = z
  .object({ ...questionShape, ...answerKeyShape })
  .partial()
  .extend({
    promptMediaId: idSchema.nullable().optional(),
    objectiveId: idSchema.nullable().optional(),
    timeLimitSeconds: z.coerce.number().int().min(5).max(3600).nullable().optional(),
    correctNumeric: z.coerce.number().min(-1e12).max(1e12).nullable().optional(),
    numericTolerance: z.coerce.number().min(0).max(1e6).nullable().optional(),
    correctBoolean: z.boolean().nullable().optional(),
    correctText: z.array(text(200, 1)).max(20).nullable().optional(),
  });

export const createAnswerOptionSchema = answerOptionInput;
export const updateAnswerOptionSchema = answerOptionInput
  .partial()
  .extend({ mediaId: idSchema.nullable().optional() });

export const createHintSchema = hintInput;
export const updateHintSchema = hintInput.partial();

export const questionParams = z.object({ id: idSchema, questionId: idSchema });
export const optionParams = z.object({ id: idSchema, optionId: idSchema });
export const hintParams = z.object({ id: idSchema, hintId: idSchema });

// ── Governance: ownership, publication, reports, moderation ──────────────────

/** Matches the `targetType` vocabulary documented on `ContentOwnershipRecord`. */
export const CONTENT_TARGET_TYPES = [
  'CURRICULUM_PROGRAM',
  'UNIT',
  'TOPIC',
  'LESSON',
  'ACTIVITY',
  'MEDIA',
] as const;

export const ownershipListQuery = listQuerySchema.extend({
  targetType: z.enum(CONTENT_TARGET_TYPES).optional(),
  ownership: z.nativeEnum(ContentOwnership).optional(),
});

export const setOwnershipSchema = z.object({
  targetType: z.enum(CONTENT_TARGET_TYPES),
  targetId: idSchema,
  ownership: z.nativeEnum(ContentOwnership),
  licenseHolder: optionalText(200),
  licenseReference: optionalText(200),
  licenseStartsAt: z.coerce.date().optional(),
  licenseEndsAt: z.coerce.date().optional(),
  /** Whether the school may share this outside its own tenant. */
  canRedistribute: z.boolean().default(false),
  notes: optionalText(LONG_TEXT),
});

export const publicationListQuery = listQuerySchema.extend({
  lessonId: idSchema.optional(),
  activityId: idSchema.optional(),
  status: z.nativeEnum(ContentStatus).optional(),
});

export const contentReportListQuery = listQuerySchema.extend({
  decision: z.nativeEnum(ModerationDecision).optional(),
  reason: z.nativeEnum(ContentReportReason).optional(),
  lessonId: idSchema.optional(),
  activityId: idSchema.optional(),
  /** A learner may only ever list their own reports; this is the staff filter. */
  mine: boolQuery(false),
});

export const createContentReportSchema = z
  .object({
    lessonId: idSchema.optional(),
    activityId: idSchema.optional(),
    targetType: z.enum(CONTENT_TARGET_TYPES).optional(),
    targetId: idSchema.optional(),
    reason: z.nativeEnum(ContentReportReason),
    details: optionalText(LONG_TEXT),
  })
  .refine(
    (value) => Boolean(value.lessonId ?? value.activityId ?? value.targetId),
    { message: 'Say what is being reported: lessonId, activityId or targetId.', path: ['targetId'] },
  );

export const resolveContentReportSchema = z.object({
  decision: z.nativeEnum(ModerationDecision),
  resolutionNotes: optionalText(LONG_TEXT),
  /** Set when the review is escalated to platform safety staff. */
  escalatedToId: idSchema.optional(),
});

export const moderationReviewListQuery = listQuerySchema.extend({
  targetType: z.enum(CONTENT_TARGET_TYPES).optional(),
  targetId: idSchema.optional(),
  decision: z.nativeEnum(ModerationDecision).optional(),
  reportId: idSchema.optional(),
});

export const createModerationReviewSchema = z.object({
  targetType: z.enum(CONTENT_TARGET_TYPES),
  targetId: idSchema,
  reportId: idSchema.optional(),
  decision: z.nativeEnum(ModerationDecision),
  notes: optionalText(LONG_TEXT),
  escalatedToId: idSchema.optional(),
});

export type LessonListQuery = z.infer<typeof lessonListQuery>;
export type ActivityListQuery = z.infer<typeof activityListQuery>;
export type OwnershipListQuery = z.infer<typeof ownershipListQuery>;
export type PublicationListQuery = z.infer<typeof publicationListQuery>;
export type ContentReportListQuery = z.infer<typeof contentReportListQuery>;
export type ModerationReviewListQuery = z.infer<typeof moderationReviewListQuery>;
