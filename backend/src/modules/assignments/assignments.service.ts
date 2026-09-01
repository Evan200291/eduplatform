// ─────────────────────────────────────────────────────────────────────────────
// Assignments: definitions, targets, publication and monitoring
// Blueprint 03: work is set to an individual, group, class, grade or subject
// cohort. Blueprint 04: the teacher then monitors started / completed / overdue /
// excused, and every excusal is reasoned and attributable.
//
// Two rules shape this file:
//
//   1. A draft is invisible to learners. Nothing reaches a learner until
//      `publishAssignment` runs, and then only once `availableFrom` has passed.
//   2. Lateness is decided by the assignment's `lateBehavior`, never per
//      submission — so two learners submitting at the same moment are treated
//      identically. The rules themselves live in `assignments.attempts.service`.
//
// Learner attempts (start, submit, feedback, excuse) live in the sibling file
// `assignments.attempts.service.ts`; this one owns the assignment itself.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  AssignmentState,
  NotificationCategory,
  NotificationPriority
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { isStudent } from '../../core/rbac/authorize';
import {
  accessibleStudentIds,
  assertCanAccessClass,
  classStudentIds,
} from '../../core/rbac/scope.service';
import { notifyUsers } from '../notifications/notifications.service';
import {
  assertTargeted,
  assertTargetsExist,
  createMissingAttempts,
  learnerTargetFilter,
  resolveTargetStudents,
} from './assignments.targets';
import type {
  AssignmentListQuery,
  CreateAssignmentInput,
  MonitorQuery,
  PublishAssignmentInput,
  SetTargetsInput,
  UpdateAssignmentInput,
} from './assignments.validation';

const TARGET_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  targetLabel: true,
} satisfies Prisma.AssignmentTargetSelect;

const ASSIGNMENT_SELECT = {
  id: true,
  schoolId: true,
  createdById: true,
  classId: true,
  subjectId: true,
  termId: true,
  kind: true,
  title: true,
  instructions: true,
  topicId: true,
  lessonId: true,
  activityId: true,
  assessmentId: true,
  availableFrom: true,
  dueAt: true,
  lateBehavior: true,
  graceHours: true,
  allowResubmission: true,
  maxAttempts: true,
  pointsValue: true,
  estimatedMinutes: true,
  isPublished: true,
  publishedAt: true,
  notifyOnAssign: true,
  notifyOnDueSoon: true,
  notifyOnOverdue: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  createdBy: { select: { id: true, displayName: true } },
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true, colorHex: true } },
  topic: { select: { id: true, name: true } },
  lesson: { select: { id: true, title: true } },
  activity: { select: { id: true, title: true, type: true, estimatedMinutes: true } },
  assessment: { select: { id: true, title: true, kind: true } },
  targets: { select: TARGET_SELECT },
  _count: { select: { attempts: true } },
} satisfies Prisma.AssignmentSelect;

const MONITOR_ATTEMPT_SELECT = {
  id: true,
  studentId: true,
  state: true,
  attemptNumber: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  isLate: true,
  scorePercent: true,
  pointsAwarded: true,
  timeSpentSeconds: true,
  excusedAt: true,
  excusedReason: true,
  teacherFeedback: true,
  feedbackAt: true,
} satisfies Prisma.AssignmentAttemptSelect;

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * A learner's list is narrowed to published, currently-available work set for them
 * — never to a `mine` flag they could simply omit. For staff, `mine` means "work I
 * set", which is the only reading of ownership that applies to a teacher.
 */
