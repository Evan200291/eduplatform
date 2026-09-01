// ─────────────────────────────────────────────────────────────────────────────
// Assignment attempts: the learner's side, and the teacher's response
// Blueprint 04: a teacher monitors started / completed / overdue / excused, gives
// feedback, and may excuse a learner with a reason that is recorded against them.
//
// Three rules are enforced here and nowhere else:
//
//   1. Lateness comes from the assignment's `lateBehavior`, evaluated at submission
//      time. Two learners submitting in the same minute are treated identically.
//   2. A learner acts only on their own work. A member of staff may act on a named
//      learner's behalf ("sitting with them"), which is recorded as their action.
//   3. An excusal is never a deletion. The attempt row stays, carrying who excused
//      it, when, and why.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  AssignmentState,
  LateBehavior,
  NotificationCategory,
  NotificationPriority,
  PointsReason
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { isStudent } from '../../core/rbac/authorize';
import { accessibleStudentIds, assertCanViewStudent } from '../../core/rbac/scope.service';
import { enqueueNotification } from '../notifications/notifications.service';
import {
  recordLearningEvent,
  settleLearningPoints,
} from '../gamification/gamification.service';
import { OUTSTANDING, assertTargeted } from './assignments.targets';
import type {
  AttemptListQuery,
  ExcuseInput,
  FeedbackInput,
  SubmitAssignmentInput,
} from './assignments.validation';

const HOUR_MS = 3_600_000;

const ATTEMPT_SELECT = {
  id: true,
  assignmentId: true,
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
  assessmentAttemptId: true,
  excusedById: true,
  excusedAt: true,
  excusedReason: true,
  teacherFeedback: true,
  feedbackById: true,
  feedbackAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  assignment: {
    select: {
      id: true,
      title: true,
      kind: true,
      dueAt: true,
      pointsValue: true,
      lateBehavior: true,
      graceHours: true,
      allowResubmission: true,
      maxAttempts: true,
      subjectId: true,
      topicId: true,
      lessonId: true,
      activityId: true,
      assessmentId: true,
    },
  },
} satisfies Prisma.AssignmentAttemptSelect;

/** The assignment fields the late rules and resubmission rules need. */
const WORK_SELECT = {
  id: true,
  schoolId: true,
  title: true,
  createdById: true,
  isPublished: true,
  archivedAt: true,
  availableFrom: true,
  dueAt: true,
  lateBehavior: true,
  graceHours: true,
  allowResubmission: true,
  maxAttempts: true,
  pointsValue: true,
} satisfies Prisma.AssignmentSelect;

type Work = Prisma.AssignmentGetPayload<{ select: typeof WORK_SELECT }>;

interface Lateness {
  /** True when the deadline rules refuse the submission outright. */
  blocked: boolean;
  /** True when it is accepted but recorded as late. */
  isLate: boolean;
}

/**
 * Blueprint 04's late-behaviour rules, in one place. `ALLOW_LATE_SILENT` exists for
 * younger learners, where flagging lateness would discourage more than it teaches.
 */
export function evaluateLateness(work: Work, at: Date): Lateness {
  if (!work.dueAt || at <= work.dueAt) return { blocked: false, isLate: false };

  switch (work.lateBehavior) {
    case LateBehavior.BLOCK_AFTER_DUE:
      return { blocked: true, isLate: true };
    case LateBehavior.ALLOW_LATE_SILENT:
      return { blocked: false, isLate: false };
    case LateBehavior.ALLOW_UNTIL_GRACE_END: {
      const graceEnd = new Date(work.dueAt.getTime() + work.graceHours * HOUR_MS);
      return { blocked: at > graceEnd, isLate: true };
    }
    case LateBehavior.ALLOW_LATE_FLAGGED:
    default:
      return { blocked: false, isLate: true };
  }
}

async function requireWork(schoolId: string, assignmentId: string): Promise<Work> {
  const work = await prisma.assignment.findFirst({
    where: { id: assignmentId, schoolId },
    select: WORK_SELECT,
  });
  if (!work) throw notFound('Assignment');
  return work;
}

/**
 * Decides whose work is being acted on, and proves the actor may act on it.
 *
 * A learner is always themselves — passing someone else's id is refused rather than
 * silently ignored, because the attempt would otherwise be written for the wrong
 * person. Staff must name the learner, and must be allowed to see them.
 */
