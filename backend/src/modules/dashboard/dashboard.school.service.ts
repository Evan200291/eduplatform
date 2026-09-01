// ─────────────────────────────────────────────────────────────────────────────
// School dashboard — blueprint 05 "Admin navigation → Overview"
// A school administrator's first screen. It answers three questions in order:
// is the school set up correctly, are learners actually learning, and is
// anything waiting on a human.
//
// It is deliberately school-scoped. Platform-wide health (jobs, incidents,
// tenants) lives in the platform module, which already has the operations views
// blueprint 13 asks for; duplicating them here would give a school admin numbers
// they cannot act on.
// ─────────────────────────────────────────────────────────────────────────────

import { AssignmentState, ContentStatus, MasteryLevel, RoleKey, UserStatus } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import { gradeStudentIds } from '../../core/rbac/scope.service';
import { getQueueSummary } from '../learning/recommendations.service';
import { findSchoolSubscription, seatUsage } from '../subscription/subscription.service';
import { OPEN_STATUSES as OPEN_SUPPORT_STATUSES } from '../support/support.policy';
import {
  ACTIVE_WINDOW_DAYS,
  completionReading,
  type CompletionReading,
  type EngagementLevel,
} from './dashboard.insights';
import { engagementBuckets, rankedSignalRows, scopedStudentIds } from './dashboard.signals.service';
import type { SchoolDashboardQuery } from './dashboard.validation';

const DAY_MS = 86_400_000;
const DONE_STATES: AssignmentState[] = [AssignmentState.SUBMITTED, AssignmentState.COMPLETED];
const STAFF_ROLES: RoleKey[] = [
  RoleKey.SCHOOL_ADMIN,
  RoleKey.PLATFORM_OPS_ADMIN,
  RoleKey.PLATFORM_OWNER,
  RoleKey.CURRICULUM_MANAGER,
  RoleKey.CONTENT_REVIEWER,
  RoleKey.SUPPORT_AGENT,
  RoleKey.REPORT_VIEWER,
  RoleKey.BILLING_ADMIN,
];

export interface SchoolDashboard {
  generatedAt: Date;
  school: { id: string; name: string; code: string; status: string };
  scope: { gradeId: string | null; learnerCount: number };
  people: {
    students: number;
    teachers: number;
    staff: number;
    invited: number;
    suspended: number;
  };
  structure: {
    grades: number;
    subjects: number;
    classes: number;
    activeTerm: { id: string; name: string; endsAt: Date | null } | null;
    learnersWithoutClass: number;
  };
  engagement: {
    activeThisWeek: number;
    buckets: { level: EngagementLevel; label: string; count: number }[];
    needingAttention: number;
  };
  learning: {
    completion: CompletionReading;
    masteryGaps: { topicId: string; topicName: string; learners: number }[];
    screeningOutstanding: number;
    onboardingOutstanding: number;
  };
  content: { status: ContentStatus; topics: number; lessons: number; activities: number }[];
  waiting: {
    recommendations: Awaited<ReturnType<typeof getQueueSummary>>;
    pathsAwaitingApproval: number;
    submissionsAwaitingMarking: number;
    openSupportTickets: number;
  };
  features: Record<string, boolean>;
  subscription: {
    plan: string;
    status: string;
    endsAt: Date | null;
    seats: Awaited<ReturnType<typeof seatUsage>> | null;
  } | null;
}