export async function listAssignments(
  context: ActorContext,
  schoolId: string,
  query: AssignmentListQuery,
) {
  const where: Prisma.AssignmentWhereInput = { schoolId };

  if (!query.includeArchived) where.archivedAt = null;
  if (query.classId) where.classId = query.classId;
  if (query.subjectId) where.subjectId = query.subjectId;
  if (query.termId) where.termId = query.termId;
  if (query.createdById) where.createdById = query.createdById;
  if (query.kind) where.kind = query.kind;
  if (query.topicId) where.topicId = query.topicId;
  if (query.publishedOnly) where.isPublished = true;
  if (query.search) where.title = { contains: query.search };
  if (query.dueAfter || query.dueBefore) {
    where.dueAt = {
      ...(query.dueAfter ? { gte: query.dueAfter } : {}),
      ...(query.dueBefore ? { lte: query.dueBefore } : {}),
    };
  }

  const learner = isStudent(context.actor);
  if (learner) {
    Object.assign(where, await learnerTargetFilter(schoolId, context.actor.userId));
    where.isPublished = true;
    where.archivedAt = null;
    where.availableFrom = { lte: new Date() };
  } else if (query.mine) {
    where.createdById = context.actor.userId;
  }

  const [rows, totalItems] = await Promise.all([
    prisma.assignment.findMany({
      where,
      select: ASSIGNMENT_SELECT,
      // MySQL sorts NULL first on ASC, so undated work heads the list. That is the
      // right answer for a learner ("anytime practice" first, then deadlines) and
      // harmless for staff, who filter by date when they care.
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.assignment.count({ where }),
  ]);

  if (!learner) return { items: rows, totalItems };

  // One call is enough for a learner's dashboard: the work and their own state.
  const attempts = await prisma.assignmentAttempt.findMany({
    where: { studentId: context.actor.userId, assignmentId: { in: rows.map((row) => row.id) } },
    select: { ...MONITOR_ATTEMPT_SELECT, assignmentId: true },
    orderBy: { attemptNumber: 'desc' },
  });
  const mine = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    if (!mine.has(attempt.assignmentId)) mine.set(attempt.assignmentId, attempt);
  }

  return {
    items: rows.map((row) => ({ ...row, myAttempt: mine.get(row.id) ?? null })),
    totalItems,
  };
}

export async function getAssignment(context: ActorContext, schoolId: string, id: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id, schoolId },
    select: ASSIGNMENT_SELECT,
  });
  if (!assignment) throw notFound('Assignment');

  if (isStudent(context.actor)) {
    // A draft or future-dated assignment does not exist as far as a learner is concerned.
    if (!assignment.isPublished || assignment.archivedAt || assignment.availableFrom > new Date()) {
      throw notFound('Assignment');
    }
    await assertTargeted(schoolId, id, context.actor.userId);
  }

  return assignment;
}

// ── Writing the definition ──────────────────────────────────────────────────

/** Confirms every piece of work referenced belongs to this school. */
async function assertWorkExists(
  schoolId: string,
  input: { topicId?: string; lessonId?: string; activityId?: string; assessmentId?: string },
): Promise<void> {
  if (input.topicId) {
    const found = await prisma.topic.count({ where: { id: input.topicId, schoolId } });
    if (found === 0) throw badRequest('That topic does not exist in this school.');
  }
  if (input.lessonId) {
    const found = await prisma.lesson.count({ where: { id: input.lessonId, schoolId } });
    if (found === 0) throw badRequest('That lesson does not exist in this school.');
  }
  if (input.activityId) {
    const found = await prisma.activity.count({ where: { id: input.activityId, schoolId } });
    if (found === 0) throw badRequest('That activity does not exist in this school.');
  }
  if (input.assessmentId) {
    const found = await prisma.assessment.count({ where: { id: input.assessmentId, schoolId } });
    if (found === 0) throw badRequest('That assessment does not exist in this school.');
  }
}

async function requireAssignment(schoolId: string, id: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id, schoolId },
    select: ASSIGNMENT_SELECT,
  });
  if (!assignment) throw notFound('Assignment');
  return assignment;
}

