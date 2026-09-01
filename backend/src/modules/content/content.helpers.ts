// ─────────────────────────────────────────────────────────────────────────────
// Content module internals
// Tenant guards, key generation and the publication snapshot builder live here
// so `content.service.ts` reads as business rules rather than plumbing. Nothing
// in this file is mounted on a route; it is imported by the content service and
// by the media service.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentStatus, Prisma } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';

/** `createdById` and friends are plain 32-char columns, not relations. */
export function shortId(userId: string): string {
  return userId.slice(0, 32);
}

/**
 * Activity types that carry their own questions. The rest are read-only
 * (EXPLANATION, WORKED_EXAMPLE), driven by `config` (MINI_GAME, SORTING sets)
 * or completed away from the screen (TEACHER_TASK).
 */
export function requiresQuestions(type: string): boolean {
  return ['MULTIPLE_CHOICE', 'NUMERIC_RESPONSE', 'TRUE_FALSE', 'MATCHING', 'SORTING', 'QUIZ'].includes(
    type,
  );
}

// ── Tenant guards ───────────────────────────────────────────────────────────

export async function requireTopic(schoolId: string, topicId: string) {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, schoolId },
    select: { id: true, subjectId: true, name: true },
  });
  if (!topic) throw notFound('Topic');
  return topic;
}

export async function requireLesson(schoolId: string, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, schoolId },
    select: { id: true, title: true, topicId: true },
  });
  if (!lesson) throw notFound('Lesson');
  return lesson;
}

export async function requireActivity(schoolId: string, activityId: string) {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, schoolId },
    select: { id: true, title: true, topicId: true, status: true, type: true },
  });
  if (!activity) throw notFound('Activity');
  return activity;
}

export async function requireQuestion(schoolId: string, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, activity: { schoolId } },
    select: { id: true, type: true, activityId: true },
  });
  if (!question) throw notFound('Question');
  return question;
}

export async function requireObjective(schoolId: string, objectiveId: string): Promise<void> {
  const objective = await prisma.learningObjective.findFirst({
    where: { id: objectiveId, schoolId },
    select: { id: true },
  });
  if (!objective) throw notFound('Learning objective');
}

/**
 * A media id from a request body is re-checked against the tenant before use.
 * Platform-library assets have no school and are usable by every tenant.
 */
export async function requireMedia(schoolId: string, mediaId: string): Promise<void> {
  const media = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, deletedAt: null, OR: [{ schoolId }, { schoolId: null }] },
    select: { id: true },
  });
  if (!media) throw notFound('Media asset');
}

export interface ObjectiveLink {
  objectiveId: string;
  weight: number;
}

/** Keeps objective links inside the activity's own topic. */
export async function filterTopicObjectives(
  topicId: string,
  objectives: readonly ObjectiveLink[],
): Promise<ObjectiveLink[]> {
  if (objectives.length === 0) return [];

  const rows = await prisma.learningObjective.findMany({
    where: { topicId, id: { in: objectives.map((link) => link.objectiveId) } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((row) => row.id));
  const filtered = objectives.filter((link) => allowed.has(link.objectiveId));

  if (filtered.length !== objectives.length) {
    throw badRequest('One or more objectives do not belong to this topic.');
  }
  return filtered.map((link) => ({ objectiveId: link.objectiveId, weight: link.weight }));
}

/** A governance row must point at something that exists inside this school. */
export async function assertOwnershipTargetExists(
  schoolId: string,
  targetType: string,
  targetId: string,
): Promise<void> {
  const found = await (async () => {
    const select = { id: true } as const;
    switch (targetType) {
      case 'CURRICULUM_PROGRAM':
        return prisma.curriculumProgram.findFirst({ where: { id: targetId, schoolId }, select });
      case 'UNIT':
        return prisma.unit.findFirst({ where: { id: targetId, schoolId }, select });
      case 'TOPIC':
        return prisma.topic.findFirst({ where: { id: targetId, schoolId }, select });
      case 'LESSON':
        return prisma.lesson.findFirst({ where: { id: targetId, schoolId }, select });
      case 'ACTIVITY':
        return prisma.activity.findFirst({ where: { id: targetId, schoolId }, select });
      case 'MEDIA':
        return prisma.mediaAsset.findFirst({
          where: { id: targetId, OR: [{ schoolId }, { schoolId: null }] },
          select,
        });
      default:
        return null;
    }
  })();

  if (!found) throw notFound(`${targetType} target`);
}

/** Normalises a report onto the `targetType` vocabulary used by reviews. */
export function resolveReportTargetType(report: {
  activityId: string | null;
  lessonId: string | null;
  targetType: string | null;
}): string {
  if (report.activityId) return 'ACTIVITY';
  if (report.lessonId) return 'LESSON';
  return report.targetType ?? 'CONTENT';
}

// ── Lifecycle side effects ──────────────────────────────────────────────────

/**
 * Editing a question under a published activity moves the activity to REVISED.
 * Learners keep seeing the last published version until someone republishes,
 * which is what blueprint 05 means by a reviewed, reversible publication.
 */
export async function markActivityDirty(context: ActorContext, activityId: string): Promise<void> {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { status: true },
  });
  if (!activity || activity.status !== ContentStatus.PUBLISHED) return;

  await prisma.activity.update({
    where: { id: activityId },
    data: { status: ContentStatus.REVISED, updatedById: shortId(context.actor.userId) },
  });
}

