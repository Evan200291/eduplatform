// ─────────────────────────────────────────────────────────────────────────────
// Learning path steps
// Blueprint 04: "a teacher can insert or remove steps, and that is recorded." A
// removal is therefore soft — the step is marked REMOVED_BY_TEACHER with a reason
// and kept, so the history of the plan survives the edit.
//
// Progression is deliberately simple: one step becomes available at a time, and
// completing a step unlocks the next one whose prerequisites are met. The
// prerequisite test itself lives in learning.helpers.ts so generation and unlocking
// cannot drift apart.
//
// Finishing a *lesson* step also earns points, because a lesson is the one kind of
// learning on a path that leaves no markable evidence behind — see
// `creditLessonStep` at the bottom of this file for why the other kinds do not.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { PathItemStatus, PointsReason } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { badRequest, conflict, forbidden } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { intensityFor, recordLearningEvent } from '../gamification/gamification.service';
import { pointsForLesson } from '../gamification/learning.points';
import {
  assertPathUsable,
  assertSingleTarget,
  assertTargetInScope,
  isStaffActor,
  nextSortOrder,
  pathScope,
  requirePath,
  requirePathItem,
  resolveUnlockable,
  shortId,
} from './learning.helpers';
import type { AddPathItemInput, PathItemListQuery } from './learning.validation';

const log = logger.child({ module: 'learning.items' });

const ITEM_SELECT = {
  id: true,
  pathId: true,
  topicId: true,
  lessonId: true,
  activityId: true,
  assessmentId: true,
  sortOrder: true,
  status: true,
  isRequired: true,
  addedByTeacherId: true,
  removedByTeacherId: true,
  removedAt: true,
  reason: true,
  unlockedAt: true,
  startedAt: true,
  completedAt: true,
  dueAt: true,
  topic: { select: { id: true, name: true, key: true, difficultyBand: true, estimatedMinutes: true } },
  lesson: { select: { id: true, title: true, key: true } },
  activity: { select: { id: true, title: true, key: true, type: true, pointsValue: true } },
  assessment: { select: { id: true, title: true, key: true, kind: true } },
} satisfies Prisma.LearningPathItemSelect;

export async function listPathItems(
  actor: AuthenticatedActor,
  schoolId: string,
  pathId: string,
  query: PathItemListQuery,
) {
  const scope = pathScope(actor);
  const path = await requirePath(schoolId, pathId, scope.restrictToStudentId);
  const { skip, take } = toSkipTake(query);

  const where: Prisma.LearningPathItemWhereInput = {
    pathId: path.id,
    ...(query.status ? { status: query.status } : {}),
    ...(query.includeRemoved ? {} : { removedAt: null }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.learningPathItem.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }],
      select: ITEM_SELECT,
    }),
    prisma.learningPathItem.count({ where }),
  ]);

  return { items, totalItems };
}

export async function addPathItem(
  context: ActorContext,
  schoolId: string,
  pathId: string,
  input: AddPathItemInput,
) {
  const path = await requirePath(schoolId, pathId);
  assertSingleTarget(input);
  await assertTargetInScope(schoolId, path.subjectId, input);

  const item = await prisma.learningPathItem.create({
    data: {
      pathId: path.id,
      topicId: input.topicId ?? null,
      lessonId: input.lessonId ?? null,
      activityId: input.activityId ?? null,
      assessmentId: input.assessmentId ?? null,
      sortOrder: input.sortOrder ?? (await nextSortOrder(path.id)),
      status: input.status,
      isRequired: input.isRequired,
      dueAt: input.dueAt ?? null,
      reason: input.reason ?? null,
      addedByTeacherId: shortId(context.actor.userId),
      unlockedAt: input.status === PathItemStatus.AVAILABLE ? new Date() : null,
    },
    select: ITEM_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPathItem',
    targetId: item.id,
    schoolId,
    summary: `Added a step to path "${path.name}".`,
    reason: input.reason ?? null,
    afterData: { status: item.status, sortOrder: item.sortOrder },
  });

  return item;
}

export async function updatePathItem(
  context: ActorContext,
  schoolId: string,
  pathId: string,
  itemId: string,
  input: {
    sortOrder?: number;
    status?: PathItemStatus;
    isRequired?: boolean;
    dueAt?: Date;
    reason?: string;
  },
) {
  const path = await requirePath(schoolId, pathId);
  const before = await requirePathItem(path.id, itemId);

  const now = new Date();
  const item = await prisma.learningPathItem.update({
    where: { id: before.id },
    data: {
      sortOrder: input.sortOrder,
      status: input.status,
      isRequired: input.isRequired,
      dueAt: input.dueAt,
      reason: input.reason,
      unlockedAt:
        input.status === PathItemStatus.AVAILABLE && before.status === PathItemStatus.LOCKED
          ? now
          : undefined,
      completedAt: input.status === PathItemStatus.COMPLETED ? now : undefined,
    },
    select: ITEM_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPathItem',
    targetId: item.id,
    schoolId,
    summary: `Updated a step on path "${path.name}".`,
    reason: input.reason ?? null,
    beforeData: { status: before.status, sortOrder: before.sortOrder },
    afterData: { status: item.status, sortOrder: item.sortOrder },
  });

  return item;
}

