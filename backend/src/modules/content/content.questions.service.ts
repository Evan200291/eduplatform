// ─────────────────────────────────────────────────────────────────────────────
// Content service — question, answer-option and hint authoring
// Split out of `content.service.ts` so the two concerns stay readable: that file
// owns lesson and activity records, this one owns what is inside an activity.
//
// Two rules are enforced on every write:
//   - The answer key must match the question type. On a partial update the rule
//     is re-run against the merged record, because a partial edit can invalidate
//     a key that was valid when it was written.
//   - Editing anything under a PUBLISHED activity moves that activity to REVISED
//     (`markActivityDirty`). Learners keep the last published version until
//     someone republishes, which is blueprint 05's reviewable publication.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound, validationFailed } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import {
  markActivityDirty,
  requireActivity,
  requireMedia,
  requireObjective,
  requireQuestion,
  toJsonInput,
  toNumber,
  toOptionCreate,
  toStringArray,
} from './content.helpers';
import {
  answerKeyIssues,
  type createAnswerOptionSchema,
  type createHintSchema,
  type createQuestionSchema,
  type updateAnswerOptionSchema,
  type updateHintSchema,
  type updateQuestionSchema,
} from './content.validation';

type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
type CreateOptionInput = z.infer<typeof createAnswerOptionSchema>;
type UpdateOptionInput = z.infer<typeof updateAnswerOptionSchema>;
type CreateHintInput = z.infer<typeof createHintSchema>;
type UpdateHintInput = z.infer<typeof updateHintSchema>;

// ── Questions ───────────────────────────────────────────────────────────────

export async function listQuestions(schoolId: string, activityId: string) {
  await requireActivity(schoolId, activityId);
  return prisma.question.findMany({
    where: { activityId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      hints: { orderBy: { sortOrder: 'asc' } },
      objective: { select: { id: true, code: true, statement: true } },
    },
  });
}

export async function createQuestion(
  context: ActorContext,
  schoolId: string,
  activityId: string,
  input: CreateQuestionInput,
) {
  const activity = await requireActivity(schoolId, activityId);
  if (input.objectiveId) await requireObjective(schoolId, input.objectiveId);
  if (input.promptMediaId) await requireMedia(schoolId, input.promptMediaId);

  const question = await prisma.question.create({
    data: {
      activityId,
      objectiveId: input.objectiveId,
      type: input.type,
      prompt: input.prompt,
      explanation: input.explanation,
      config: toJsonInput(input.config),
      promptMediaId: input.promptMediaId,
      difficultyBand: input.difficultyBand,
      pointsValue: input.pointsValue,
      sortOrder: input.sortOrder,
      timeLimitSeconds: input.timeLimitSeconds,
      correctNumeric: input.correctNumeric,
      numericTolerance: input.numericTolerance,
      correctBoolean: input.correctBoolean,
      correctText: input.correctText ? (input.correctText as Prisma.InputJsonValue) : undefined,
      ...(input.options && input.options.length > 0
        ? { options: { create: input.options.map(toOptionCreate) } }
        : {}),
      ...(input.hints && input.hints.length > 0
        ? {
            hints: {
              create: input.hints.map((hint) => ({
                body: hint.body,
                sortOrder: hint.sortOrder,
                pointsCost: hint.pointsCost,
              })),
            },
          }
        : {}),
    },
    include: { options: { orderBy: { sortOrder: 'asc' } }, hints: { orderBy: { sortOrder: 'asc' } } },
  });

  await markActivityDirty(context, activity.id);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Question',
    targetId: question.id,
    schoolId,
    summary: `Added a ${question.type} question to "${activity.title}".`,
    afterData: { id: question.id, type: question.type, prompt: question.prompt.slice(0, 120) },
  });

  return question;
}