export async function schoolDashboard(
  context: ActorContext,
  schoolId: string,
  query: SchoolDashboardQuery,
  now = new Date(),
): Promise<SchoolDashboard> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, code: true, status: true },
  });
  if (!school) throw notFound('School');

  const studentIds = query.gradeId
    ? await gradeStudentIds(schoolId, query.gradeId)
    : await scopedStudentIds(context, schoolId);
  const inScope = { in: studentIds };
  const hasStudents = studentIds.length > 0;
  const activeSince = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS);

  const [
    rows,
    students,
    teachers,
    staff,
    invited,
    suspended,
    grades,
    subjects,
    classes,
    activeTerm,
    learnersWithoutClass,
    activeThisWeek,
    attemptTotals,
    gapRows,
    screeningOutstanding,
    onboardingOutstanding,
    topicStatus,
    lessonStatus,
    activityStatus,
    recommendations,
    pathsAwaitingApproval,
    submissionsAwaitingMarking,
    openSupportTickets,
    settings,
    subscription,
  ] = await Promise.all([
    rankedSignalRows(schoolId, studentIds, now),
    prisma.user.count({ where: { schoolId, primaryRole: RoleKey.STUDENT, archivedAt: null } }),
    prisma.user.count({ where: { schoolId, primaryRole: RoleKey.TEACHER, archivedAt: null } }),
    prisma.user.count({
      where: { schoolId, primaryRole: { in: STAFF_ROLES }, archivedAt: null },
    }),
    prisma.user.count({ where: { schoolId, status: UserStatus.INVITED } }),
    prisma.user.count({ where: { schoolId, status: UserStatus.SUSPENDED } }),
    prisma.grade.count({ where: { schoolId, archivedAt: null } }),
    prisma.subject.count({ where: { schoolId, isActive: true, archivedAt: null } }),
    prisma.class.count({ where: { schoolId, isActive: true, archivedAt: null } }),
    prisma.academicTerm.findFirst({
      where: { schoolId, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: 'desc' },
      select: { id: true, name: true, endsAt: true },
    }),
    prisma.user.count({
      where: {
        schoolId,
        primaryRole: RoleKey.STUDENT,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        classMemberships: { none: { isActive: true } },
      },
    }),
    hasStudents
      ? prisma.progressRecord
          .findMany({
            where: { schoolId, studentId: inScope, lastActivityAt: { gte: activeSince } },
            select: { studentId: true },
            distinct: ['studentId'],
          })
          .then((found) => found.length)
      : Promise.resolve(0),
    hasStudents
      ? prisma.assignmentAttempt.groupBy({
          by: ['state'],
          where: {
            schoolId,
            studentId: inScope,
            excusedAt: null,
            assignment: { isPublished: true, archivedAt: null },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
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
    hasStudents
      ? prisma.studentProfile.count({
          where: { userId: inScope, screeningCompletedAt: null },
        })
      : Promise.resolve(0),
    hasStudents
      ? prisma.studentProfile.count({
          where: { userId: inScope, onboardingCompletedAt: null },
        })
      : Promise.resolve(0),
    prisma.topic.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
    prisma.lesson.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ['status'], where: { schoolId }, _count: { _all: true } }),
    getQueueSummary(schoolId),
    prisma.learningPath.count({
      where: { schoolId, isActive: true, archivedAt: null, requiresApproval: true, approvedAt: null },
    }),
    hasStudents
      ? prisma.assignmentAttempt.count({
          where: {
            schoolId,
            studentId: inScope,
            state: AssignmentState.SUBMITTED,
            scorePercent: null,
          },
        })
      : Promise.resolve(0),
    prisma.supportRequest.count({
      where: { schoolId, status: { in: OPEN_SUPPORT_STATUSES } },
    }),
    prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: {
        pointsEnabled: true,
        badgesEnabled: true,
        streaksEnabled: true,
        companionEnabled: true,
        missionsEnabled: true,
        leaderboardEnabled: true,
        screeningEnabled: true,
        homeworkEnabled: true,
        digestEnabled: true,
        parentPortalEnabled: true,
        recommendationApprovalRequired: true,
      },
    }),
    findSchoolSubscription(schoolId),
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

  const buckets = engagementBuckets(rows);

  const contentByStatus = (Object.values(ContentStatus) as ContentStatus[]).map((status) => ({
    status,
    topics: topicStatus.find((row) => row.status === status)?._count._all ?? 0,
    lessons: lessonStatus.find((row) => row.status === status)?._count._all ?? 0,
    activities: activityStatus.find((row) => row.status === status)?._count._all ?? 0,
  }));

  return {
    generatedAt: now,
    school: { id: school.id, name: school.name, code: school.code, status: school.status },
    scope: { gradeId: query.gradeId ?? null, learnerCount: studentIds.length },
    people: { students, teachers, staff, invited, suspended },
    structure: {
      grades,
      subjects,
      classes,
      activeTerm,
      learnersWithoutClass,
    },
    engagement: {
      activeThisWeek,
      buckets,
      needingAttention: rows.filter((row) => row.needsAttention).length,
    },
    learning: {
      completion: completionReading(doneAttempts, totalAttempts),
      masteryGaps: gapRows
        .filter((row) => row.topicId !== null)
        .map((row) => ({
          topicId: row.topicId as string,
          topicName: topicNames.get(row.topicId as string) ?? 'Topic',
          learners: row._count._all,
        })),
      screeningOutstanding,
      onboardingOutstanding,
    },
    content: contentByStatus,
    waiting: {
      recommendations,
      pathsAwaitingApproval,
      submissionsAwaitingMarking,
      openSupportTickets,
    },
    features: settings ? { ...settings } : {},
    subscription: subscription
      ? {
          plan: subscription.plan,
          status: subscription.status,
          endsAt: subscription.endsAt,
          seats: await seatUsage(
            schoolId,
            subscription.licensedStudentSeats,
            subscription.licensedTeacherSeats,
          ),
        }
      : null,
  };
}