/**
 * A soft removal. The learner stops seeing the step, the teacher's reason is kept,
 * and any evidence already gathered against the underlying activity is untouched —
 * responses reference the activity, never the path step.
 */
export async function removePathItem(
  context: ActorContext,
  schoolId: string,
  pathId: string,
  itemId: string,
  reason: string,
) {
  const path = await requirePath(schoolId, pathId);
  const before = await requirePathItem(path.id, itemId);
  if (before.removedAt) {
    throw conflict('That step has already been removed.');
  }

  const item = await prisma.learningPathItem.update({
    where: { id: before.id },
    data: {
      status: PathItemStatus.REMOVED_BY_TEACHER,
      removedByTeacherId: shortId(context.actor.userId),
      removedAt: new Date(),
      reason: reason.slice(0, 400),
    },
    select: ITEM_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPathItem',
    targetId: item.id,
    schoolId,
    summary: `Removed a step from path "${path.name}".`,
    reason,
    beforeData: { status: before.status },
    afterData: { status: item.status },
  });

  return item;
}

export async function reorderPathItems(
  context: ActorContext,
  schoolId: string,
  pathId: string,
  entries: readonly { id: string; sortOrder: number }[],
) {
  const path = await requirePath(schoolId, pathId);

  const existing = await prisma.learningPathItem.findMany({
    where: { pathId: path.id },
    select: { id: true },
  });
  const known = new Set(existing.map((row) => row.id));
  const unknown = entries.filter((entry) => !known.has(entry.id)).map((entry) => entry.id);
  if (unknown.length > 0) {
    throw badRequest('Some steps do not belong to this path.', { details: { unknown } });
  }

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.learningPathItem.update({
        where: { id: entry.id },
        data: { sortOrder: entry.sortOrder },
      }),
    ),
  );

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPath',
    targetId: path.id,
    schoolId,
    summary: `Reordered ${entries.length} step(s) on path "${path.name}".`,
  });

  return listPathItems(context.actor, schoolId, pathId, {
    page: 1,
    pageSize: 200,
    includeRemoved: false,
  });
}

// ── Progression ─────────────────────────────────────────────────────────────

/** The learner opening a step. Only an available step may be started. */
export async function startPathItem(
  actor: AuthenticatedActor,
  schoolId: string,
  pathId: string,
  itemId: string,
) {
  const scope = pathScope(actor);
  const path = await requirePath(schoolId, pathId, scope.restrictToStudentId);
  assertPathUsable(path);

  const item = await requirePathItem(path.id, itemId);
  if (item.status === PathItemStatus.LOCKED) {
    throw forbidden('That step is not unlocked yet.');
  }
  if (item.status === PathItemStatus.REMOVED_BY_TEACHER || item.removedAt) {
    throw forbidden('That step is no longer part of the path.');
  }
  if (item.status === PathItemStatus.COMPLETED) return item;

  return prisma.learningPathItem.update({
    where: { id: item.id },
    data: {
      status: PathItemStatus.IN_PROGRESS,
      startedAt: item.startedAt ?? new Date(),
    },
    select: ITEM_SELECT,
  });
}

/**
 * Completes a step and opens the next one. Called by a learner finishing an
 * activity and by a teacher marking a step done on their behalf; the actor decides
 * which of the two it is, so a learner cannot complete someone else's step.
 */