export async function updateQuestion(
  context: ActorContext,
  schoolId: string,
  activityId: string,
  questionId: string,
  input: UpdateQuestionInput,
) {
  const existing = await prisma.question.findFirst({
    where: { id: questionId, activityId, activity: { schoolId } },
    include: { options: { select: { isCorrect: true, matchKey: true } } },
  });
  if (!existing) throw notFound('Question');
  if (input.objectiveId) await requireObjective(schoolId, input.objectiveId);
  if (input.promptMediaId) await requireMedia(schoolId, input.promptMediaId);

  // The answer-key rule is re-checked against the merged record, because a
  // partial update can invalidate a key that was valid when it was written.
  const merged = {
    type: input.type ?? existing.type,
    correctNumeric:
      input.correctNumeric !== undefined
        ? input.correctNumeric
        : toNumber(existing.correctNumeric),
    correctBoolean: input.correctBoolean !== undefined ? input.correctBoolean : existing.correctBoolean,
    correctText:
      input.correctText !== undefined ? input.correctText : toStringArray(existing.correctText),
    options: existing.options,
  };

  const issues = answerKeyIssues(merged);
  if (issues.length > 0) {
    throw validationFailed(issues.map((message) => ({ path: 'type', message })));
  }

  const question = await prisma.question.update({
    where: { id: questionId },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
      ...(input.config !== undefined ? { config: toJsonInput(input.config) } : {}),
      ...(input.promptMediaId !== undefined ? { promptMediaId: input.promptMediaId } : {}),
      ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
      ...(input.difficultyBand !== undefined ? { difficultyBand: input.difficultyBand } : {}),
      ...(input.pointsValue !== undefined ? { pointsValue: input.pointsValue } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.timeLimitSeconds !== undefined ? { timeLimitSeconds: input.timeLimitSeconds } : {}),
      ...(input.correctNumeric !== undefined ? { correctNumeric: input.correctNumeric } : {}),
      ...(input.numericTolerance !== undefined ? { numericTolerance: input.numericTolerance } : {}),
      ...(input.correctBoolean !== undefined ? { correctBoolean: input.correctBoolean } : {}),
      ...(input.correctText !== undefined
        ? {
            correctText:
              input.correctText === null
                ? Prisma.DbNull
                : (input.correctText as Prisma.InputJsonValue),
          }
        : {}),
    },
    include: { options: { orderBy: { sortOrder: 'asc' } }, hints: { orderBy: { sortOrder: 'asc' } } },
  });

  await markActivityDirty(context, activityId);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Question',
    targetId: question.id,
    schoolId,
    summary: 'Updated a question.',
    beforeData: { type: existing.type, prompt: existing.prompt.slice(0, 120) },
    afterData: { type: question.type, prompt: question.prompt.slice(0, 120) },
  });

  return question;
}

export async function deleteQuestion(
  context: ActorContext,
  schoolId: string,
  activityId: string,
  questionId: string,
) {
  const existing = await prisma.question.findFirst({
    where: { id: questionId, activityId, activity: { schoolId } },
    select: { id: true, prompt: true, _count: { select: { responses: true } } },
  });
  if (!existing) throw notFound('Question');

  // Blueprint 12: recorded evidence is never silently destroyed. A question a
  // learner has answered stays; it is the activity version that moves on.
  if (existing._count.responses > 0) {
    throw conflict('That question already has student responses. Publish a new version instead.');
  }

  await prisma.question.delete({ where: { id: questionId } });
  await markActivityDirty(context, activityId);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Question',
    targetId: questionId,
    schoolId,
    summary: 'Deleted a question.',
    beforeData: { prompt: existing.prompt.slice(0, 120) },
  });

  return { deleted: true };
}