// ── Publication snapshot (blueprint 12) ─────────────────────────────────────

/** The exact payload `publishActivity` loads, so the snapshot builder is typed. */
export type PublishableActivity = Prisma.ActivityGetPayload<{
  include: {
    questions: { include: { options: true; hints: true } };
    objectiveLinks: { select: { objectiveId: true; weight: true } };
  };
}>;

/**
 * Serialises everything needed to re-present and re-mark the activity exactly as
 * it was published. Answer keys are included deliberately: a snapshot is only
 * ever read server-side, and it is what the assessment module marks against.
 */
export function buildActivitySnapshot(activity: PublishableActivity): Prisma.InputJsonValue {
  return {
    activityId: activity.id,
    title: activity.title,
    key: activity.key,
    type: activity.type,
    instructions: activity.instructions,
    config: toJsonValue(activity.config),
    difficultyBand: activity.difficultyBand,
    estimatedMinutes: activity.estimatedMinutes,
    pointsValue: activity.pointsValue,
    maxAttempts: activity.maxAttempts,
    passThreshold: activity.passThreshold,
    ageMode: activity.ageMode,
    topicId: activity.topicId,
    subjectId: activity.subjectId,
    lessonId: activity.lessonId,
    objectives: activity.objectiveLinks.map((link) => ({
      objectiveId: link.objectiveId,
      weight: link.weight,
    })),
    questions: activity.questions.map((question) => ({
      questionId: question.id,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation,
      config: toJsonValue(question.config),
      promptMediaId: question.promptMediaId,
      objectiveId: question.objectiveId,
      difficultyBand: question.difficultyBand,
      pointsValue: question.pointsValue,
      sortOrder: question.sortOrder,
      timeLimitSeconds: question.timeLimitSeconds,
      correctNumeric: toNumber(question.correctNumeric),
      numericTolerance: toNumber(question.numericTolerance),
      correctBoolean: question.correctBoolean,
      correctText: toStringArray(question.correctText),
      options: question.options.map((option) => ({
        optionId: option.id,
        label: option.label,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
        feedback: option.feedback,
        matchKey: option.matchKey,
        mediaId: option.mediaId,
      })),
      hints: question.hints.map((hint) => ({
        hintId: hint.id,
        body: hint.body,
        sortOrder: hint.sortOrder,
        pointsCost: hint.pointsCost,
      })),
    })),
  };
}

// ── Value conversion ────────────────────────────────────────────────────────

export interface AnswerOptionDraft {
  label: string;
  isCorrect: boolean;
  sortOrder: number;
  feedback?: string;
  matchKey?: string;
  mediaId?: string;
}

/** Shapes an option payload for a nested or standalone create. */
export function toOptionCreate(option: AnswerOptionDraft) {
  return {
    label: option.label,
    isCorrect: option.isCorrect,
    sortOrder: option.sortOrder,
    feedback: option.feedback,
    matchKey: option.matchKey,
    mediaId: option.mediaId,
  };
}

/** `undefined` leaves a JSON column untouched; `null` clears it. */
export function toJsonInput(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value;
}

/** A stored JSON column read back for embedding in another JSON payload. */
function toJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return (value ?? null) as Prisma.InputJsonValue;
}

/** MySQL DECIMAL arrives as a Decimal; JSON and marking both want a number. */
export function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export function toStringArray(value: Prisma.JsonValue | null): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Appends `-2`…`-50` until a key is free. Mirrors the behaviour of the tenancy
 * and curriculum modules so keys read the same way everywhere.
 */
export async function uniqueKey(
  candidate: string,
  isFree: (value: string) => Promise<boolean>,
): Promise<string> {
  const base = candidate.length >= 2 ? candidate : `item-${candidate}`;
  if (await isFree(base)) return base;

  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const next = `${base}-${suffix}`;
    if (await isFree(next)) return next;
  }
  throw conflict('That key is already in use. Choose a different one.');
}