export async function createAssignment(
  context: ActorContext,
  schoolId: string,
  input: CreateAssignmentInput,
) {
  await assertWorkExists(schoolId, input);
  if (input.classId) await assertCanAccessClass(context.actor, context.tenant, input.classId);
  await assertTargetsExist(schoolId, input.targets);

  const assignment = await prisma.assignment.create({
    data: {
      schoolId,
      createdById: context.actor.userId,
      kind: input.kind,
      title: input.title,
      instructions: input.instructions ?? null,
      classId: input.classId ?? null,
      subjectId: input.subjectId ?? null,
      termId: input.termId ?? null,
      topicId: input.topicId ?? null,
      lessonId: input.lessonId ?? null,
      activityId: input.activityId ?? null,
      assessmentId: input.assessmentId ?? null,
      availableFrom: input.availableFrom ?? new Date(),
      dueAt: input.dueAt ?? null,
      lateBehavior: input.lateBehavior,
      graceHours: input.graceHours,
      allowResubmission: input.allowResubmission,
      maxAttempts: input.maxAttempts ?? null,
      pointsValue: input.pointsValue,
      estimatedMinutes: input.estimatedMinutes ?? null,
      notifyOnAssign: input.notifyOnAssign,
      notifyOnDueSoon: input.notifyOnDueSoon,
      notifyOnOverdue: input.notifyOnOverdue,
      isPublished: false,
      targets: {
        create: input.targets.map((target) => ({
          targetType: target.targetType,
          targetId: target.targetId,
          targetLabel: target.targetLabel ?? null,
        })),
      },
    },
    select: ASSIGNMENT_SELECT,
  });

  recordAudit(context, {
    action: 'assignment.create',
    targetType: 'Assignment',
    targetId: assignment.id,
    summary: `Set "${assignment.title}"`,
    afterData: {
      kind: assignment.kind,
      dueAt: assignment.dueAt,
      targets: assignment.targets.map((t) => `${t.targetType}:${t.targetId}`),
    },
  });

  const publication = input.publish
    ? await publishAssignment(context, schoolId, assignment.id, {
        materializeAttempts: true,
        notify: input.notifyOnAssign,
      })
    : null;

  return { assignment: publication?.assignment ?? assignment, publication };
}

export async function updateAssignment(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateAssignmentInput,
) {
  const existing = await requireAssignment(schoolId, id);
  if (existing.archivedAt) throw conflict('That assignment has been archived.');
  if (input.classId) await assertCanAccessClass(context.actor, context.tenant, input.classId);

  const dueAt = input.dueAt ?? existing.dueAt;
  const availableFrom = input.availableFrom ?? existing.availableFrom;
  if (dueAt && dueAt <= availableFrom) {
    throw badRequest('The due date has to be after the assignment becomes available.');
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.classId !== undefined ? { classId: input.classId } : {}),
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
      ...(input.termId !== undefined ? { termId: input.termId } : {}),
      ...(input.availableFrom !== undefined ? { availableFrom: input.availableFrom } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.lateBehavior !== undefined ? { lateBehavior: input.lateBehavior } : {}),
      ...(input.graceHours !== undefined ? { graceHours: input.graceHours } : {}),
      ...(input.allowResubmission !== undefined
        ? { allowResubmission: input.allowResubmission }
        : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.pointsValue !== undefined ? { pointsValue: input.pointsValue } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
      ...(input.notifyOnAssign !== undefined ? { notifyOnAssign: input.notifyOnAssign } : {}),
      ...(input.notifyOnDueSoon !== undefined ? { notifyOnDueSoon: input.notifyOnDueSoon } : {}),
      ...(input.notifyOnOverdue !== undefined ? { notifyOnOverdue: input.notifyOnOverdue } : {}),
    },
    select: ASSIGNMENT_SELECT,
  });

  recordAudit(context, {
    action: 'assignment.update',
    targetType: 'Assignment',
    targetId: id,
    summary: `Updated "${updated.title}"`,
    beforeData: { dueAt: existing.dueAt, lateBehavior: existing.lateBehavior },
    afterData: { dueAt: updated.dueAt, lateBehavior: updated.lateBehavior },
  });

  return updated;
}

