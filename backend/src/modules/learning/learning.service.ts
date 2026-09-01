// ─────────────────────────────────────────────────────────────────────────────
// Learning paths
// Blueprint 03: the path is the learner's route through the curriculum, in one of
// four modes, ordered so that prerequisites come first. Blueprint 04: the system
// generates it, the teacher approves it, and nothing reaches the learner before
// that approval unless the school has explicitly turned the step off.
//
// Siblings in this module:
//   learning.items.service.ts    — the individual steps and their progression
//   recommendations.service.ts   — the approval queue and its decisions
//   learning.helpers.ts          — guards, prerequisite walk, target rules
// ─────────────────────────────────────────────────────────────────────────────

import type { PathMode, Prisma } from '@prisma/client';
import { MasteryLevel, PathItemStatus } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { badRequest, conflict } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import {
  assertPathModeAllowed,
  initialStatus,
  isStaffActor,
  pathScope,
  requirePath,
  requireStudent,
  requireSubject,
  resolveUnlockable,
  shortId,
  SECURE_LEVELS,
} from './learning.helpers';
import type {
  CreatePathInput,
  GeneratePathInput,
  PathListQuery,
} from './learning.validation';

const PATH_LIST_SELECT = {
  id: true,
  studentId: true,
  subjectId: true,
  mode: true,
  name: true,
  version: true,
  isActive: true,
  requiresApproval: true,
  approvedById: true,
  approvedAt: true,
  generatedAt: true,
  generatorNote: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  subject: { select: { id: true, name: true, key: true } },
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  _count: { select: { items: true, recommendations: true } },
} satisfies Prisma.LearningPathSelect;

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listPaths(
  actor: AuthenticatedActor,
  schoolId: string,
  query: PathListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const scope = pathScope(actor);
  const staff = scope.restrictToStudentId === undefined;

  const where: Prisma.LearningPathWhereInput = {
    schoolId,
    ...(scope.restrictToStudentId ? { studentId: scope.restrictToStudentId } : {}),
    ...(query.studentId && staff ? { studentId: query.studentId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    ...(query.onlyActive ? { isActive: true } : {}),
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.awaitingApproval ? { requiresApproval: true, approvedAt: null } : {}),
    ...(query.search ? { name: { contains: query.search } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.learningPath.findMany({
      where,
      skip,
      take,
      orderBy: [{ isActive: 'desc' }, { generatedAt: 'desc' }],
      select: PATH_LIST_SELECT,
    }),
    prisma.learningPath.count({ where }),
  ]);

  return { items: await withListSummaries(items), totalItems };
}

/**
 * Attaches the same `summary` shape `getPath` returns, so a caller can render a
 * path from the list without having to fetch each one to find out how far along
 * it is — which is what the teacher's list does.
 *
 * Counted in one grouped query over the page rather than per row: the list is
 * paginated, so this is two queries regardless of page size instead of one per
 * path. `_count.items` on the row is deliberately not used for the total, since
 * it counts removed steps too and would disagree with the detail view.
 */
async function withListSummaries<T extends { id: string; requiresApproval: boolean; approvedAt: Date | null }>(
  paths: T[],
): Promise<(T & { summary: PathListSummary })[]> {
  if (paths.length === 0) return [];

  const grouped = await prisma.learningPathItem.groupBy({
    by: ['pathId', 'status'],
    where: { pathId: { in: paths.map((path) => path.id) }, removedAt: null },
    _count: { _all: true },
  });

  const tally = new Map<string, { total: number; completed: number; required: number }>();
  for (const row of grouped) {
    const entry = tally.get(row.pathId) ?? { total: 0, completed: 0, required: 0 };
    entry.total += row._count._all;
    if (row.status === PathItemStatus.COMPLETED) entry.completed += row._count._all;
    tally.set(row.pathId, entry);
  }

  return paths.map((path) => {
    const counts = tally.get(path.id) ?? { total: 0, completed: 0, required: 0 };
    return {
      ...path,
      summary: {
        stepsTotal: counts.total,
        stepsCompleted: counts.completed,
        completionPercent:
          counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
        isApproved: !path.requiresApproval || path.approvedAt !== null,
      },
    };
  });
}

interface PathListSummary {
  stepsTotal: number;
  stepsCompleted: number;
  completionPercent: number;
  isApproved: boolean;
}

export async function getPath(actor: AuthenticatedActor, schoolId: string, id: string) {
  const scope = pathScope(actor);
  const path = await requirePath(schoolId, id, scope.restrictToStudentId);

  /*
   * `requirePath` is the shared access guard and deliberately selects scalars
   * only, so the many callers that just need to check ownership do not pay for
   * joins. The detail view does need the names, and every client of this
   * endpoint expects `subject` and `student` alongside the path — so they are
   * read here rather than widened into the guard.
   */
  const named = await prisma.learningPath.findUniqueOrThrow({
    where: { id: path.id },
    select: {
      subject: { select: { id: true, name: true, key: true } },
      student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
    },
  });

  const items = await prisma.learningPathItem.findMany({
    where: { pathId: path.id, removedAt: null },
    orderBy: [{ sortOrder: 'asc' }],
    select: {
      id: true,
      topicId: true,
      lessonId: true,
      activityId: true,
      assessmentId: true,
      sortOrder: true,
      status: true,
      isRequired: true,
      unlockedAt: true,
      startedAt: true,
      completedAt: true,
      dueAt: true,
      topic: { select: { id: true, name: true, key: true, difficultyBand: true, estimatedMinutes: true } },
      lesson: { select: { id: true, title: true, key: true } },
      activity: { select: { id: true, title: true, key: true, type: true, pointsValue: true } },
      assessment: { select: { id: true, title: true, key: true, kind: true } },
    },
  });

  const done = items.filter((item) => item.status === PathItemStatus.COMPLETED).length;
  const required = items.filter((item) => item.isRequired).length;

  return {
    ...path,
    ...named,
    items,
    summary: {
      stepsTotal: items.length,
      stepsRequired: required,
      stepsCompleted: done,
      completionPercent: items.length > 0 ? Math.round((done / items.length) * 100) : 0,
      nextStepId:
        items.find(
          (item) =>
            item.status === PathItemStatus.AVAILABLE || item.status === PathItemStatus.IN_PROGRESS,
        )?.id ?? null,
      isApproved: !path.requiresApproval || path.approvedAt !== null,
    },
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export async function createPath(context: ActorContext, schoolId: string, input: CreatePathInput) {
  await requireStudent(schoolId, input.studentId);
  await requireSubject(schoolId, input.subjectId);
  await assertPathModeAllowed(schoolId, input.mode);

  const existing = await prisma.learningPath.findFirst({
    where: { studentId: input.studentId, subjectId: input.subjectId, isActive: true, archivedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw conflict('That learner already has an active path for this subject.', {
      details: { pathId: existing.id },
    });
  }

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: input.subjectId },
    select: { name: true },
  });

  const path = await prisma.learningPath.create({
    data: {
      schoolId,
      studentId: input.studentId,
      subjectId: input.subjectId,
      mode: input.mode,
      name: input.name ?? `${subject.name} path`,
      notes: input.notes ?? null,
      requiresApproval: input.requiresApproval,
    },
    select: PATH_LIST_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.generate',
    targetType: 'LearningPath',
    targetId: path.id,
    schoolId,
    summary: `Created an empty ${input.mode} path for ${subject.name}.`,
    afterData: { mode: input.mode, requiresApproval: input.requiresApproval },
  });

  return path;
}

export async function updatePath(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: { mode?: PathMode; name?: string; notes?: string; isActive?: boolean; generatorNote?: string },
) {
  const before = await requirePath(schoolId, id);
  if (input.mode) await assertPathModeAllowed(schoolId, input.mode);

  const path = await prisma.learningPath.update({
    where: { id },
    data: {
      mode: input.mode,
      name: input.name,
      notes: input.notes,
      isActive: input.isActive,
      generatorNote: input.generatorNote,
    },
    select: PATH_LIST_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPath',
    targetId: id,
    schoolId,
    summary: `Updated path "${path.name}".`,
    beforeData: { mode: before.mode, isActive: before.isActive, name: before.name },
    afterData: { mode: path.mode, isActive: path.isActive, name: path.name },
  });

  return path;
}

/**
 * Blueprint 04: approval is the moment the plan becomes real. The first available
 * step is unlocked here, because an approved path with everything still locked would
 * leave the learner with nothing to do.
 */
export async function approvePath(
  context: ActorContext,
  schoolId: string,
  id: string,
  note?: string,
) {
  const path = await requirePath(schoolId, id);
  if (path.approvedAt) {
    throw conflict('That path is already approved.');
  }

  const now = new Date();
  await prisma.learningPath.update({
    where: { id },
    data: {
      approvedById: shortId(context.actor.userId),
      approvedAt: now,
      generatorNote: note ?? path.generatorNote,
    },
  });

  const first = await prisma.learningPathItem.findFirst({
    where: { pathId: id, removedAt: null, status: PathItemStatus.LOCKED },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  if (first) {
    await prisma.learningPathItem.update({
      where: { id: first.id },
      data: { status: PathItemStatus.AVAILABLE, unlockedAt: now },
    });
  }

  recordAudit(context, {
    action: 'learningpath.approve',
    targetType: 'LearningPath',
    targetId: id,
    schoolId,
    summary: `Approved path "${path.name}".`,
    reason: note ?? null,
    afterData: { approvedAt: now.toISOString(), unlockedStepId: first?.id ?? null },
  });

  return getPath(context.actor, schoolId, id);
}

export async function archivePath(context: ActorContext, schoolId: string, id: string) {
  const path = await requirePath(schoolId, id);
  if (path.archivedAt) return path;

  const archived = await prisma.learningPath.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
    select: PATH_LIST_SELECT,
  });

  recordAudit(context, {
    action: 'learningpath.update',
    targetType: 'LearningPath',
    targetId: id,
    schoolId,
    summary: `Archived path "${path.name}".`,
    beforeData: { isActive: path.isActive },
    afterData: { archived: true },
  });

  return archived;
}

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Builds a path from the learner's current mastery picture. The rules, in order:
 *
 *   • only published topics in the subject are candidates
 *   • a topic the learner has already mastered is skipped, or included as a
 *     COMPLETED step when the caller wants the whole map visible
 *   • a topic whose hard prerequisites are unmet is LOCKED, not omitted, so the
 *     learner can see what is coming and the teacher can see why it is shut
 *   • ordering follows the curriculum's own `sortOrder`, then difficulty band
 *
 * Nothing here decides mastery: it reads what the assessment module inferred.
 */
export async function generatePath(
  context: ActorContext,
  schoolId: string,
  input: GeneratePathInput,
) {
  await requireStudent(schoolId, input.studentId);
  await requireSubject(schoolId, input.subjectId);
  await assertPathModeAllowed(schoolId, input.mode);

  const topics = await prisma.topic.findMany({
    where: { schoolId, subjectId: input.subjectId, status: 'PUBLISHED', archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { difficultyBand: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, difficultyBand: true, estimatedMinutes: true },
  });
  if (topics.length === 0) {
    throw badRequest('That subject has no published topics to build a path from.');
  }

  const mastery = await prisma.masteryRecord.findMany({
    where: { studentId: input.studentId, subjectId: input.subjectId, objectiveId: null },
    select: { topicId: true, level: true },
  });
  const masteredIds = new Set(
    mastery.filter((row) => row.level === MasteryLevel.MASTERED).map((row) => row.topicId),
  );
  const secureIds = new Set(
    mastery.filter((row) => SECURE_LEVELS.includes(row.level)).map((row) => row.topicId),
  );

  const candidates = input.includeMastered
    ? topics
    : topics.filter((topic) => !masteredIds.has(topic.id));
  const planned = candidates.slice(0, input.topicLimit);
  if (planned.length === 0) {
    throw badRequest('This learner has already mastered every published topic in this subject.');
  }

  const { available, blockedBy } = await resolveUnlockable(
    input.studentId,
    planned.map((topic) => topic.id),
  );

  const subject = await prisma.subject.findUniqueOrThrow({
    where: { id: input.subjectId },
    select: { name: true },
  });

  const previous = await prisma.learningPath.findFirst({
    where: { studentId: input.studentId, subjectId: input.subjectId, isActive: true, archivedAt: null },
    select: { id: true, version: true },
  });

  const path = await prisma.$transaction(async (tx) => {
    if (previous && input.replaceExisting) {
      await tx.learningPath.update({
        where: { id: previous.id },
        data: { isActive: false, archivedAt: new Date() },
      });
    } else if (previous) {
      throw conflict('That learner already has an active path for this subject.', {
        details: { pathId: previous.id },
      });
    }

    const created = await tx.learningPath.create({
      data: {
        schoolId,
        studentId: input.studentId,
        subjectId: input.subjectId,
        mode: input.mode,
        name: `${subject.name} path`,
        version: (previous?.version ?? 0) + 1,
        requiresApproval: true,
        generatorNote:
          `Generated from ${mastery.length} mastery record(s): ` +
          `${planned.length} topic(s) planned, ${blockedBy.size} locked behind prerequisites.`,
      },
      select: { id: true },
    });

    let sortOrder = 0;
    for (const topic of planned) {
      const mastered = masteredIds.has(topic.id);
      const unlocked = available.has(topic.id) || secureIds.has(topic.id);
      const unmet = blockedBy.get(topic.id) ?? [];

      await tx.learningPathItem.create({
        data: {
          pathId: created.id,
          topicId: topic.id,
          sortOrder,
          status: initialStatus(unlocked, mastered),
          isRequired: !mastered,
          reason:
            unmet.length > 0
              ? `Locked until ${unmet.length} prerequisite topic(s) are secure.`
              : null,
          unlockedAt: unlocked && !mastered ? new Date() : null,
          completedAt: mastered ? new Date() : null,
        },
      });
      sortOrder += 1;
    }

    return created;
  });

  recordAudit(context, {
    action: 'learningpath.generate',
    targetType: 'LearningPath',
    targetId: path.id,
    schoolId,
    summary: `Generated a ${input.mode} path for ${subject.name} with ${planned.length} step(s).`,
    afterData: {
      steps: planned.length,
      locked: blockedBy.size,
      replacedPathId: previous?.id ?? null,
    },
  });

  return getPath(context.actor, schoolId, path.id);
}

/** The learner-facing view: their approved, active path for one subject. */
export async function getActivePath(
  actor: AuthenticatedActor,
  schoolId: string,
  subjectId: string,
  studentId?: string,
) {
  const scope = pathScope(actor);
  const targetId = scope.restrictToStudentId ?? studentId ?? actor.userId;

  const path = await prisma.learningPath.findFirst({
    where: { schoolId, studentId: targetId, subjectId, isActive: true, archivedAt: null },
    orderBy: { generatedAt: 'desc' },
    select: { id: true },
  });
  if (!path) return null;

  const full = await getPath(actor, schoolId, path.id);

  // A learner is not shown an unapproved plan; staff are, because they are the ones
  // who have to approve it.
  if (!full.summary.isApproved && !isStaffActor(actor)) return null;
  return full;
}
