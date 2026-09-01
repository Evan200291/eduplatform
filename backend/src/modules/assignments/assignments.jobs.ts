// ─────────────────────────────────────────────────────────────────────────────
// Assignments: the scheduled sweep
// Job key `assignments.overdue`, every 15 minutes (see src/jobs/index.ts). It does
// two related things in one pass because both need the same question answered —
// "who still has this outstanding?":
//
//   • flips outstanding attempts to OVERDUE once the deadline, plus grace where the
//     assignment allows it, has passed
//   • sends one due-soon reminder per learner per assignment, a day ahead
//
// Kept out of assignments.service.ts so neither file grows past the point where it
// is comfortable to read in one sitting.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AssignmentTargetType} from '@prisma/client';
import {
  AssignmentState,
  LateBehavior,
  NotificationCategory,
  NotificationPriority,
} from '@prisma/client';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { notifyUsers } from '../notifications/notifications.service';
import {
  OUTSTANDING,
  createMissingAttempts,
  resolveTargetStudents,
} from './assignments.targets';

const log = logger.child({ module: 'assignments.jobs' });

const LOOKBACK_DAYS = 30;
const DUE_SOON_WINDOW_HOURS = 24;
const JOB_BATCH = 200;
const HOUR_MS = 3_600_000;

interface OverdueCandidate {
  id: string;
  schoolId: string;
  title: string;
  dueAt: Date;
  graceHours: number;
  lateBehavior: LateBehavior;
  notifyOnOverdue: boolean;
  targets: { targetType: AssignmentTargetType; targetId: string }[];
}

/** The moment after which an unsubmitted attempt is genuinely overdue. */
function overdueFrom(candidate: Pick<OverdueCandidate, 'dueAt' | 'graceHours' | 'lateBehavior'>): Date {
  const grace =
    candidate.lateBehavior === LateBehavior.ALLOW_UNTIL_GRACE_END
      ? candidate.graceHours * HOUR_MS
      : 0;
  return new Date(candidate.dueAt.getTime() + grace);
}

/**
 * Recipients who have not already had this notification about this assignment.
 * The dispatch job moves a row out of PENDING within minutes, so `groupKey`
 * collapsing alone would not stop a 15-minute sweep from nagging repeatedly.
 */