// ── Targets ─────────────────────────────────────────────────────────────────

/**
 * Replaces or extends the target list. Existing attempt rows are never deleted when
 * a target is removed: the work was genuinely set, and erasing the record would
 * lose a learner's submission. They simply stop appearing on the board.
 */
export async function setTargets(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: SetTargetsInput,
) {
  const existing = await requireAssignment(schoolId, id);
  if (existing.archivedAt) throw conflict('That assignment has been archived.');
  await assertTargetsExist(schoolId, input.targets);

  await prisma.$transaction(async (tx) => {
    if (input.replace) {
      await tx.assignmentTarget.deleteMany({ where: { assignmentId: id } });
    }
    for (const target of input.targets) {
      await tx.assignmentTarget.upsert({
        where: {
          assignmentId_targetType_targetId: {
            assignmentId: id,
            targetType: target.targetType,
            targetId: target.targetId,
          },
        },
        create: {
          assignmentId: id,
          targetType: target.targetType,
          targetId: target.targetId,
          targetLabel: target.targetLabel ?? null,
        },
        update: { targetLabel: target.targetLabel ?? null },
      });
    }
  });

  recordAudit(context, {
    action: 'assignment.update',
    targetType: 'Assignment',
    targetId: id,
    summary: input.replace ? 'Replaced the target list' : 'Added targets',
    beforeData: { targets: existing.targets.map((t) => `${t.targetType}:${t.targetId}`) },
    afterData: { targets: input.targets.map((t) => `${t.targetType}:${t.targetId}`) },
  });

  return requireAssignment(schoolId, id);
}

// ── Publication ─────────────────────────────────────────────────────────────

export interface PublishResult {
  assignment: Awaited<ReturnType<typeof requireAssignment>>;
  recipients: number;
  attemptsCreated: number;
  notified: number;
}

/**
 * Makes the assignment real. Publishing is deliberately one-way: a teacher archives
 * rather than un-publishes, because a learner who has already started work should
 * not have it vanish.
 */
export async function publishAssignment(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: PublishAssignmentInput,
): Promise<PublishResult> {
  const existing = await requireAssignment(schoolId, id);
  if (existing.archivedAt) throw conflict('That assignment has been archived.');
  if (existing.targets.length === 0) {
    throw badRequest('Add at least one target before publishing.');
  }

  const students = await resolveTargetStudents(schoolId, existing.targets);
  if (students.length === 0) {
    throw badRequest(
      'None of the targets currently contain an active learner, so nobody would receive this.',
    );
  }

  const assignment = existing.isPublished
    ? existing
    : await prisma.assignment.update({
        where: { id },
        data: { isPublished: true, publishedAt: new Date() },
        select: ASSIGNMENT_SELECT,
      });

  const attemptsCreated = input.materializeAttempts
    ? await createMissingAttempts(schoolId, id, students, AssignmentState.NOT_STARTED)
    : 0;

  let notified = 0;
  if (input.notify && assignment.notifyOnAssign && assignment.availableFrom <= new Date()) {
    notified = await notifyUsers(students, newWorkNotification(assignment));
  }

  recordAudit(context, {
    action: 'assignment.publish',
    targetType: 'Assignment',
    targetId: id,
    summary: `Published "${assignment.title}" to ${students.length} learner(s)`,
    afterData: { recipients: students.length, attemptsCreated, notified },
  });

  return { assignment, recipients: students.length, attemptsCreated, notified };
}

function dueLabel(dueAt: Date | null): string {
  if (!dueAt) return 'There is no deadline.';
  return `Due ${dueAt.toISOString().slice(0, 10)}.`;
}

function newWorkNotification(assignment: { id: string; schoolId: string; title: string; dueAt: Date | null }) {
  return {
    schoolId: assignment.schoolId,
    category: NotificationCategory.ASSIGNMENT_NEW,
    priority: NotificationPriority.NORMAL,
    title: 'New work set',
    body: `${assignment.title}. ${dueLabel(assignment.dueAt)}`,
    actionPath: `/assignments/${assignment.id}`,
    actionLabel: 'Open it',
    sourceType: 'Assignment',
    sourceId: assignment.id,
    groupKey: `assignment.new:${assignment.id}`,
  };
}

