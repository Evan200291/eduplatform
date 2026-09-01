// ─────────────────────────────────────────────────────────────────────────────
// Learner dashboard — blueprint 03 "Home / My Learning"
// The blueprint lists the required elements: a continue-learning action, the
// recommended next step, active assignments and missions, streak and points
// "where enabled", companion status, a recent achievement, and a notification
// indicator. This file collects exactly those and nothing else.
//
// Two rules shape it:
//   • "Where enabled" is honoured. If a school has turned points, streaks,
//     missions or the companion off, those sections come back `null` rather than
//     as zeros — a learner should not see an empty trophy shelf for a feature
//     their school never switched on.
//   • The interpretation lives in ./dashboard.insights.ts. This file gathers
//     counts and ids; it does not decide what they mean.
//
// A single `Promise.all` runs the reads concurrently, and every one of them is
// already narrowed to one learner, so there is no cross-tenant surface here.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  AssessmentKind,
  AssignmentState,
  ContentStatus,
  MasteryLevel,
  MissionStatus,
  NotificationPriority,
  NotificationState,
  PathItemStatus
} from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { badRequest, notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import { isStudent } from '../../core/rbac/authorize';
import { assertCanViewStudent } from '../../core/rbac/scope.service';
import {
  engagementReading,
  nextLearnerAction,
  startOfWeek,
  weeklyGoalReading,
  type LearnerAction,
  type LearnerActionInput,
} from './dashboard.insights';
import type { LearnerDashboardQuery } from './dashboard.validation';

/**
 * Whose dashboard this is. A learner always gets their own; staff may name a
 * learner they teach, which is how blueprint 04 student monitoring shows "what
 * the learner sees" without a second implementation of the same screen.
 */
async function resolveLearner(context: ActorContext, requested?: string): Promise<string> {
  if (isStudent(context.actor)) return context.actor.userId;
  if (!requested) {
    throw badRequest('Name a learner with ?studentId= to view their dashboard.');
  }
  await assertCanViewStudent(context.actor, context.tenant, requested);
  return requested;
}

const OPEN_ASSIGNMENT_STATES: AssignmentState[] = [
  AssignmentState.NOT_STARTED,
  AssignmentState.IN_PROGRESS,
  AssignmentState.OVERDUE,
];

export interface LearnerDashboard {
  generatedAt: Date;
  studentId: string;
  isOwnDashboard: boolean;
  learner: { displayName: string; nickname: string | null; gradeId: string | null };
  onboarding: { onboardingCompletedAt: Date | null; screeningCompletedAt: Date | null };
  /** Blueprint 03: the one thing to do next, with the reason attached. */
  nextAction: LearnerAction;
  engagement: ReturnType<typeof engagementReading>;
  weeklyGoal: ReturnType<typeof weeklyGoalReading> & { basis: string };
  learning: {
    lessonsCompleted: number;
    activitiesInProgress: number;
    topicsMastered: number;
    topicsToPractise: number;
  };
  assignments: { open: number; overdue: number; dueSoon: number };
  missions: { active: number; completed: number; nearestGoal: NearestMission | null } | null;
  rewards: { points: number; badges: number; unseenBadges: number } | null;
  streak: { kind: string; currentLength: number; longestLength: number } | null;
  companion: CompanionCard | null;
  recentAchievement: { label: string; earnedAt: Date } | null;
  notifications: { unread: number; highPriority: number };
}

interface NearestMission {
  missionId: string;
  title: string;
  progressValue: number;
  goalTarget: number;
}

interface CompanionCard {
  name: string;
  speciesKey: string;
  stage: string;
  mood: string;
  level: number;
  growthPoints: number;
}

export async function learnerDashboard(
  context: ActorContext,
  schoolId: string,
  query: LearnerDashboardQuery,
  now = new Date(),
): Promise<LearnerDashboard> {
  const studentId = await resolveLearner(context, query.studentId);
  const weekStart = startOfWeek(now);
  const dueSoonCutoff = new Date(now.getTime() + 3 * 86_400_000);

  const learner = await prisma.user.findFirst({
    where: { id: studentId, schoolId },
    select: {
      displayName: true,
      nickname: true,
      studentProfile: {
        select: {
          currentGradeId: true,
          onboardingCompletedAt: true,
          screeningCompletedAt: true,
          targetMinutesPerWeek: true,
        },
      },
    },
  });
  if (!learner) throw notFound('Learner');
  const profile = learner.studentProfile;

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: {
      pointsEnabled: true,
      badgesEnabled: true,
      streaksEnabled: true,
      missionsEnabled: true,
      companionEnabled: true,
    },
  });
  const rewardsOn = settings?.pointsEnabled !== false || settings?.badgesEnabled !== false;
  const missionsOn = settings?.missionsEnabled !== false;
  const streaksOn = settings?.streaksEnabled !== false;
  const companionOn = settings?.companionEnabled !== false;

  const openAssignmentWhere: Prisma.AssignmentAttemptWhereInput = {
    schoolId,
    studentId,
    state: { in: OPEN_ASSIGNMENT_STATES },
    excusedAt: null,
    assignment: { isPublished: true, archivedAt: null },
  };
  const overdueWhere: Prisma.AssignmentAttemptWhereInput = {
    ...openAssignmentWhere,
    OR: [{ state: AssignmentState.OVERDUE }, { assignment: { dueAt: { lt: now } } }],
  };

  const [
    lessonsCompleted,
    resumable,
    activitiesInProgress,
    minutesRow,
    topicsMastered,
    weakest,
    openAssignments,
    overdueAssignments,
    dueSoonAssignments,
    overdueNext,
    openNext,
    pathItem,
    missionRows,
    missionsCompleted,
    pointsRow,
    badgeCount,
    unseenBadges,
    latestBadge,
    streakRow,
    companion,
    unread,
    highPriority,
    screening,
  ] = await Promise.all([
    prisma.progressRecord.count({
      where: { schoolId, studentId, lessonId: { not: null }, completedAt: { not: null } },
    }),
    prisma.progressRecord.findFirst({
      where: {
        schoolId,
        studentId,
        status: PathItemStatus.IN_PROGRESS,
        activityId: { not: null },
      },
      orderBy: { lastActivityAt: 'desc' },
      select: { activityId: true },
    }),
    prisma.progressRecord.count({
      where: { schoolId, studentId, status: PathItemStatus.IN_PROGRESS },
    }),
    prisma.progressRecord.aggregate({
      where: { schoolId, studentId, lastActivityAt: { gte: weekStart } },
      _sum: { timeSpentSeconds: true },
      _max: { lastActivityAt: true },
    }),
    prisma.masteryRecord.count({
      where: { schoolId, studentId, level: MasteryLevel.MASTERED, topicId: { not: null } },
    }),
    prisma.masteryRecord.findFirst({
      where: {
        schoolId,
        studentId,
        topicId: { not: null },
        level: { in: [MasteryLevel.EMERGING, MasteryLevel.DEVELOPING] },
      },
      orderBy: [{ scorePercent: 'asc' }, { lastEvidenceAt: 'asc' }],
      select: { topicId: true },
    }),
    prisma.assignmentAttempt.count({ where: openAssignmentWhere }),
    prisma.assignmentAttempt.count({ where: overdueWhere }),
    prisma.assignmentAttempt.count({
      where: {
        ...openAssignmentWhere,
        assignment: { isPublished: true, archivedAt: null, dueAt: { gte: now, lte: dueSoonCutoff } },
      },
    }),
    prisma.assignmentAttempt.findFirst({
      where: overdueWhere,
      orderBy: { assignment: { dueAt: 'asc' } },
      select: { assignmentId: true },
    }),
    prisma.assignmentAttempt.findFirst({
      where: openAssignmentWhere,
      orderBy: [{ assignment: { dueAt: 'asc' } }, { createdAt: 'asc' }],
      select: { assignmentId: true },
    }),
    prisma.learningPathItem.findFirst({
      where: {
        removedAt: null,
        status: { in: [PathItemStatus.AVAILABLE, PathItemStatus.IN_PROGRESS] },
        path: {
          schoolId,
          studentId,
          isActive: true,
          archivedAt: null,
          // Blueprint 04: a path that still needs a teacher's approval is inert,
          // so it must not be offered to the learner as their next step.
          OR: [{ requiresApproval: false }, { approvedAt: { not: null } }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
      select: { id: true },
    }),
    missionsOn
      ? prisma.missionProgress.findMany({
          where: {
            schoolId,
            studentId,
            status: { in: [MissionStatus.NOT_STARTED, MissionStatus.ACTIVE] },
            mission: { isActive: true, archivedAt: null },
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            missionId: true,
            progressValue: true,
            goalTarget: true,
            mission: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
    missionsOn
      ? prisma.missionProgress.count({
          where: { schoolId, studentId, status: MissionStatus.COMPLETED },
        })
      : Promise.resolve(0),
    rewardsOn
      ? prisma.pointsLedger.aggregate({ where: { schoolId, studentId }, _sum: { points: true } })
      : Promise.resolve(null),
    rewardsOn
      ? prisma.studentBadge.count({ where: { schoolId, studentId, revokedAt: null } })
      : Promise.resolve(0),
    rewardsOn
      ? prisma.studentBadge.count({
          where: { schoolId, studentId, revokedAt: null, seenAt: null },
        })
      : Promise.resolve(0),
    rewardsOn
      ? prisma.studentBadge.findFirst({
          where: { schoolId, studentId, revokedAt: null },
          orderBy: { awardedAt: 'desc' },
          select: { awardedAt: true, badge: { select: { name: true } } },
        })
      : Promise.resolve(null),
    streaksOn
      ? prisma.streak.findFirst({
          where: { schoolId, studentId },
          orderBy: { currentLength: 'desc' },
          select: { kind: true, currentLength: true, longestLength: true },
        })
      : Promise.resolve(null),
    companionOn
      ? prisma.companion.findUnique({
          where: { studentId },
          select: {
            name: true,
            speciesKey: true,
            stage: true,
            mood: true,
            level: true,
            growthPoints: true,
          },
        })
      : Promise.resolve(null),
    prisma.notification.count({
      where: {
        userId: studentId,
        readAt: null,
        dismissedAt: null,
        state: { in: [NotificationState.PENDING, NotificationState.DELIVERED] },
      },
    }),
    prisma.notification.count({
      where: {
        userId: studentId,
        readAt: null,
        dismissedAt: null,
        state: { in: [NotificationState.PENDING, NotificationState.DELIVERED] },
        priority: { in: [NotificationPriority.HIGH, NotificationPriority.CRITICAL] },
      },
    }),
    prisma.assessment.findFirst({
      where: {
        schoolId,
        kind: AssessmentKind.SCREENING,
        status: ContentStatus.PUBLISHED,
        archivedAt: null,
      },
      orderBy: { publishedAt: 'desc' },
      select: { id: true },
    }),
  ]);

  const nearestGoal = missionRows
    .map((row) => ({
      missionId: row.missionId,
      title: row.mission.title,
      progressValue: row.progressValue,
      goalTarget: row.goalTarget,
      remaining: Math.max(0, row.goalTarget - row.progressValue),
    }))
    .sort((a, b) => a.remaining - b.remaining)[0];

  const actionInput: LearnerActionInput = {
    screeningCompleted: Boolean(profile?.screeningCompletedAt),
    screeningAssessmentId: screening?.id ?? null,
    overdueAssignmentId: overdueNext?.assignmentId ?? null,
    resumableActivityId: resumable?.activityId ?? null,
    openAssignmentId: openNext?.assignmentId ?? null,
    nextPathItemId: pathItem?.id ?? null,
    nearlyDoneMissionId:
      nearestGoal && nearestGoal.remaining > 0 && nearestGoal.progressValue > 0
        ? nearestGoal.missionId
        : null,
    weakestTopicId: weakest?.topicId ?? null,
  };

  const minutesThisWeek = Math.round((minutesRow._sum.timeSpentSeconds ?? 0) / 60);
  const goal = weeklyGoalReading(minutesThisWeek, profile?.targetMinutesPerWeek ?? 0);

  return {
    generatedAt: now,
    studentId,
    isOwnDashboard: context.actor.userId === studentId,
    learner: {
      displayName: learner.displayName,
      nickname: learner.nickname,
      gradeId: profile?.currentGradeId ?? null,
    },
    onboarding: {
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
      screeningCompletedAt: profile?.screeningCompletedAt ?? null,
    },
    nextAction: nextLearnerAction(actionInput),
    engagement: engagementReading(minutesRow._max.lastActivityAt ?? null, now),
    weeklyGoal: {
      ...goal,
      // Named so a reader knows this is time on activities touched this week,
      // not a per-day session log — the platform records cumulative time per
      // activity, and pretending otherwise would overstate a single long week.
      basis: 'ACTIVITIES_ACTIVE_THIS_WEEK',
    },
    learning: {
      lessonsCompleted,
      activitiesInProgress,
      topicsMastered,
      topicsToPractise: weakest ? 1 : 0,
    },
    assignments: {
      open: openAssignments,
      overdue: overdueAssignments,
      dueSoon: dueSoonAssignments,
    },
    missions: missionsOn
      ? {
          active: missionRows.length,
          completed: missionsCompleted,
          nearestGoal: nearestGoal
            ? {
                missionId: nearestGoal.missionId,
                title: nearestGoal.title,
                progressValue: nearestGoal.progressValue,
                goalTarget: nearestGoal.goalTarget,
              }
            : null,
        }
      : null,
    rewards: rewardsOn
      ? {
          points: pointsRow?._sum.points ?? 0,
          badges: badgeCount,
          unseenBadges,
        }
      : null,
    streak: streakRow
      ? {
          kind: streakRow.kind,
          currentLength: streakRow.currentLength,
          longestLength: streakRow.longestLength,
        }
      : null,
    companion,
    recentAchievement: latestBadge
      ? { label: latestBadge.badge.name, earnedAt: latestBadge.awardedAt }
      : null,
    notifications: { unread, highPriority },
  };
}