async function withoutPriorNotice(
  userIds: readonly string[],
  category: NotificationCategory,
  assignmentId: string,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const sent = await prisma.notification.findMany({
    where: {
      userId: { in: [...userIds] },
      category,
      sourceType: 'Assignment',
      sourceId: assignmentId,
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const already = new Set(sent.map((row) => row.userId));
  return userIds.filter((userId) => !already.has(userId));
}

/**
 * Flips outstanding attempts to OVERDUE once the deadline (plus grace, where the
 * assignment allows it) has passed, and reminds learners whose deadline is close.
 *
 * Returns the number of rows it changed plus the reminders it queued, so the job
 * log shows real work rather than a bare "ran".
 */
export async function expireOverdueAssignments(): Promise<number> {
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR_MS);
  let touched = 0;

  const candidates = await prisma.assignment.findMany({
    where: { isPublished: true, archivedAt: null, dueAt: { gte: since, lte: now } },
    select: {
      id: true,
      schoolId: true,
      title: true,
      dueAt: true,
      graceHours: true,
      lateBehavior: true,
      notifyOnOverdue: true,
      targets: { select: { targetType: true, targetId: true } },
    },
    orderBy: { dueAt: 'desc' },
    take: JOB_BATCH,
  });

  for (const row of candidates) {
    if (!row.dueAt) continue;
    const candidate: OverdueCandidate = { ...row, dueAt: row.dueAt };
    if (overdueFrom(candidate) > now) continue;
    try {
      touched += await markOverdue(candidate);
    } catch (error) {
      log.error({ err: error, assignmentId: candidate.id }, 'overdue sweep failed');
    }
  }

  try {
    touched += await sendDueSoonReminders(now);
  } catch (error) {
    log.error({ err: error }, 'due-soon reminders failed');
  }

  return touched;
}

async function markOverdue(candidate: OverdueCandidate): Promise<number> {
  const students = await resolveTargetStudents(candidate.schoolId, candidate.targets);

  // A learner who never opened the work still belongs in the record, so a missing
  // row is created as OVERDUE rather than left absent.
  const created = await createMissingAttempts(
    candidate.schoolId,
    candidate.id,
    students,
    AssignmentState.OVERDUE,
  );

  const outstanding = await prisma.assignmentAttempt.findMany({
    where: { assignmentId: candidate.id, state: { in: OUTSTANDING }, excusedAt: null },
    select: { id: true },
  });
  if (outstanding.length > 0) {
    await prisma.assignmentAttempt.updateMany({
      where: { id: { in: outstanding.map((row) => row.id) } },
      data: { state: AssignmentState.OVERDUE },
    });
  }

  const changed = created + outstanding.length;
  if (changed === 0) return 0;

  if (candidate.notifyOnOverdue) {
    const overdueRows = await prisma.assignmentAttempt.findMany({
      where: { assignmentId: candidate.id, state: AssignmentState.OVERDUE },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const recipients = await withoutPriorNotice(
      overdueRows.map((row) => row.studentId),
      NotificationCategory.ASSIGNMENT_OVERDUE,
      candidate.id,
    );
    await notifyUsers(recipients, {
      schoolId: candidate.schoolId,
      category: NotificationCategory.ASSIGNMENT_OVERDUE,
      priority: NotificationPriority.HIGH,
      title: 'Work is overdue',
      body: `${candidate.title} was due ${candidate.dueAt.toISOString().slice(0, 10)}.`,
      actionPath: `/assignments/${candidate.id}`,
      actionLabel: 'Catch up',
      sourceType: 'Assignment',
      sourceId: candidate.id,
      groupKey: `assignment.overdue:${candidate.id}`,
    });
  }

  return changed;
}

/** One reminder per learner per assignment, a day before the deadline. */
async function sendDueSoonReminders(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + DUE_SOON_WINDOW_HOURS * HOUR_MS);

  const soon = await prisma.assignment.findMany({
    where: {
      isPublished: true,
      archivedAt: null,
      notifyOnDueSoon: true,
      availableFrom: { lte: now },
      dueAt: { gt: now, lte: horizon },
    },
    select: {
      id: true,
      schoolId: true,
      title: true,
      dueAt: true,
      targets: { select: { targetType: true, targetId: true } },
    },
    take: JOB_BATCH,
  });

  let queued = 0;

  for (const assignment of soon) {
    // Publication may have been asked not to materialize rows. Do it now, otherwise
    // a learner who has not opened the work would never be reminded of it.
    const existing = await prisma.assignmentAttempt.count({ where: { assignmentId: assignment.id } });
    if (existing === 0) {
      const students = await resolveTargetStudents(assignment.schoolId, assignment.targets);
      await createMissingAttempts(
        assignment.schoolId,
        assignment.id,
        students,
        AssignmentState.NOT_STARTED,
      );
    }

    const outstanding = await prisma.assignmentAttempt.findMany({
      where: { assignmentId: assignment.id, state: { in: OUTSTANDING }, excusedAt: null },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const recipients = await withoutPriorNotice(
      outstanding.map((row) => row.studentId),
      NotificationCategory.ASSIGNMENT_DUE_SOON,
      assignment.id,
    );
    if (recipients.length === 0) continue;

    queued += await notifyUsers(recipients, {
      schoolId: assignment.schoolId,
      category: NotificationCategory.ASSIGNMENT_DUE_SOON,
      priority: NotificationPriority.NORMAL,
      title: 'Due soon',
      body: `${assignment.title} is due tomorrow.`,
      actionPath: `/assignments/${assignment.id}`,
      actionLabel: 'Finish it',
      sourceType: 'Assignment',
      sourceId: assignment.id,
      groupKey: `assignment.dueSoon:${assignment.id}`,
    });
  }

  return queued;
}


