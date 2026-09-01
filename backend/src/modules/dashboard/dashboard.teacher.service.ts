// ─────────────────────────────────────────────────────────────────────────────
// Teacher dashboard — blueprint 04 "Teacher Dashboard"
// The blueprint names the cards: class overview, students needing attention,
// assignment completion, mastery gaps, pending recommendations, and recent
// achievements. Each one here carries a reading from ./dashboard.insights.ts, so
// no number arrives without a sentence saying what it means.
//
// Scoping comes from ./dashboard.signals.service.ts, which resolves the learner
// set from the roster. A `classId` in the query is checked, never trusted.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { AssignmentState, MasteryLevel } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { prisma } from '../../core/prisma';
import { getQueueSummary } from '../learning/recommendations.service';
import { getUnreadSummary } from '../notifications/notifications.inbox.service';
import {
  SEVERITY_WEIGHT,
  completionReading,
  type CompletionReading,
  type EngagementLevel,
  type StudentSignal,
} from './dashboard.insights';
import {
  engagementBuckets,
  rankedSignalRows,
  scopedStudentIds,
  type StudentSignalRow,
} from './dashboard.signals.service';
import type { AttentionListQuery, TeacherDashboardQuery } from './dashboard.validation';

const DAY_MS = 86_400_000;
const DONE_STATES: AssignmentState[] = [AssignmentState.SUBMITTED, AssignmentState.COMPLETED];

export interface TeacherDashboard {
  generatedAt: Date;
  scope: { classId: string | null; className: string | null; studentCount: number };
  classes: { classId: string; name: string; code: string; gradeId: string; studentCount: number }[];
  engagement: { level: EngagementLevel; label: string; count: number }[];
  attention: {
    total: number;
    shown: number;
    students: AttentionEntry[];
  };
  celebrations: AttentionEntry[];
  assignments: {
    completion: CompletionReading;
    published: number;
    overdueAttempts: number;
    dueThisWeek: number;
    awaitingMarking: number;
  };
  masteryGaps: { topicId: string; topicName: string; learners: number }[];
  recommendations: Awaited<ReturnType<typeof getQueueSummary>>;
  followUps: { due: number; overdue: number };
  notifications: { unread: number };
}

export interface AttentionEntry {
  studentId: string;
  displayName: string;
  engagementLabel: string;
  headline: StudentSignal | null;
  signals: StudentSignal[];
}

function toEntry(row: StudentSignalRow): AttentionEntry {
  return {
    studentId: row.studentId,
    displayName: row.displayName,
    engagementLabel: row.engagement.label,
    headline: row.headline,
    signals: row.signals,
  };
}

/** Learner counts per engagement level, in the fixed order the UI renders. */