async function resolveSubject(
  context: ActorContext,
  schoolId: string,
  assignmentId: string,
  requested: string | undefined,
): Promise<string> {
  let studentId: string;

  if (isStudent(context.actor)) {
    if (requested && requested !== context.actor.userId) {
      throw forbidden('You can only work on your own assignments.');
    }
    studentId = context.actor.userId;
  } else {
    if (!requested) throw badRequest('Name the learner this applies to.');
    await assertCanViewStudent(context.actor, context.tenant, requested);
    studentId = requested;
  }

  await assertTargeted(schoolId, assignmentId, studentId);
  return studentId;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listAttempts(
  context: ActorContext,
  schoolId: string,
  query: AttemptListQuery,
) {
  const where: Prisma.AssignmentAttemptWhereInput = { schoolId };

  const allowed = await accessibleStudentIds(context.actor, context.tenant);
  if (allowed !== null) {
    // A learner the actor may not read narrows the result to nothing rather than
    // raising, so the endpoint cannot be used to discover that an id exists.
    where.studentId = query.studentId
      ? allowed.includes(query.studentId)
        ? query.studentId
        : { in: [] }
      : { in: allowed };
  } else if (query.studentId) {
    where.studentId = query.studentId;
  }

  if (query.assignmentId) where.assignmentId = query.assignmentId;
  if (query.state) where.state = query.state;
  if (query.lateOnly) where.isLate = true;
  if (query.excusedOnly) where.excusedAt = { not: null };
  if (query.needsFeedback) {
    where.submittedAt = { not: null };
    where.feedbackAt = null;
  }
  if (query.classId) {
    where.student = { classMemberships: { some: { classId: query.classId, isActive: true } } };
  }
  if (query.search) where.assignment = { title: { contains: query.search } };

  const [items, totalItems] = await Promise.all([
    prisma.assignmentAttempt.findMany({
      where,
      select: ATTEMPT_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
      ...toSkipTake(query),
    }),
    prisma.assignmentAttempt.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getAttempt(context: ActorContext, schoolId: string, id: string) {
  const attempt = await prisma.assignmentAttempt.findFirst({
    where: { id, schoolId },
    select: ATTEMPT_SELECT,
  });
  if (!attempt) throw notFound('Assignment attempt');
  await assertCanViewStudent(context.actor, context.tenant, attempt.studentId);
  return attempt;
}

// ── The learner working ─────────────────────────────────────────────────────

async function latestAttempt(assignmentId: string, studentId: string) {
  return prisma.assignmentAttempt.findFirst({
    where: { assignmentId, studentId },
    select: ATTEMPT_SELECT,
    orderBy: { attemptNumber: 'desc' },
  });
}

function assertOpenForWork(work: Work, at: Date): void {
  if (!work.isPublished || work.archivedAt) throw notFound('Assignment');
  if (work.availableFrom > at) {
    throw conflict('That assignment has not opened yet.');
  }
}

/**
 * Opens the work. Idempotent for a learner who taps twice, and the place a second
 * attempt is created when the assignment allows resubmission.
 */
export async function startAssignment(
  context: ActorContext,
  schoolId: string,
  assignmentId: string,
  requestedStudentId?: string,
) {
  const now = new Date();
  const work = await requireWork(schoolId, assignmentId);
  assertOpenForWork(work, now);
  const studentId = await resolveSubject(context, schoolId, assignmentId, requestedStudentId);

  const existing = await latestAttempt(assignmentId, studentId);

  if (!existing) {
    return prisma.assignmentAttempt.create({
      data: {
        schoolId,
        assignmentId,
        studentId,
        attemptNumber: 1,
        state: AssignmentState.IN_PROGRESS,
        startedAt: now,
      },
      select: ATTEMPT_SELECT,
    });
  }

  if (existing.state === AssignmentState.EXCUSED) {
    throw conflict('That assignment has been excused for this learner.');
  }

  if (existing.state === AssignmentState.IN_PROGRESS) return existing;

  // NOT_STARTED and OVERDUE both mean "not handed in": open it, subject to the
  // deadline rules. Lateness itself is settled at submission, not here.
  if (existing.state === AssignmentState.NOT_STARTED || existing.state === AssignmentState.OVERDUE) {
    if (evaluateLateness(work, now).blocked) {
      throw conflict('The deadline for that assignment has passed.');
    }
    return prisma.assignmentAttempt.update({
      where: { id: existing.id },
      data: { state: AssignmentState.IN_PROGRESS, startedAt: existing.startedAt ?? now },
      select: ATTEMPT_SELECT,
    });
  }

  // SUBMITTED or COMPLETED: a further go is a new attempt, so the earlier one stays
  // intact as evidence of what the learner could do at the time.
  if (!work.allowResubmission) {
    throw conflict('That assignment has already been handed in and does not allow another go.');
  }
  if (work.maxAttempts && existing.attemptNumber >= work.maxAttempts) {
    throw conflict(`That assignment allows ${work.maxAttempts} attempt(s).`);
  }
  if (evaluateLateness(work, now).blocked) {
    throw conflict('The deadline for that assignment has passed.');
  }

  return prisma.assignmentAttempt.create({
    data: {
      schoolId,
      assignmentId,
      studentId,
      attemptNumber: existing.attemptNumber + 1,
      state: AssignmentState.IN_PROGRESS,
      startedAt: now,
    },
    select: ATTEMPT_SELECT,
  });
}

/**
 * Hands the work in.
 *
 * A submission that carries a score is COMPLETED — the work marked itself. One
 * without a score is SUBMITTED and waits for a teacher, which is what keeps
 * blueprint 04's "the teacher decides" true for written work.
 */
export async function submitAssignment(
  context: ActorContext,
  schoolId: string,
  assignmentId: string,
  input: SubmitAssignmentInput,
) {
  const now = new Date();
  const work = await requireWork(schoolId, assignmentId);
  assertOpenForWork(work, now);
  const studentId = await resolveSubject(context, schoolId, assignmentId, input.studentId);

  // A learner may finish an activity in one go without the client having called
  // `start` first; being strict here would lose the work, so the row is opened now.
  const current =
    (await latestAttempt(assignmentId, studentId)) ??
    (await prisma.assignmentAttempt.create({
      data: {
        schoolId,
        assignmentId,
        studentId,
        attemptNumber: 1,
        state: AssignmentState.IN_PROGRESS,
        startedAt: now,
      },
      select: ATTEMPT_SELECT,
    }));

  if (current.state === AssignmentState.EXCUSED) {
    throw conflict('That assignment has been excused for this learner.');
  }
  if (
    current.state === AssignmentState.SUBMITTED ||
    current.state === AssignmentState.COMPLETED
  ) {
    throw conflict('That attempt has already been handed in. Start another attempt first.');
  }

  const lateness = evaluateLateness(work, now);
  if (lateness.blocked) throw conflict('The deadline for that assignment has passed.');

  const scored = input.scorePercent !== undefined;
  const pointsAwarded = work.pointsValue > 0
    ? scored
      ? Math.round((work.pointsValue * (input.scorePercent as number)) / 100)
      : work.pointsValue
    : 0;

  const submitted = await prisma.assignmentAttempt.update({
    where: { id: current.id },
    data: {
      state: scored ? AssignmentState.COMPLETED : AssignmentState.SUBMITTED,
      submittedAt: now,
      completedAt: scored ? now : null,
      startedAt: current.startedAt ?? now,
      isLate: lateness.isLate,
      ...(scored ? { scorePercent: input.scorePercent } : {}),
      pointsAwarded,
      timeSpentSeconds: current.timeSpentSeconds + input.timeSpentSeconds,
      ...(input.assessmentAttemptId ? { assessmentAttemptId: input.assessmentAttemptId } : {}),
    },
    select: ATTEMPT_SELECT,
  });

  // The teacher is told only about work that needs them: a self-marking activity
  // settles itself, so notifying on every completion would be noise.
  if (!scored) {
    await enqueueNotification({
      schoolId,
      userId: work.createdById,
      category: NotificationCategory.ADMINISTRATIVE,
      priority: NotificationPriority.LOW,
      title: 'Work handed in',
      body: `${submitted.student.displayName} handed in ${work.title}.`,
      actionPath: `/assignments/${assignmentId}/monitor`,
      actionLabel: 'Review it',
      sourceType: 'Assignment',
      sourceId: assignmentId,
      // Collapses a class handing in together into one badge for the teacher.
      groupKey: `assignment.submitted:${assignmentId}`,
    });
  }

  /**
   * Recognition, through the ledger. Two things are deliberate here:
   *
   *   • Points are credited only when the mark is known. Self-marking work settles
   *     now; work waiting for a teacher credits on feedback, so a learner is not
   *     paid for an answer that turns out to be wrong.
   *   • Handing in still counts towards the daily habit either way, because the
   *     learner did the work regardless of who marks it. `points: 0` writes no
   *     ledger entry, so the streak is recorded without a meaningless row.
   */
  const gamification = await recordLearningEvent({
    schoolId,
    studentId,
    reason: PointsReason.ASSIGNMENT_COMPLETION,
    points: scored ? pointsAwarded : 0,
    sourceType: 'AssignmentAttempt',
    sourceId: submitted.id,
    note: `Assignment: ${work.title}`,
    occurredAt: now,
    onTime: !lateness.isLate,
  });

  return { ...submitted, gamification };
}

// ── The teacher responding ──────────────────────────────────────────────────

/** Written feedback, an optional mark, and the decision to close the work off. */
export async function giveFeedback(
  context: ActorContext,
  schoolId: string,
  attemptId: string,
  input: FeedbackInput,
) {
  const attempt = await prisma.assignmentAttempt.findFirst({
    where: { id: attemptId, schoolId },
    select: ATTEMPT_SELECT,
  });
  if (!attempt) throw notFound('Assignment attempt');
  await assertCanViewStudent(context.actor, context.tenant, attempt.studentId);
  if (attempt.state === AssignmentState.EXCUSED) {
    throw conflict('That assignment was excused, so there is nothing to mark.');
  }

  const now = new Date();

  /**
   * A mark and the points it is worth have to agree, or the ledger contradicts the
   * report card. When the teacher gives a score but names no figure, the points
   * follow from the score against what the work was advertised as worth. An explicit
   * figure always wins: a teacher overriding the arithmetic is a decision, not a slip.
   */
  const scorePercent = input.scorePercent ?? attempt.scorePercent;
  const worth = attempt.assignment.pointsValue;
  const pointsAwarded =
    input.pointsAwarded ??
    (worth > 0 && scorePercent !== null
      ? Math.round((worth * scorePercent) / 100)
      : attempt.pointsAwarded);

  const updated = await prisma.assignmentAttempt.update({
    where: { id: attemptId },
    data: {
      teacherFeedback: input.feedback,
      feedbackById: context.actor.userId,
      feedbackAt: now,
      ...(input.scorePercent !== undefined ? { scorePercent: input.scorePercent } : {}),
      pointsAwarded,
      ...(input.markComplete
        ? { state: AssignmentState.COMPLETED, completedAt: attempt.completedAt ?? now }
        : {}),
    },
    select: ATTEMPT_SELECT,
  });

  recordAudit(context, {
    action: 'assignment.feedback',
    targetType: 'AssignmentAttempt',
    targetId: attemptId,
    summary: `Gave feedback on "${attempt.assignment.title}"`,
    afterData: { scorePercent: updated.scorePercent, markedComplete: input.markComplete },
  });

  // There is no dedicated feedback category in blueprint 06's list, and inventing
  // one would put a value in the database the schema does not describe. The message
  // is administrative in kind and says plainly what it is about.
  await enqueueNotification({
    schoolId,
    userId: attempt.studentId,
    category: NotificationCategory.ADMINISTRATIVE,
    priority: NotificationPriority.NORMAL,
    title: 'Your teacher replied',
    body: `There is feedback on ${attempt.assignment.title}.`,
    actionPath: `/assignments/${attempt.assignmentId}`,
    actionLabel: 'Read it',
    sourceType: 'AssignmentAttempt',
    sourceId: attemptId,
  });

  /**
   * Settling, not awarding. `settleLearningPoints` compares what this attempt has
   * already been credited with against the figure the mark now implies: unchanged
   * writes nothing at all, a revision reverses the earlier credit and records the
   * new one. A re-mark therefore reads as a correction in the ledger rather than as
   * a second payday. Work still waiting on a decision credits nothing yet — feedback
   * alone is not a mark.
   */
  const settled = input.markComplete === true || updated.scorePercent !== null;
  const gamification = settled
    ? await settleLearningPoints({
        schoolId,
        studentId: updated.studentId,
        reason: PointsReason.ASSIGNMENT_COMPLETION,
        points: updated.pointsAwarded,
        sourceType: 'AssignmentAttempt',
        sourceId: attemptId,
        note: `Assignment: ${attempt.assignment.title}`,
        occurredAt: now,
        onTime: !updated.isLate,
        reversalNote: 'Superseded by a revised mark',
        reversedById: context.actor.userId,
      })
    : null;

  return { ...updated, gamification };
}

/**
 * Excuses named learners, creating the attempt row where none exists so the excusal
 * is recorded rather than implied by absence. Blueprint 04: explicit, reasoned and
 * attributable — the reason is required by the schema, not optional here.
 */
export async function excuseStudents(
  context: ActorContext,
  schoolId: string,
  assignmentId: string,
  input: ExcuseInput,
  excuse = true,
) {
  const work = await requireWork(schoolId, assignmentId);
  const allowed = await accessibleStudentIds(context.actor, context.tenant);
  if (allowed !== null) {
    const outside = input.studentIds.filter((id) => !allowed.includes(id));
    if (outside.length > 0) {
      throw forbidden('One or more of those learners is outside the classes you teach.');
    }
  }

  const now = new Date();
  let changed = 0;

  for (const studentId of input.studentIds) {
    const existing = await prisma.assignmentAttempt.findFirst({
      where: { assignmentId, studentId },
      select: { id: true, state: true, submittedAt: true, scorePercent: true },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!existing) {
      if (!excuse) continue;
      await prisma.assignmentAttempt.create({
        data: {
          schoolId,
          assignmentId,
          studentId,
          attemptNumber: 1,
          state: AssignmentState.EXCUSED,
          excusedById: context.actor.userId,
          excusedAt: now,
          excusedReason: input.reason,
        },
      });
      changed += 1;
      continue;
    }

    await prisma.assignmentAttempt.update({
      where: { id: existing.id },
      data: excuse
        ? {
            state: AssignmentState.EXCUSED,
            excusedById: context.actor.userId,
            excusedAt: now,
            excusedReason: input.reason,
          }
        : {
            // Handing the row back to the ordinary rules: what the learner actually
            // did decides the state, not the fact that it was once excused.
            state: existing.submittedAt
              ? existing.scorePercent !== null
                ? AssignmentState.COMPLETED
                : AssignmentState.SUBMITTED
              : AssignmentState.NOT_STARTED,
            excusedById: null,
            excusedAt: null,
            excusedReason: input.reason,
          },
    });
    changed += 1;
  }

  recordAudit(context, {
    action: 'assignment.excuse',
    targetType: 'Assignment',
    targetId: assignmentId,
    summary: excuse
      ? `Excused ${changed} learner(s) from "${work.title}"`
      : `Removed the excusal for ${changed} learner(s) on "${work.title}"`,
    reason: input.reason,
    afterData: { studentIds: input.studentIds, excused: excuse },
  });

  return { changed, excused: excuse };
}

// ── The learner's own view ──────────────────────────────────────────────────

/**
 * "What have I got to do?" — the figure on the learner's home screen. Counts come
 * from attempt rows, which publication materializes, so a learner sees the work
 * whether or not they have opened anything yet.
 */
export async function getMyWork(context: ActorContext, schoolId: string, studentId?: string) {
  const target = isStudent(context.actor) ? context.actor.userId : studentId;
  if (!target) throw badRequest('Name the learner this applies to.');
  if (!isStudent(context.actor)) {
    await assertCanViewStudent(context.actor, context.tenant, target);
  }

  const base: Prisma.AssignmentAttemptWhereInput = {
    schoolId,
    studentId: target,
    assignment: { isPublished: true, archivedAt: null, availableFrom: { lte: new Date() } },
  };

  const [grouped, upcoming, awaitingFeedback] = await Promise.all([
    prisma.assignmentAttempt.groupBy({
      by: ['state'],
      where: base,
      _count: { _all: true },
    }),
    prisma.assignmentAttempt.findMany({
      where: { ...base, state: { in: OUTSTANDING } },
      select: ATTEMPT_SELECT,
      orderBy: [{ assignment: { dueAt: 'asc' } }],
      take: 10,
    }),
    prisma.assignmentAttempt.count({
      where: { ...base, submittedAt: { not: null }, feedbackAt: null },
    }),
  ]);

  const byState: Record<AssignmentState, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    SUBMITTED: 0,
    COMPLETED: 0,
    OVERDUE: 0,
    EXCUSED: 0,
  };
  for (const row of grouped) byState[row.state] = row._count._all;

  return {
    byState,
    outstanding: byState.NOT_STARTED + byState.IN_PROGRESS + byState.OVERDUE,
    overdue: byState.OVERDUE,
    awaitingFeedback,
    upcoming,
  };
}

