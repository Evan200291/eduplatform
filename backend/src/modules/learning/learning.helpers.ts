// ─────────────────────────────────────────────────────────────────────────────
// Learning path internals
// Tenant guards, the "exactly one target" rule for a step, and the prerequisite
// walk that decides which steps a learner may see yet.
//
// Blueprint 03: "a learner is never shown a topic whose hard prerequisites are
// unmet." That rule is implemented once, here, so both generation and unlocking
// agree about what is available.
// ─────────────────────────────────────────────────────────────────────────────

import { MasteryLevel, PathItemStatus, UserStatus } from '@prisma/client';
import type { PathMode } from '@prisma/client';
import type { AuthenticatedActor } from '../../core/context';
import { badRequest, forbidden, notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';

/** Relation-free columns are plain 32-char strings, not foreign keys. */
export function shortId(userId: string): string {
  return userId.slice(0, 32);
}

/**
 * Blueprint 03 "Learning path — Modes" lists four modes as always available; a
 * school restricting that list is new admin-configurable behavior, so an unset
 * or empty `allowedPathModes` means "every mode", matching the schema default of
 * no restriction at all.
 */
export async function assertPathModeAllowed(schoolId: string, mode: PathMode): Promise<void> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: { allowedPathModes: true },
  });
  const allowed = settings?.allowedPathModes;
  if (!Array.isArray(allowed) || allowed.length === 0) return;
  if (!allowed.includes(mode)) {
    throw badRequest(`This school does not permit ${mode} learning paths.`, {
      details: { mode, allowedPathModes: allowed },
    });
  }
}

/**
 * Staff see every learner in the tenant; a learner sees only their own path. The
 * decision comes from the actor's grants, never from a query parameter.
 */
export function pathScope(actor: AuthenticatedActor): { restrictToStudentId?: string } {
  const isStaff =
    actor.permissions.has('learningpath.write') ||
    actor.permissions.has('progress.read.scoped') ||
    actor.permissions.has('progress.read.school');
  return isStaff ? {} : { restrictToStudentId: actor.userId };
}

export function isStaffActor(actor: AuthenticatedActor): boolean {
  return pathScope(actor).restrictToStudentId === undefined;
}

export async function requirePath(schoolId: string, id: string, restrictToStudentId?: string) {
  const path = await prisma.learningPath.findFirst({
    where: { id, schoolId, ...(restrictToStudentId ? { studentId: restrictToStudentId } : {}) },
    select: {
      id: true,
      schoolId: true,
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
      notes: true,
      completedAt: true,
      archivedAt: true,
    },
  });
  if (!path) throw notFound('Learning path');
  return path;
}

export type GuardedPath = Awaited<ReturnType<typeof requirePath>>;

export async function requirePathItem(pathId: string, itemId: string) {
  const item = await prisma.learningPathItem.findFirst({
    where: { id: itemId, pathId },
    select: {
      id: true,
      pathId: true,
      topicId: true,
      lessonId: true,
      activityId: true,
      assessmentId: true,
      sortOrder: true,
      status: true,
      isRequired: true,
      removedAt: true,
      dueAt: true,
      unlockedAt: true,
      startedAt: true,
      completedAt: true,
    },
  });
  if (!item) throw notFound('Learning path step');
  return item;
}

/** A learner must exist in this school and be usable before a path is built for them. */
export async function requireStudent(schoolId: string, studentId: string): Promise<void> {
  const student = await prisma.user.findFirst({
    where: { id: studentId, schoolId, archivedAt: null },
    select: { status: true },
  });
  if (!student) throw notFound('Student');
  if (student.status !== UserStatus.ACTIVE && student.status !== UserStatus.INVITED) {
    throw badRequest('That learner is not active.');
  }
}

export async function requireSubject(schoolId: string, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  if (!subject) throw notFound('Subject');
}

/**
 * A step points at exactly one thing. Allowing two would make "what does this step
 * ask the learner to do?" ambiguous, and the progression logic would have to guess.
 */
export function assertSingleTarget(target: {
  topicId?: string;
  lessonId?: string;
  activityId?: string;
  assessmentId?: string;
}): void {
  const set = [target.topicId, target.lessonId, target.activityId, target.assessmentId].filter(
    (value) => value !== undefined && value !== null,
  );
  if (set.length === 0) {
    throw badRequest('A step must point at a topic, lesson, activity or assessment.');
  }
  if (set.length > 1) {
    throw badRequest('A step points at exactly one target.');
  }
}

