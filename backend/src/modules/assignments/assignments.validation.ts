// ─────────────────────────────────────────────────────────────────────────────
// Assignment validation
// Blueprint 03: "A teacher can assign to an individual, group, class, grade, or
// subject cohort." A target is therefore a (type, id) pair rather than one of five
// columns, and the schema below accepts a list of them.
//
// Blueprint 04 adds the monitoring side: started, completed, overdue, excused. The
// late-behaviour rules that decide which of those a submission lands in are chosen
// on the assignment itself, never per submission.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AssignmentKind,
  AssignmentState,
  AssignmentTargetType,
  LateBehavior,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  optionalDate,
  optionalText,
  percentSchema,
  text,
} from '../../core/http/validate';

const targetSchema = z.object({
  targetType: z.nativeEnum(AssignmentTargetType),
  targetId: idSchema,
  targetLabel: optionalText(180),
});

/** At least one of topic / lesson / activity / assessment must be set. */
const workSchema = z.object({
  topicId: idSchema.optional(),
  lessonId: idSchema.optional(),
  activityId: idSchema.optional(),
  assessmentId: idSchema.optional(),
});

export const assignmentListQuery = listQuerySchema.extend({
  classId: idSchema.optional(),
  subjectId: idSchema.optional(),
  termId: idSchema.optional(),
  createdById: idSchema.optional(),
  kind: z.nativeEnum(AssignmentKind).optional(),
  topicId: idSchema.optional(),
  publishedOnly: boolQuery(false),
  includeArchived: boolQuery(false),
  /** The learner's "what is set for me?" view, and a teacher's due-this-week view. */
  dueBefore: optionalDate,
  dueAfter: optionalDate,
  /** Only assignments the calling learner has been targeted by. */
  mine: boolQuery(false),
});

export const createAssignmentSchema = workSchema
  .extend({
    kind: z.nativeEnum(AssignmentKind).default(AssignmentKind.HOMEWORK),
    title: text(200, 2),
    instructions: optionalText(6000),
    classId: idSchema.optional(),
    subjectId: idSchema.optional(),
    termId: idSchema.optional(),
    availableFrom: optionalDate,
    dueAt: optionalDate,
    lateBehavior: z.nativeEnum(LateBehavior).default(LateBehavior.ALLOW_LATE_FLAGGED),
    graceHours: z.coerce.number().int().min(0).max(336).default(24),
    allowResubmission: z.boolean().default(true),
    maxAttempts: z.coerce.number().int().min(1).max(20).optional(),
    pointsValue: z.coerce.number().int().min(0).max(10_000).default(0),
    estimatedMinutes: z.coerce.number().int().min(1).max(600).optional(),
    notifyOnAssign: z.boolean().default(true),
    notifyOnDueSoon: z.boolean().default(true),
    notifyOnOverdue: z.boolean().default(true),
    targets: z.array(targetSchema).min(1).max(100),
    /** Publish immediately rather than saving a draft the learner cannot see. */
    publish: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const set = [value.topicId, value.lessonId, value.activityId, value.assessmentId].filter(Boolean);
    if (set.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activityId'],
        message: 'Set at least one piece of work: a topic, lesson, activity or assessment.',
      });
    }
    if (value.dueAt && value.availableFrom && value.dueAt <= value.availableFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message: 'The due date has to be after the assignment becomes available.',
      });
    }
  });

export const updateAssignmentSchema = z.object({
  title: text(200, 2).optional(),
  instructions: optionalText(6000),
  kind: z.nativeEnum(AssignmentKind).optional(),
  classId: idSchema.optional(),
  subjectId: idSchema.optional(),
  termId: idSchema.optional(),
  availableFrom: optionalDate,
  dueAt: optionalDate,
  lateBehavior: z.nativeEnum(LateBehavior).optional(),
  graceHours: z.coerce.number().int().min(0).max(336).optional(),
  allowResubmission: z.boolean().optional(),
  maxAttempts: z.coerce.number().int().min(1).max(20).optional(),
  pointsValue: z.coerce.number().int().min(0).max(10_000).optional(),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).optional(),
  notifyOnAssign: z.boolean().optional(),
  notifyOnDueSoon: z.boolean().optional(),
  notifyOnOverdue: z.boolean().optional(),
});

export const setTargetsSchema = z.object({
  targets: z.array(targetSchema).min(1).max(100),
  /** Replace the target list rather than adding to it. */
  replace: z.boolean().default(true),
});

export const publishAssignmentSchema = z.object({
  /**
   * Create the monitoring rows immediately so the teacher's board is populated
   * before anyone opens the work. Off means rows appear as learners start.
   */
  materializeAttempts: z.boolean().default(true),
  notify: z.boolean().default(true),
});

// ── Learner attempts and teacher monitoring ─────────────────────────────────

export const attemptListQuery = listQuerySchema.extend({
  assignmentId: idSchema.optional(),
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  state: z.nativeEnum(AssignmentState).optional(),
  lateOnly: boolQuery(false),
  excusedOnly: boolQuery(false),
  needsFeedback: boolQuery(false),
});

export const startAssignmentSchema = z.object({
  /** A teacher may start monitoring on a learner's behalf when sitting with them. */
  studentId: idSchema.optional(),
});

export const submitAssignmentSchema = z.object({
  studentId: idSchema.optional(),
  scorePercent: percentSchema.optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(86_400).default(0),
  /** Links the submission to the assessment evidence where the work set one. */
  assessmentAttemptId: idSchema.optional(),
  note: optionalText(2000),
});

export const feedbackSchema = z.object({
  feedback: text(4000, 2),
  scorePercent: percentSchema.optional(),
  pointsAwarded: z.coerce.number().int().min(0).max(10_000).optional(),
  markComplete: z.boolean().default(false),
});

/** Blueprint 04: excusing is an explicit, reasoned, attributable action. */
export const excuseSchema = z.object({
  studentIds: z.array(idSchema).min(1).max(200),
  reason: text(400, 4),
});

export const monitorQuery = z.object({
  classId: idSchema.optional(),
  includeExcused: boolQuery(true),
});

export type AssignmentListQuery = z.infer<typeof assignmentListQuery>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SetTargetsInput = z.infer<typeof setTargetsSchema>;
export type PublishAssignmentInput = z.infer<typeof publishAssignmentSchema>;
export type AttemptListQuery = z.infer<typeof attemptListQuery>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type ExcuseInput = z.infer<typeof excuseSchema>;
export type MonitorQuery = z.infer<typeof monitorQuery>;
export type AssignmentTargetInput = z.infer<typeof targetSchema>;
