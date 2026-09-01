// ─────────────────────────────────────────────────────────────────────────────
// Gamification — the seam other modules use
// Everything a learner does that is worth recognising arrives through
// `recordLearningEvent`. That gives the rest of the platform one call instead of
// five, and it keeps the ordering right: points first (the ledger is the record of
// truth), then the habit measure, then any badge the two together have earned, then
// the learner's companion.
//
// Blueprint 03's caution is enforced by the shape of that function: recognition is
// a *consequence* of learning, never a precondition for it. A failure anywhere in
// the gamification chain is logged and swallowed, because a child's completed work
// must be recorded even if their badge is not. The ledger write is the only step
// allowed to fail loudly.
//
// The pieces live in four files — `points.service` (the ledger), `badges.service`
// (definitions and awards), `rewards.service` (the shop), `streaks.service` (habit)
// — with `gamification.rules` interpreting badge criteria. This file only composes
// them.
// ─────────────────────────────────────────────────────────────────────────────

import type { PointsReason} from '@prisma/client';
import { StreakKind } from '@prisma/client';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { growCompanion, growthForLearning } from '../companion/companion.growth';
import { badgeProgressFor } from './badges.service';
import { evaluateBadgesFor } from './gamification.rules';
import { NEUTRAL_INTENSITY } from './learning.points';
import { balanceFor, earnPoints, pointsSummary, reverseSourceEntries } from './points.service';
import { equippedFor } from './rewards.service';
import { recordStreakActivity, streaksFor } from './streaks.service';

const log = logger.child({ module: 'gamification' });

export interface LearningEventInput {
  schoolId: string;
  studentId: string;
  reason: PointsReason;
  /** Zero is allowed: some events count towards a habit without carrying points. */
  points: number;
  sourceType: string;
  sourceId: string;
  note?: string | null;
  occurredAt?: Date;
  /**
   * Whether this counts towards the daily-learning habit. Defaults to true — almost
   * everything a learner does is learning — but a teacher's discretionary award is
   * recognition, not evidence of practice, so it passes false.
   */
  countsAsLearning?: boolean;
  /**
   * Set when the event is a piece of work handed in, so the on-time habit can be
   * measured. Undefined means "not applicable", which is different from false.
   */
  onTime?: boolean;
}

export interface LearningEventResult {
  pointsEntryId: string | null;
  balance: number;
  streaks: { kind: StreakKind; currentLength: number; isPersonalBest: boolean }[];
  badgesAwarded: number;
  /**
   * How the learner's companion responded, or null when they have not adopted one,
   * the school has companions switched off, or this piece of work has already grown
   * it once. Included in the result so the frontend can play the hatching animation
   * on the same response that says "well done".
   */
  companion: {
    stage: string;
    stageChanged: boolean;
    growthPoints: number;
    growthAwarded: number;
  } | null;
}

/**
 * The one call other modules make. Idempotent through `earnPoints`, so a retried
 * request or a re-marked submission does not pay twice.
 */
export async function recordLearningEvent(
  input: LearningEventInput,
): Promise<LearningEventResult> {
  const pointsEntryId = await earnPoints({
    schoolId: input.schoolId,
    studentId: input.studentId,
    reason: input.reason,
    points: input.points,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    note: input.note ?? null,
    occurredAt: input.occurredAt,
  });

  const at = input.occurredAt ?? new Date();
  const streaks: LearningEventResult['streaks'] = [];

  if (input.countsAsLearning !== false) {
    const update = await safely(() =>
      recordStreakActivity(input.schoolId, input.studentId, StreakKind.DAILY_LEARNING, at),
    );
    if (update) {
      streaks.push({
        kind: update.kind,
        currentLength: update.currentLength,
        isPersonalBest: update.isPersonalBest,
      });
    }
  }

  // A late hand-in simply does not extend the on-time run. It is not penalised, and
  // the sweep will close the run out in its own time.
  if (input.onTime === true) {
    const update = await safely(() =>
      recordStreakActivity(input.schoolId, input.studentId, StreakKind.ASSIGNMENT_ON_TIME, at),
    );
    if (update) {
      streaks.push({
        kind: update.kind,
        currentLength: update.currentLength,
        isPersonalBest: update.isPersonalBest,
      });
    }
  }

  const badgesAwarded =
    (await safely(() => evaluateBadgesFor(input.schoolId, input.studentId))) ?? 0;

  /**
   * Blueprint 03: "The companion grows through learning." This is where that
   * sentence is true — not in the companion module, which only lets a learner say
   * hello to it. `once` is set so a re-marked assignment corrects its points without
   * growing the creature twice, and the whole step is swallowed on failure, because
   * a companion that did not grow must never cost a learner their completed work.
   */
  const grown =
    input.countsAsLearning === false
      ? null
      : await safely(() =>
          growCompanion({
            schoolId: input.schoolId,
            studentId: input.studentId,
            growthPoints: growthForLearning(input.points),
            description: input.note ?? 'You did some learning.',
            kind: 'GROWTH',
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            countsAsVisit: true,
            once: true,
          }),
        );

  return {
    pointsEntryId,
    balance: await balanceFor(input.studentId),
    streaks,
    badgesAwarded,
    companion: grown
      ? {
          stage: grown.stage,
          stageChanged: grown.stageChanged,
          growthPoints: grown.growthPoints,
          growthAwarded: growthForLearning(input.points),
        }
      : null,
  };
}