export async function reorderQuestions(
  context: ActorContext,
  schoolId: string,
  activityId: string,
  items: { id: string; sortOrder: number }[],
) {
  await requireActivity(schoolId, activityId);
  const owned = await prisma.question.findMany({
    where: { activityId, id: { in: items.map((item) => item.id) } },
    select: { id: true },
  });
  const allowed = new Set(owned.map((row) => row.id));
  const updates = items.filter((item) => allowed.has(item.id));
  if (updates.length === 0) throw badRequest('None of those questions belong to this activity.');

  await prisma.$transaction(
    updates.map((item) =>
      prisma.question.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
    ),
  );

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Activity',
    targetId: activityId,
    schoolId,
    summary: `Reordered ${updates.length} question(s).`,
  });

  return { updated: updates.length };
}

// ── Answer options and hints ────────────────────────────────────────────────

export async function addAnswerOption(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  input: CreateOptionInput,
) {
  const question = await requireQuestion(schoolId, questionId);
  if (input.mediaId) await requireMedia(schoolId, input.mediaId);

  const option = await prisma.answerOption.create({
    data: { questionId, ...toOptionCreate(input) },
  });

  await markActivityDirty(context, question.activityId);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'AnswerOption',
    targetId: option.id,
    schoolId,
    summary: `Added an answer option to a ${question.type} question.`,
  });

  return option;
}

export async function updateAnswerOption(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  optionId: string,
  input: UpdateOptionInput,
) {
  const question = await requireQuestion(schoolId, questionId);
  const existing = await prisma.answerOption.findFirst({ where: { id: optionId, questionId } });
  if (!existing) throw notFound('Answer option');
  if (input.mediaId) await requireMedia(schoolId, input.mediaId);

  const option = await prisma.answerOption.update({
    where: { id: optionId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.isCorrect !== undefined ? { isCorrect: input.isCorrect } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      ...(input.matchKey !== undefined ? { matchKey: input.matchKey } : {}),
      ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
    },
  });

  await markActivityDirty(context, question.activityId);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'AnswerOption',
    targetId: option.id,
    schoolId,
    summary: 'Updated an answer option.',
    beforeData: existing,
    afterData: option,
  });

  return option;
}

export async function deleteAnswerOption(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  optionId: string,
) {
  const question = await requireQuestion(schoolId, questionId);
  const existing = await prisma.answerOption.findFirst({ where: { id: optionId, questionId } });
  if (!existing) throw notFound('Answer option');

  await prisma.answerOption.delete({ where: { id: optionId } });
  await markActivityDirty(context, question.activityId);

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'AnswerOption',
    targetId: optionId,
    schoolId,
    summary: 'Deleted an answer option.',
    beforeData: existing,
  });

  return { deleted: true };
}

export async function addHint(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  input: CreateHintInput,
) {
  await requireQuestion(schoolId, questionId);
  const hint = await prisma.hint.create({
    data: {
      questionId,
      body: input.body,
      sortOrder: input.sortOrder,
      pointsCost: input.pointsCost,
    },
  });

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Hint',
    targetId: hint.id,
    schoolId,
    summary: 'Added a hint.',
  });

  return hint;
}

export async function updateHint(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  hintId: string,
  input: UpdateHintInput,
) {
  await requireQuestion(schoolId, questionId);
  const existing = await prisma.hint.findFirst({ where: { id: hintId, questionId } });
  if (!existing) throw notFound('Hint');

  const hint = await prisma.hint.update({
    where: { id: hintId },
    data: {
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
    },
  });

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Hint',
    targetId: hint.id,
    schoolId,
    summary: 'Updated a hint.',
    beforeData: existing,
    afterData: hint,
  });

  return hint;
}

export async function deleteHint(
  context: ActorContext,
  schoolId: string,
  questionId: string,
  hintId: string,
) {
  await requireQuestion(schoolId, questionId);
  const existing = await prisma.hint.findFirst({ where: { id: hintId, questionId } });
  if (!existing) throw notFound('Hint');

  await prisma.hint.delete({ where: { id: hintId } });

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Hint',
    targetId: hintId,
    schoolId,
    summary: 'Deleted a hint.',
    beforeData: existing,
  });

  return { deleted: true };
}
