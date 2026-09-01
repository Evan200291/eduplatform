// ─────────────────────────────────────────────────────────────────────────────
// Mission rules: measuring a goal, and settling a finished one
// Blueprint 03: missions are "always framed as achievable, never as a penalty for
// falling behind". Everything in this file follows from that one sentence.
//
//   • Progress is *measured*, never incremented. Each goal type is a query over
//     records that already exist — completed activities, on-time hand-ins, mastery
//     rows. Nothing here trusts a counter that some other module remembered to
//     bump, so a mission cannot silently drift away from what the learner did.
//   • A mission that is finished stays finished. `settleProgress` only ever moves
//     status forward into COMPLETED and only ever raises `progressValue`, because
//     a bar that goes backwards would read as a punishment for a record being
//     recalculated.
//   • Expiry is quiet. A round that runs out is marked EXPIRED and nothing else
//     happens: no notification, no points removed, no note against the learner.
//
// `settleProgress` is the only place a mission is completed, points for a mission
// are credited, or a mission's reward badge is granted. Keeping that in one
// function is what makes the reward idempotent under a re-run of the hourly job.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  MasteryLevel,
  MissionStatus,
  NotificationCategory,
  NotificationPriority,
  PathItemStatus,
  PointsReason,
  StreakKind,
  AssignmentState,
} from '@prisma/client';
import { prisma } from '../../core/prisma';
import { logger } from '../../core/logger';
import { enqueueNotification } from '../notifications/notifications.service';
import { grantBadge } from '../gamification/gamification.rules';
import { recordLearningEvent } from '../gamification/gamification.service';
import type { GoalType } from './missions.validation';

const log = logger.child({ module: 'missions.rules' });

/** Mastery counts once a learner is at least proficient — see `gamification.rules.ts`. */
const MASTERED_ENOUGH: MasteryLevel[] = [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED];

/** Hand-ins that count as done. A draft in progress is not a hand-in. */
const HANDED_IN: AssignmentState[] = [AssignmentState.SUBMITTED, AssignmentState.COMPLETED];

/** The mission fields any measurement or settlement needs. */
export const MISSION_CORE = {
  id: true,
  schoolId: true,
  key: true,
  title: true,
  description: true,
  classId: true,
  topicId: true,
  goalType: true,
  goalTarget: true,
  pointsReward: true,
  rewardBadgeId: true,
  startsAt: true,
  endsAt: true,
  isRecurring: true,
  recurrenceDays: true,
  isActive: true,
  autoEnrol: true,
  archivedAt: true,
} satisfies Prisma.MissionSelect;

export type MissionCore = Prisma.MissionGetPayload<{ select: typeof MISSION_CORE }>;

export interface MeasureWindow {
  /** Null means "since the learner joined the mission" rather than a fixed round. */
  from: Date | null;
  to: Date | null;
}

// ── Measuring ───────────────────────────────────────────────────────────────

/**
 * How much of the goal the learner has done inside the window.
 *
 * The window is applied to the field that says *when the learning happened*, which
 * differs per record: a completed activity has `completedAt`, time spent accrues
 * against `lastActivityAt`, mastery moves at `lastEvidenceAt`. Using each record's
 * own timestamp is what keeps a weekly mission honest about the week.
 */