/**
 * The school's earning dial, with the column default when the school has no settings
 * row — the same fallback `companion.growth` uses for its own two switches. Lives
 * here rather than in `learning.points` so those amounts stay pure and testable.
 */
export async function intensityFor(schoolId: string): Promise<number> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: { gamificationIntensity: true },
  });
  return settings?.gamificationIntensity ?? NEUTRAL_INTENSITY;
}

/**
 * The mirror: work withdrawn, a submission un-marked. Reverses the points through
 * the ledger and leaves the streak alone — the learner genuinely did the work on the
 * day they did it, and taking a day back off a habit measure would be a punishment.
 */export async function reverseLearningEvent(
  schoolId: string,
  sourceType: string,
  sourceId: string,
  note: string,
  reversedById?: string | null,
): Promise<number> {
  return reverseSourceEntries(schoolId, sourceType, sourceId, note, reversedById);
}

/**
 * Sets the points for one source event to an exact figure, whatever was credited
 * before. This is the re-marking path: a teacher who revises a score should change
 * the balance, and the ledger should read as a correction rather than a second award.
 *
 * When the figure already matches, nothing is written at all — so a teacher adding a
 * comment without touching the mark does not churn the ledger.
 */
export async function settleLearningPoints(
  input: LearningEventInput & { reversalNote?: string; reversedById?: string | null },
): Promise<LearningEventResult> {
  const live = await prisma.pointsLedger.aggregate({
    where: {
      studentId: input.studentId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversedAt: null,
      reversesEntryId: null,
    },
    _sum: { points: true },
  });
  const credited = live._sum.points ?? 0;

  if (credited === input.points) {
    return {
      pointsEntryId: null,
      balance: await balanceFor(input.studentId),
      streaks: [],
      badgesAwarded: 0,
      companion: null,
    };
  }

  if (credited !== 0) {
    await reverseSourceEntries(
      input.schoolId,
      input.sourceType,
      input.sourceId,
      input.reversalNote ?? 'Re-marked, points corrected',
      input.reversedById ?? null,
    );
  }
  return recordLearningEvent(input);
}

/** Swallows a gamification failure so it cannot undo a learner's completed work. */
async function safely<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    log.error({ err: error }, 'Gamification step failed and was skipped');
    return null;
  }
}

// ── The learner's own view ──────────────────────────────────────────────────

/**
 * Everything the achievements screen needs, in one request: balance and where it
 * came from, badges held and next to aim for, streaks, and what is being worn.
 */
export async function gamificationProfile(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const points = await pointsSummary(context, schoolId, requestedStudentId);
  const studentId = points.studentId;

  const [badges, streaks, equipped] = await Promise.all([
    badgeProgressFor(context, schoolId, studentId),
    streaksFor(context, schoolId, studentId),
    equippedFor(studentId),
  ]);

  return {
    studentId,
    points: {
      balance: points.balance,
      earnedThisWeek: points.earnedThisWeek,
      byReason: points.byReason,
      recent: points.recent,
    },
    badges: {
      earned: badges.earned,
      unseen: badges.unseen,
      available: badges.available,
    },
    streaks: streaks.streaks,
    equipped,
  };
}

// ── The administrator's view ────────────────────────────────────────────────

/**
 * What is configured in this school, for the admin panel's gamification page. Counts
 * only — the lists have their own paginated endpoints.
 */
export async function gamificationConfigSummary(schoolId: string) {
  const [badges, effortBadges, rewards, freeRewards, awards, grants, ledger] =
    await prisma.$transaction([
      prisma.badge.count({ where: { schoolId, archivedAt: null } }),
      prisma.badge.count({ where: { schoolId, archivedAt: null, recognisesEffort: true } }),
      prisma.reward.count({ where: { schoolId, archivedAt: null } }),
      prisma.reward.count({ where: { schoolId, archivedAt: null, pointsCost: 0 } }),
      prisma.studentBadge.count({ where: { schoolId, revokedAt: null } }),
      prisma.studentReward.count({ where: { schoolId } }),
      prisma.pointsLedger.aggregate({ where: { schoolId }, _sum: { points: true } }),
    ]);

  return {
    badges: { total: badges, recognisingEffort: effortBadges },
    rewards: { total: rewards, grantedByRule: freeRewards },
    awards: { badges: awards, rewards: grants },
    pointsInCirculation: ledger._sum.points ?? 0,
  };
}