export async function teacherDashboard(
  context: ActorContext,
  schoolId: string,
  query: TeacherDashboardQuery,
  now = new Date(),
): Promise<TeacherDashboard> {
  const studentIds = await scopedStudentIds(context, schoolId, query.classId);
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);

  const inScope = { in: studentIds };
  const attemptBase: Prisma.AssignmentAttemptWhereInput = {
    schoolId,
    studentId: inScope,
    excusedAt: null,
    assignment: {
      isPublished: true,
      archivedAt: null,
      ...(query.classId ? { classId: query.classId } : {}),
    },
  };
  const hasStudents = studentIds.length > 0;

  const [
    rows,
    classes,
    scopeClass,
    attemptTotals,
    publishedAssignments,
    overdueAttempts,
    dueThisWeek,
    awaitingMarking,
    gapRows,
    recommendations,
    followUpsDue,
    followUpsOverdue,
    unread,
  ] = await Promise.all([
    rankedSignalRows(schoolId, studentIds, now),
    prisma.class.findMany({
      where: {
        schoolId,
        isActive: true,
        archivedAt: null,
        ...(query.classId
          ? { id: query.classId }
          : { teachers: { some: { userId: context.actor.userId, removedAt: null } } }),
      },
      orderBy: { name: 'asc' },
      take: 50,
      select: {
        id: true,
        name: true,
        code: true,
        gradeId: true,
        _count: { select: { memberships: { where: { isActive: true } } } },
      },
    }),
    query.classId
      ? prisma.class.findFirst({
          where: { id: query.classId, schoolId },
          select: { name: true },
        })
      : Promise.resolve(null),
    hasStudents
      ? prisma.assignmentAttempt.groupBy({
          by: ['state'],
          where: attemptBase,
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.assignment.count({
      where: {
        schoolId,
        isPublished: true,
        archivedAt: null,
        ...(query.classId ? { classId: query.classId } : {}),
      },
    }),
    hasStudents
      ? prisma.assignmentAttempt.count({
          where: {
            ...attemptBase,
            OR: [
              { state: AssignmentState.OVERDUE },
              {
                state: { in: [AssignmentState.NOT_STARTED, AssignmentState.IN_PROGRESS] },
                assignment: { dueAt: { lt: now } },
              },
            ],
          },
        })
      : Promise.resolve(0),
    prisma.assignment.count({
      where: {
        schoolId,
        isPublished: true,
        archivedAt: null,
        dueAt: { gte: now, lte: weekAhead },
        ...(query.classId ? { classId: query.classId } : {}),
      },
    }),
    hasStudents
      ? prisma.assignmentAttempt.count({
          where: { ...attemptBase, state: AssignmentState.SUBMITTED, scorePercent: null },
        })
      : Promise.resolve(0),
    hasStudents
      ? prisma.masteryRecord.groupBy({
          by: ['topicId'],
          where: {
            schoolId,
            studentId: inScope,
            topicId: { not: null },
            level: { in: [MasteryLevel.EMERGING, MasteryLevel.DEVELOPING] },
          },
          _count: { _all: true },
          orderBy: { _count: { topicId: 'desc' } },
          take: 5,
        })
      : Promise.resolve([]),
    getQueueSummary(schoolId),
    hasStudents
      ? prisma.teacherNote.count({
          where: {
            schoolId,
            studentId: inScope,
            withdrawnAt: null,
            followUpDoneAt: null,
            followUpDueAt: { gte: now, lte: weekAhead },
          },
        })
      : Promise.resolve(0),
    hasStudents
      ? prisma.teacherNote.count({
          where: {
            schoolId,
            studentId: inScope,
            withdrawnAt: null,
            followUpDoneAt: null,
            followUpDueAt: { lt: now },
          },
        })
      : Promise.resolve(0),
    getUnreadSummary(context),
  ]);

  const totalAttempts = attemptTotals.reduce((sum, row) => sum + row._count._all, 0);
  const doneAttempts = attemptTotals
    .filter((row) => DONE_STATES.includes(row.state))
    .reduce((sum, row) => sum + row._count._all, 0);

  const topicIds = gapRows
    .map((row) => row.topicId)
    .filter((topicId): topicId is string => topicId !== null);
  const topics = topicIds.length
    ? await prisma.topic.findMany({
        where: { id: { in: topicIds } },
        select: { id: true, name: true },
      })
    : [];
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.name]));

  const concerns = rows.filter((row) => row.needsAttention);
  const celebrations = rows.filter(
    (row) => !row.needsAttention && row.signals.some((signal) => signal.kind === 'CELEBRATION'),
  );

  return {
    generatedAt: now,
    scope: {
      classId: query.classId ?? null,
      className: scopeClass?.name ?? null,
      studentCount: studentIds.length,
    },
    classes: classes.map((klass) => ({
      classId: klass.id,
      name: klass.name,
      code: klass.code,
      gradeId: klass.gradeId,
      studentCount: klass._count.memberships,
    })),
    engagement: engagementBuckets(rows),
    attention: {
      total: concerns.length,
      shown: Math.min(concerns.length, query.attentionLimit),
      students: concerns.slice(0, query.attentionLimit).map(toEntry),
    },
    celebrations: celebrations.slice(0, 5).map(toEntry),
    assignments: {
      completion: completionReading(doneAttempts, totalAttempts),
      published: publishedAssignments,
      overdueAttempts,
      dueThisWeek,
      awaitingMarking,
    },
    masteryGaps: gapRows
      .filter((row) => row.topicId !== null)
      .map((row) => ({
        topicId: row.topicId as string,
        topicName: topicNames.get(row.topicId as string) ?? 'Topic',
        learners: row._count._all,
      })),
    recommendations,
    followUps: { due: followUpsDue, overdue: followUpsOverdue },
    notifications: { unread: unread.unread },
  };
}

// ── The full list behind the card ────────────────────────────────────────────

const SEVERITY_FLOOR = SEVERITY_WEIGHT;

export interface AttentionListResult {
  items: AttentionEntry[];
  totalItems: number;
}

/**
 * Every learner matching the severity floor, paginated. `minSeverity` is a floor
 * on the *most serious* signal a learner has, so HIGH does not hide the medium
 * signals of a learner who also has a high one.
 */
export async function attentionList(
  context: ActorContext,
  schoolId: string,
  query: AttentionListQuery,
  skip: number,
  take: number,
  now = new Date(),
): Promise<AttentionListResult> {
  const studentIds = await scopedStudentIds(context, schoolId, query.classId);
  const rows = await rankedSignalRows(schoolId, studentIds, now);
  const floor = SEVERITY_FLOOR[query.minSeverity];

  const matching = rows.filter((row) => {
    const concerns = row.signals.filter((signal) => signal.kind === 'CONCERN');
    const worst = concerns.reduce((best, signal) => Math.max(best, signal.weight), 0);
    if (worst >= floor) return true;
    return query.includeCelebrations && row.signals.some((s) => s.kind === 'CELEBRATION');
  });

  return {
    items: matching.slice(skip, skip + take).map((row) => ({
      ...toEntry(row),
      signals: query.includeCelebrations
        ? row.signals
        : row.signals.filter((signal) => signal.kind === 'CONCERN'),
    })),
    totalItems: matching.length,
  };
}