/** Re-runs the fan-out after the roster changed, without re-notifying anyone. */
export async function syncAttempts(context: ActorContext, schoolId: string, id: string) {
  const assignment = await requireAssignment(schoolId, id);
  if (!assignment.isPublished) throw conflict('Publish the assignment first.');

  const students = await resolveTargetStudents(schoolId, assignment.targets);
  const attemptsCreated = await createMissingAttempts(
    schoolId,
    id,
    students,
    AssignmentState.NOT_STARTED,
  );

  return { recipients: students.length, attemptsCreated };
}

export async function archiveAssignment(context: ActorContext, schoolId: string, id: string) {
  const existing = await requireAssignment(schoolId, id);
  if (existing.archivedAt) return existing;

  const archived = await prisma.assignment.update({
    where: { id },
    data: { archivedAt: new Date() },
    select: ASSIGNMENT_SELECT,
  });

  recordAudit(context, {
    action: 'assignment.delete',
    targetType: 'Assignment',
    targetId: id,
    summary: `Archived "${archived.title}"`,
  });

  return archived;
}

// ── Monitoring board ────────────────────────────────────────────────────────

/**
 * Blueprint 04's monitoring view: one row per targeted learner, with their latest
 * attempt if there is one. A learner with no attempt row reads as NOT_STARTED
 * rather than being left out, because "nobody has opened it" is the answer a
 * teacher most needs.
 */
export async function getMonitorBoard(
  context: ActorContext,
  schoolId: string,
  id: string,
  query: MonitorQuery,
) {
  const assignment = await requireAssignment(schoolId, id);
  const targeted = await resolveTargetStudents(schoolId, assignment.targets);

  const allowed = await accessibleStudentIds(context.actor, context.tenant);
  let visible = allowed === null ? targeted : targeted.filter((sid) => allowed.includes(sid));
  if (query.classId) {
    const inClass = new Set(await classStudentIds(query.classId));
    visible = visible.filter((sid) => inClass.has(sid));
  }

  const [students, attempts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: visible } },
      select: { id: true, firstName: true, lastName: true, displayName: true, avatarMediaId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.assignmentAttempt.findMany({
      where: { assignmentId: id, studentId: { in: visible } },
      select: MONITOR_ATTEMPT_SELECT,
      orderBy: { attemptNumber: 'desc' },
    }),
  ]);

  const latest = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    if (!latest.has(attempt.studentId)) latest.set(attempt.studentId, attempt);
  }

  const rows = students
    .map((student) => {
      const attempt = latest.get(student.id) ?? null;
      return { student, attempt, state: attempt?.state ?? AssignmentState.NOT_STARTED };
    })
    .filter((row) => query.includeExcused || row.state !== AssignmentState.EXCUSED);

  const totals: Record<AssignmentState, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    SUBMITTED: 0,
    COMPLETED: 0,
    OVERDUE: 0,
    EXCUSED: 0,
  };
  let scoreSum = 0;
  let scoreCount = 0;
  let lateCount = 0;
  let awaitingFeedback = 0;

  for (const row of rows) {
    totals[row.state] += 1;
    if (row.attempt?.scorePercent !== null && row.attempt?.scorePercent !== undefined) {
      scoreSum += row.attempt.scorePercent;
      scoreCount += 1;
    }
    if (row.attempt?.isLate) lateCount += 1;
    if (row.attempt && row.attempt.submittedAt && !row.attempt.feedbackAt) awaitingFeedback += 1;
  }

  return {
    assignment,
    totals,
    summary: {
      targeted: rows.length,
      averageScorePercent: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      lateCount,
      awaitingFeedback,
    },
    rows,
  };
}