/** Confirms every target on a step belongs to this school and this subject. */
export async function assertTargetInScope(
  schoolId: string,
  subjectId: string,
  target: { topicId?: string; lessonId?: string; activityId?: string; assessmentId?: string },
): Promise<void> {
  if (target.topicId) {
    const topic = await prisma.topic.findFirst({
      where: { id: target.topicId, schoolId },
      select: { subjectId: true },
    });
    if (!topic) throw notFound('Topic');
    if (topic.subjectId !== subjectId) throw badRequest('That topic is in a different subject.');
    return;
  }
  if (target.lessonId) {
    const lesson = await prisma.lesson.findFirst({
      where: { id: target.lessonId, schoolId },
      select: { subjectId: true },
    });
    if (!lesson) throw notFound('Lesson');
    if (lesson.subjectId !== subjectId) throw badRequest('That lesson is in a different subject.');
    return;
  }
  if (target.activityId) {
    const activity = await prisma.activity.findFirst({
      where: { id: target.activityId, schoolId },
      select: { subjectId: true },
    });
    if (!activity) throw notFound('Activity');
    if (activity.subjectId !== subjectId) throw badRequest('That activity is in a different subject.');
    return;
  }
  if (target.assessmentId) {
    const assessment = await prisma.assessment.findFirst({
      where: { id: target.assessmentId, schoolId },
      select: { subjectId: true },
    });
    if (!assessment) throw notFound('Assessment');
    if (assessment.subjectId !== subjectId) {
      throw badRequest('That assessment is in a different subject.');
    }
  }
}

export async function nextSortOrder(pathId: string): Promise<number> {
  const last = await prisma.learningPathItem.findFirst({
    where: { pathId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

/**
 * Blueprint 04: an inert path is not a learning plan. Editing a live path is
 * allowed, but a learner cannot be shown one that has not been approved.
 */
export function assertPathUsable(path: GuardedPath): void {
  if (path.archivedAt) throw badRequest('That path has been archived.');
  if (path.requiresApproval && !path.approvedAt) {
    throw forbidden('That path is waiting for teacher approval.');
  }
}

// ── Prerequisites ───────────────────────────────────────────────────────────

export const SECURE_LEVELS: MasteryLevel[] = [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED];

/**
 * Which of `topicIds` the learner may be offered. A hard prerequisite blocks; a soft
 * one does not, because blueprint 03 wants it to warn the teacher rather than lock
 * the learner out.
 */
export async function resolveUnlockable(
  studentId: string,
  topicIds: readonly string[],
): Promise<{ available: Set<string>; blockedBy: Map<string, string[]> }> {
  const available = new Set<string>();
  const blockedBy = new Map<string, string[]>();
  if (topicIds.length === 0) return { available, blockedBy };

  const prerequisites = await prisma.topicPrerequisite.findMany({
    where: { topicId: { in: [...topicIds] }, isHard: true },
    select: { topicId: true, requiredTopicId: true },
  });

  const requiredIds = [...new Set(prerequisites.map((row) => row.requiredTopicId))];
  const secure = await prisma.masteryRecord.findMany({
    where: {
      studentId,
      topicId: { in: requiredIds.length > 0 ? requiredIds : ['__none__'] },
      objectiveId: null,
      level: { in: SECURE_LEVELS },
    },
    select: { topicId: true },
  });
  const secureIds = new Set(secure.map((row) => row.topicId));

  for (const topicId of topicIds) {
    const unmet = prerequisites
      .filter((row) => row.topicId === topicId && !secureIds.has(row.requiredTopicId))
      .map((row) => row.requiredTopicId);
    if (unmet.length === 0) {
      available.add(topicId);
    } else {
      blockedBy.set(topicId, unmet);
    }
  }

  return { available, blockedBy };
}

/** The step status a freshly generated item should carry. */
export function initialStatus(unlocked: boolean, mastered: boolean): PathItemStatus {
  if (mastered) return PathItemStatus.COMPLETED;
  return unlocked ? PathItemStatus.AVAILABLE : PathItemStatus.LOCKED;
}