export async function measureGoal(
  mission: Pick<MissionCore, 'schoolId' | 'goalType' | 'topicId'>,
  studentId: string,
  window: MeasureWindow,
): Promise<number> {
  const { schoolId, topicId } = mission;
  const topic = topicId ? { topicId } : {};

  switch (mission.goalType as GoalType) {
    case 'ACTIVITIES_COMPLETED':
      return prisma.progressRecord.count({
        where: {
          schoolId,
          studentId,
          status: PathItemStatus.COMPLETED,
          ...topic,
          ...(rangeOf(window) ? { completedAt: rangeOf(window)! } : {}),
        },
      });

    case 'MINUTES_LEARNED': {
      const total = await prisma.progressRecord.aggregate({
        _sum: { timeSpentSeconds: true },
        where: {
          schoolId,
          studentId,
          ...topic,
          ...(rangeOf(window) ? { lastActivityAt: rangeOf(window)! } : {}),
        },
      });
      // Minutes, floored: 59 seconds of practice is not a minute of learning.
      return Math.floor((total._sum.timeSpentSeconds ?? 0) / 60);
    }

    case 'TOPICS_MASTERED':
      return prisma.masteryRecord.count({
        where: {
          schoolId,
          studentId,
          level: { in: MASTERED_ENOUGH },
          // Topic-level rows only. Counting objectives too would let one topic
          // satisfy a "master three topics" goal several times over.
          topicId: topicId ?? { not: null },
          objectiveId: null,
          ...(rangeOf(window) ? { lastEvidenceAt: rangeOf(window)! } : {}),
        },
      });

    case 'ASSIGNMENTS_ON_TIME':
      return prisma.assignmentAttempt.count({
        where: {
          schoolId,
          studentId,
          isLate: false,
          state: { in: HANDED_IN },
          ...(topicId ? { assignment: { topicId } } : {}),
          ...(rangeOf(window) ? { submittedAt: rangeOf(window)! } : {}),
        },
      });

    case 'ACCURACY_PERCENT': {
      /**
       * The average across the window's evaluations, not the best one. A mission
       * asking for 80% accuracy is asking the learner to be reliably accurate,
       * and a single lucky quiz is not that.
       */
      const result = await prisma.topicEvaluation.aggregate({
        _avg: { accuracyPercent: true },
        where: {
          schoolId,
          studentId,
          ...topic,
          ...(rangeOf(window) ? { evaluatedAt: rangeOf(window)! } : {}),
        },
      });
      return Math.round(result._avg.accuracyPercent ?? 0);
    }

    case 'STREAK_DAYS': {
      /**
       * Deliberately ignores the window. A streak is already a statement about a
       * span of days, and clipping it to the mission's round would mean a learner
       * who kept a 10-day run going across a period boundary appeared to be
       * starting from nothing.
       */
      const streak = await prisma.streak.findFirst({
        where: { studentId, kind: StreakKind.DAILY_LEARNING },
        select: { currentLength: true },
      });
      return streak?.currentLength ?? 0;
    }

    default:
      // An unmeasurable goal type reads as no progress rather than as complete.
      // Validation should make this unreachable; a hand-edited row should not
      // hand out points.
      log.warn({ goalType: mission.goalType }, 'Mission has an unknown goal type');
      return 0;
  }
}

function rangeOf(window: MeasureWindow): Prisma.DateTimeFilter | null {
  if (!window.from && !window.to) return null;
  return {
    ...(window.from ? { gte: window.from } : {}),
    ...(window.to ? { lt: window.to } : {}),
  };
}

/** A one-line description of the goal, for a card the learner reads. */
export function goalLabel(goalType: string, goalTarget: number): string {
  switch (goalType as GoalType) {
    case 'ACTIVITIES_COMPLETED':
      return `Finish ${goalTarget} ${goalTarget === 1 ? 'activity' : 'activities'}`;
    case 'MINUTES_LEARNED':
      return `Learn for ${goalTarget} minutes`;
    case 'TOPICS_MASTERED':
      return `Master ${goalTarget} ${goalTarget === 1 ? 'topic' : 'topics'}`;
    case 'ASSIGNMENTS_ON_TIME':
      return `Hand in ${goalTarget} ${goalTarget === 1 ? 'task' : 'tasks'} on time`;
    case 'ACCURACY_PERCENT':
      return `Reach ${goalTarget}% accuracy`;
    case 'STREAK_DAYS':
      return `Keep a ${goalTarget}-day learning streak`;
    default:
      return `Reach ${goalTarget}`;
  }
}

// ── Settling ────────────────────────────────────────────────────────────────

/** The progress fields settlement reads and writes. */
export const PROGRESS_CORE = {
  id: true,
  schoolId: true,
  missionId: true,
  studentId: true,
  status: true,
  progressValue: true,
  goalTarget: true,
  periodStart: true,
  periodEnd: true,
  startedAt: true,
  completedAt: true,
  expiresAt: true,
  pointsAwarded: true,
  badgeAwarded: true,
  seenAt: true,
} satisfies Prisma.MissionProgressSelect;

export type ProgressCore = Prisma.MissionProgressGetPayload<{ select: typeof PROGRESS_CORE }>;

export interface SettleResult {
  progressId: string;
  status: MissionStatus;
  progressValue: number;
  goalTarget: number;
  percent: number;
  justCompleted: boolean;
  pointsAwarded: number;
  badgeAwarded: boolean;
}

/**
 * Re-measures one learner's position on one mission and writes the result.
 *
 * Safe to call as often as you like: a completed or cancelled row is returned
 * untouched, `progressValue` only rises, and the reward path is idempotent because
 * `earnPoints` and `grantBadge` both key off this row's id.
 */
