// ─────────────────────────────────────────────────────────────────────────────
// Attention signals — the grouped reads behind every "who needs help" list
// Blueprint 04 asks the teacher dashboard to surface learners who are inactive,
// stuck, overdue or improving. That is the same evidence for the summary card,
// the full attention list and the school-wide overview, so it is gathered once
// here and interpreted by ./dashboard.insights.ts.
//
// Every read is a `groupBy` over the whole learner set — one query per signal,
// not one per learner. A school admin covering 600 learners costs the same eight
// queries as a teacher covering 28.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { AssignmentState, MasteryLevel, UserStatus } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { prisma } from '../../core/prisma';
import {
  accessibleStudentIds,
  assertCanAccessClass,
  classStudentIds,
} from '../../core/rbac/scope.service';
import {
  DUE_SOON_DAYS,
  ENGAGEMENT_LEVELS,
  LOW_ACCURACY_PERCENT,
  REPEATED_ATTEMPT_THRESHOLD,
  engagementReading,
  evaluateStudentSignals,
  headlineSignal,
  needsAttention,
  type EngagementLevel,
  type EngagementReading,
  type StudentSignal,
  type StudentSignalInput,
} from './dashboard.insights';

const DAY_MS = 86_400_000;

/**
 * Upper bound on how many learners one dashboard request will evaluate. A school
 * larger than this is a reporting job, not a dashboard: the reporting module has
 * pagination and exports for that, and an unbounded `IN (...)` here would turn a
 * screen load into a table scan.
 */
export const MAX_SIGNAL_STUDENTS = 2000;

export interface StudentSignalRow {
  studentId: string;
  displayName: string;
  gradeId: string | null;
  signals: StudentSignal[];
  engagement: EngagementReading;
  headline: StudentSignal | null;
  needsAttention: boolean;
  /**
   * Ranking key for the attention list. Only concerns count: three badges in a
   * week is good news, and letting it outrank a learner who has stopped working
   * would put the wrong name at the top of the list.
   */
  priorityScore: number;
}

/**
 * The learner set a staff dashboard covers.
 *
 * A `classId` narrows it, and is checked against the roster first. Without one,
 * the actor's own scope decides: their classes for a teacher, the whole school
 * for an admin. The caller never passes a learner list in.
 */
export async function scopedStudentIds(
  context: ActorContext,
  schoolId: string,
  classId?: string,
): Promise<string[]> {
  if (classId) {
    await assertCanAccessClass(context.actor, context.tenant, classId);
    return classStudentIds(classId);
  }

  const allowed = await accessibleStudentIds(context.actor, context.tenant);
  if (allowed !== null) return allowed;

  const students = await prisma.user.findMany({
    where: { schoolId, primaryRole: 'STUDENT', status: UserStatus.ACTIVE, archivedAt: null },
    select: { id: true },
    take: MAX_SIGNAL_STUDENTS,
  });
  return students.map((student) => student.id);
}

function countsByStudent(rows: { studentId: string; _count: { _all: number } }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.studentId, row._count._all]));
}

/**
 * One `StudentSignalInput` per learner, ready for `evaluateStudentSignals`.
 * Learners with no rows anywhere still appear, with zeroes — a learner who has
 * never started is exactly who a teacher needs to see.
 */