export async function completePathItem(
  context: ActorContext,
  schoolId: string,
  pathId: string,
  itemId: string,
) {
  const scope = pathScope(context.actor);
  const path = await requirePath(schoolId, pathId, scope.restrictToStudentId);
  const item = await requirePathItem(path.id, itemId);
  if (item.removedAt) {
    throw forbidden('That step is no longer part of the path.');
  }

  const now = new Date();
  const completed = await prisma.learningPathItem.update({
    where: { id: item.id },
    data: {
      status: PathItemStatus.COMPLETED,
      startedAt: item.startedAt ?? now,
      completedAt: now,
    },
    select: ITEM_SELECT,
  });

  const unlocked = await unlockNextAvailable(path.id, path.studentId);

  // A path whose required steps are all done is finished. Recorded on the path so a
  // teacher's list can show it without counting steps.
  const outstanding = await prisma.learningPathItem.count({
    where: {
      pathId: path.id,
      removedAt: null,
      isRequired: true,
      status: { notIn: [PathItemStatus.COMPLETED, PathItemStatus.SKIPPED] },
    },
  });
  if (outstanding === 0 && !path.completedAt) {
    await prisma.learningPath.update({ where: { id: path.id }, data: { completedAt: now } });
  }

  await creditLessonStep(schoolId, path.studentId, completed);

  if (isStaffActor(context.actor)) {
    recordAudit(context, {
      action: 'learningpath.update',
      targetType: 'LearningPathItem',
      targetId: completed.id,
      schoolId,
      summary: `Marked a step complete on path "${path.name}".`,
      afterData: { unlockedStepId: unlocked?.id ?? null, pathCompleted: outstanding === 0 },
    });
  }

  return { item: completed, unlockedNext: unlocked, pathCompleted: outstanding === 0 };
}

/**
 * Recognition for a lesson read to the end — the one piece of learning on a path that
 * produces no markable evidence of its own, and so the only step that is paid for
 * here. An activity or assessment step is paid by the evidence it generates in
 * `assessment.evaluation.service`; crediting the step as well would pay twice for one
 * piece of work, which is exactly what `learning.points.ts` rule 2 forbids.
 *
 * The step id is the source, so a learner who is walked back through the same step by
 * a teacher is not paid again, and re-running this is free. Failure is logged and
 * swallowed: the step is complete either way, and a learner must never lose finished
 * work because the ledger was busy.
 */
async function creditLessonStep(
  schoolId: string,
  studentId: string,
  item: { id: string; lessonId: string | null; activityId: string | null; assessmentId: string | null },
): Promise<void> {
  if (!item.lessonId || item.activityId || item.assessmentId) return;

  try {
    await recordLearningEvent({
      schoolId,
      studentId,
      reason: PointsReason.LESSON_COMPLETION,
      points: pointsForLesson(await intensityFor(schoolId)),
      sourceType: 'LearningPathItem',
      sourceId: item.id,
      note: 'Lesson finished',
    });
  } catch (error) {
    log.error({ err: error, itemId: item.id }, 'Could not credit a finished lesson step');
  }
}

/**
 * Opens the earliest locked step whose hard prerequisites are now met. Returns the
 * step it opened, or null when the next step is still blocked — which is a valid
 * outcome, not an error: the learner has more evidence to gather first.
 */
export async function unlockNextAvailable(pathId: string, studentId: string) {
  const open = await prisma.learningPathItem.findFirst({
    where: {
      pathId,
      removedAt: null,
      status: { in: [PathItemStatus.AVAILABLE, PathItemStatus.IN_PROGRESS] },
    },
    select: { id: true },
  });
  if (open) return null;

  const locked = await prisma.learningPathItem.findMany({
    where: { pathId, removedAt: null, status: PathItemStatus.LOCKED },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, topicId: true },
  });
  if (locked.length === 0) return null;

  const topicIds = locked
    .map((row) => row.topicId)
    .filter((value): value is string => value !== null);
  const { available } = await resolveUnlockable(studentId, topicIds);

  const candidate = locked.find((row) => row.topicId === null || available.has(row.topicId));
  if (!candidate) return null;

  return prisma.learningPathItem.update({
    where: { id: candidate.id },
    data: { status: PathItemStatus.AVAILABLE, unlockedAt: new Date() },
    select: ITEM_SELECT,
  });
}

/**
 * Re-tests every locked step against the learner's current mastery. Called after new
 * evidence arrives, so a learner who has just secured a prerequisite does not have
 * to wait for a teacher to notice.
 */
export async function refreshPathUnlocks(schoolId: string, pathId: string): Promise<number> {
  const path = await requirePath(schoolId, pathId);
  const locked = await prisma.learningPathItem.findMany({
    where: { pathId: path.id, removedAt: null, status: PathItemStatus.LOCKED },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, topicId: true },
  });
  if (locked.length === 0) return 0;

  const topicIds = locked
    .map((row) => row.topicId)
    .filter((value): value is string => value !== null);
  const { available } = await resolveUnlockable(path.studentId, topicIds);

  const openable = locked.filter((row) => row.topicId !== null && available.has(row.topicId));
  if (openable.length === 0) return 0;

  const now = new Date();
  await prisma.learningPathItem.updateMany({
    where: { id: { in: openable.map((row) => row.id) } },
    data: { status: PathItemStatus.AVAILABLE, unlockedAt: now },
  });

  return openable.length;
}