export async function settleProgress(
  mission: MissionCore,
  row: ProgressCore,
  now = new Date(),
): Promise<SettleResult> {
  if (row.status === MissionStatus.COMPLETED || row.status === MissionStatus.CANCELLED) {
    return asResult(row, false);
  }

  /**
   * The round being measured. A recurring mission carries its own bounds; a
   * one-off counts from the day it started, so work done before the mission
   * existed does not finish it on the spot.
   */
  const window: MeasureWindow = {
    from: row.periodStart ?? mission.startsAt,
    to: row.periodEnd ?? mission.endsAt,
  };

  const measured = await measureGoal(mission, row.studentId, window);
  // Never downwards: a recalculation is not a reason to take a bar away.
  const progressValue = Math.max(row.progressValue, measured);
  const reached = progressValue >= row.goalTarget;

  const deadline = row.expiresAt ?? row.periodEnd ?? mission.endsAt;
  const expired = !reached && deadline !== null && deadline <= now;

  const status = reached
    ? MissionStatus.COMPLETED
    : expired
      ? MissionStatus.EXPIRED
      : progressValue > 0
        ? MissionStatus.ACTIVE
        : MissionStatus.NOT_STARTED;

  // A row that was already COMPLETED returned at the top of this function, so
  // reaching the target here is always the first time it has been reached.
  const justCompleted = reached;
  const unchanged = status === row.status && progressValue === row.progressValue;
  if (unchanged) return asResult(row, false);

  const updated = await prisma.missionProgress.update({
    where: { id: row.id },
    data: {
      progressValue,
      status,
      ...(row.startedAt === null && progressValue > 0 ? { startedAt: now } : {}),
      ...(justCompleted ? { completedAt: now } : {}),
    },
    select: PROGRESS_CORE,
  });

  if (!justCompleted) return asResult(updated, false);
  return rewardCompletion(mission, updated, now);
}

/**
 * Points, badge and the "well done" message, in that order. Each step is
 * independently guarded: a badge definition someone archived must not stop the
 * learner being paid, and a notification failure must not lose the badge.
 */
async function rewardCompletion(
  mission: MissionCore,
  row: ProgressCore,
  now: Date,
): Promise<SettleResult> {
  let pointsAwarded = row.pointsAwarded;
  let badgeAwarded = row.badgeAwarded;

  if (mission.pointsReward > 0 && pointsAwarded === 0) {
    try {
      await recordLearningEvent({
        schoolId: mission.schoolId,
        studentId: row.studentId,
        reason: PointsReason.MISSION_COMPLETION,
        points: mission.pointsReward,
        sourceType: 'MissionProgress',
        sourceId: row.id,
        note: `Mission: ${mission.title}`,
        occurredAt: now,
      });
      pointsAwarded = mission.pointsReward;
    } catch (error) {
      log.error({ err: error, missionId: mission.id }, 'Could not credit mission points');
    }
  }

  if (mission.rewardBadgeId && !badgeAwarded) {
    try {
      const badge = await prisma.badge.findFirst({
        where: { id: mission.rewardBadgeId, schoolId: mission.schoolId },
        select: { id: true, key: true, name: true, tier: true, pointsValue: true, criteria: true },
      });
      if (badge) {
        await grantBadge(badge, mission.schoolId, row.studentId, {
          reason: `Completed the mission "${mission.title}"`,
        });
        badgeAwarded = true;
      }
    } catch (error) {
      log.error({ err: error, missionId: mission.id }, 'Could not grant mission badge');
    }
  }

  if (pointsAwarded !== row.pointsAwarded || badgeAwarded !== row.badgeAwarded) {
    await prisma.missionProgress.update({
      where: { id: row.id },
      data: { pointsAwarded, badgeAwarded },
    });
  }

  try {
    await enqueueNotification({
      schoolId: mission.schoolId,
      userId: row.studentId,
      category: NotificationCategory.ACHIEVEMENT_EARNED,
      priority: NotificationPriority.NORMAL,
      title: 'Mission complete',
      body: `You finished "${mission.title}".`,
      actionPath: '/missions',
      actionLabel: 'See it',
      sourceType: 'MissionProgress',
      sourceId: row.id,
      groupKey: `mission.completed:${row.id}`,
    });
  } catch (error) {
    log.error({ err: error, missionId: mission.id }, 'Could not announce mission completion');
  }

  return {
    ...asResult({ ...row, pointsAwarded, badgeAwarded }, true),
  };
}

function asResult(row: ProgressCore, justCompleted: boolean): SettleResult {
  const percent =
    row.goalTarget > 0
      ? Math.min(100, Math.round((row.progressValue / row.goalTarget) * 100))
      : 0;
  return {
    progressId: row.id,
    status: row.status,
    progressValue: row.progressValue,
    goalTarget: row.goalTarget,
    percent,
    justCompleted,
    pointsAwarded: row.pointsAwarded,
    badgeAwarded: row.badgeAwarded,
  };
}