export async function gatherSignalInputs(
  schoolId: string,
  studentIds: string[],
  now = new Date(),
): Promise<Map<string, StudentSignalInput>> {
  const inputs = new Map<string, StudentSignalInput>();
  if (studentIds.length === 0) return inputs;

  const ids = studentIds.slice(0, MAX_SIGNAL_STUDENTS);
  const inScope = { in: ids };
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);

  const openAssignment: Prisma.AssignmentAttemptWhereInput = {
    schoolId,
    studentId: inScope,
    excusedAt: null,
    assignment: { isPublished: true, archivedAt: null },
  };

  const [
    activity,
    struggling,
    overdue,
    dueSoon,
    evidence,
    improved,
    achievements,
    profiles,
  ] = await Promise.all([
    prisma.progressRecord.groupBy({
      by: ['studentId'],
      where: { schoolId, studentId: inScope },
      _count: { _all: true },
      _max: { lastActivityAt: true },
    }),
    prisma.progressRecord.groupBy({
      by: ['studentId'],
      where: {
        schoolId,
        studentId: inScope,
        OR: [
          // Many attempts and still not finished.
          { attemptCount: { gte: REPEATED_ATTEMPT_THRESHOLD }, completedAt: null },
          // Or finished, but never above the accuracy floor.
          { attemptCount: { gte: 2 }, bestScorePercent: { lt: LOW_ACCURACY_PERCENT } },
        ],
      },
      _count: { _all: true },
    }),
    prisma.assignmentAttempt.groupBy({
      by: ['studentId'],
      where: {
        ...openAssignment,
        OR: [
          { state: AssignmentState.OVERDUE },
          {
            state: { in: [AssignmentState.NOT_STARTED, AssignmentState.IN_PROGRESS] },
            assignment: { dueAt: { lt: now } },
          },
        ],
      },
      _count: { _all: true },
    }),
    prisma.assignmentAttempt.groupBy({
      by: ['studentId'],
      where: {
        ...openAssignment,
        state: AssignmentState.NOT_STARTED,
        assignment: { isPublished: true, archivedAt: null, dueAt: { gte: now, lte: dueSoonCutoff } },
      },
      _count: { _all: true },
    }),
    prisma.masteryRecord.groupBy({
      by: ['studentId'],
      where: { schoolId, studentId: inScope, level: { not: MasteryLevel.NOT_ASSESSED } },
      _count: { _all: true },
    }),
    prisma.masteryRecord.groupBy({
      by: ['studentId'],
      where: {
        schoolId,
        studentId: inScope,
        level: { in: [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED] },
        masteredAt: { gte: weekAgo },
      },
      _count: { _all: true },
    }),
    prisma.studentBadge.groupBy({
      by: ['studentId'],
      where: { schoolId, studentId: inScope, revokedAt: null, awardedAt: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.studentProfile.findMany({
      where: { userId: inScope },
      select: { userId: true, screeningCompletedAt: true },
    }),
  ]);

  const activityCounts = countsByStudent(activity);
  const lastActivity = new Map(activity.map((row) => [row.studentId, row._max.lastActivityAt]));
  const strugglingCounts = countsByStudent(struggling);
  const overdueCounts = countsByStudent(overdue);
  const dueSoonCounts = countsByStudent(dueSoon);
  const evidenceCounts = countsByStudent(evidence);
  const improvedCounts = countsByStudent(improved);
  const achievementCounts = countsByStudent(achievements);
  const screened = new Set(
    profiles.filter((row) => row.screeningCompletedAt !== null).map((row) => row.userId),
  );

  for (const studentId of ids) {
    inputs.set(studentId, {
      lastActivityAt: lastActivity.get(studentId) ?? null,
      overdueCount: overdueCounts.get(studentId) ?? 0,
      dueSoonNotStartedCount: dueSoonCounts.get(studentId) ?? 0,
      strugglingTopics: strugglingCounts.get(studentId) ?? 0,
      masteryEvidenceCount: evidenceCounts.get(studentId) ?? 0,
      activityCount: activityCounts.get(studentId) ?? 0,
      screeningCompleted: screened.has(studentId),
      improvedTopics: improvedCounts.get(studentId) ?? 0,
      achievementsLast7Days: achievementCounts.get(studentId) ?? 0,
    });
  }

  return inputs;
}

/** Signals plus the learner's name, ranked most urgent first. */
export async function rankedSignalRows(
  schoolId: string,
  studentIds: string[],
  now = new Date(),
): Promise<StudentSignalRow[]> {
  if (studentIds.length === 0) return [];

  const ids = studentIds.slice(0, MAX_SIGNAL_STUDENTS);
  const [inputs, learners] = await Promise.all([
    gatherSignalInputs(schoolId, ids, now),
    prisma.user.findMany({
      where: { id: { in: ids }, schoolId },
      select: {
        id: true,
        displayName: true,
        studentProfile: { select: { currentGradeId: true } },
      },
    }),
  ]);

  const rows: StudentSignalRow[] = learners.map((learner) => {
    const input = inputs.get(learner.id);
    const signals = input ? evaluateStudentSignals(input, now) : [];
    return {
      studentId: learner.id,
      displayName: learner.displayName,
      gradeId: learner.studentProfile?.currentGradeId ?? null,
      signals,
      engagement: engagementReading(input?.lastActivityAt ?? null, now),
      headline: headlineSignal(signals),
      needsAttention: needsAttention(signals),
      priorityScore: signals
        .filter((signal) => signal.kind === 'CONCERN')
        .reduce((total, signal) => total + signal.weight, 0),
    };
  });

  return rows.sort(
    (a, b) => b.priorityScore - a.priorityScore || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * Learner counts per engagement level. Only levels that actually occur appear —
 * a card reading "0 dormant" invites a teacher to look for a problem that is not
 * there. Shared by the teacher and school views so both count the same way.
 */
export function engagementBuckets(
  rows: readonly StudentSignalRow[],
): { level: EngagementLevel; label: string; count: number }[] {
  const counts = new Map<EngagementLevel, { label: string; count: number }>();
  for (const row of rows) {
    const existing = counts.get(row.engagement.level);
    if (existing) existing.count += 1;
    else counts.set(row.engagement.level, { label: row.engagement.label, count: 1 });
  }
  return ENGAGEMENT_LEVELS.filter((level) => counts.has(level)).map((level) => ({
    level,
    label: counts.get(level)?.label ?? '',
    count: counts.get(level)?.count ?? 0,
  }));
}
