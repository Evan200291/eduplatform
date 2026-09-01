// ─────────────────────────────────────────────────────────────────────────────
// Badge rules engine
// Blueprint 03: "effort and improvement are recognised, not only attainment."
// A badge therefore carries a machine-checkable `criteria` object, and this file
// is the only place that interprets it. Adding a criterion means adding a case
// here and a variant to `badgeCriteriaSchema` — nowhere else.
//
// The award primitive lives here too, so a badge granted by the engine and a badge
// granted by a teacher are written identically: one `StudentBadge` row, one ledger
// entry when the badge carries points, one notification. The only difference is
// `awardedById`, which the schema documents as "null when awarded automatically by
// the rules engine".
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  MasteryLevel,
  NotificationCategory,
  NotificationPriority,
  PathItemStatus,
  PointsReason,
  type BadgeTier,
} from '@prisma/client';
import { AssignmentState } from '@prisma/client';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { enqueueNotification } from '../notifications/notifications.service';
import { balanceFor, earnPoints } from './points.service';
import { badgeCriteriaSchema, type BadgeCriteria } from './gamification.validation';

const log = logger.child({ module: 'gamification.rules' });

/** Mastery levels that count as "at or above" each threshold the schema allows. */
const AT_OR_ABOVE: Record<string, MasteryLevel[]> = {
  [MasteryLevel.DEVELOPING]: [
    MasteryLevel.DEVELOPING,
    MasteryLevel.PROFICIENT,
    MasteryLevel.MASTERED,
  ],
  [MasteryLevel.PROFICIENT]: [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED],
  [MasteryLevel.MASTERED]: [MasteryLevel.MASTERED],
};

export interface AwardableBadge {
  id: string;
  key: string;
  name: string;
  tier: BadgeTier;
  pointsValue: number;
  criteria: Prisma.JsonValue;
}

/**
 * Reads a stored `criteria` column. Returns `null` when it does not parse, which
 * is treated as "never awards" rather than "always awards" — a broken rule must
 * not hand out badges, and the log line names the badge so it can be fixed.
 */
export function readCriteria(badgeId: string, raw: Prisma.JsonValue): BadgeCriteria | null {
  const parsed = badgeCriteriaSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log.warn({ badgeId }, 'Badge criteria could not be read; the badge will not be awarded');
  return null;
}

/**
 * Does this learner meet the rule right now?
 *
 * Every branch is a count or a comparison against evidence the learner has already
 * produced, so the answer is reproducible: running the engine twice never changes
 * the outcome, which is what makes the hourly sweep safe.
 */
export async function meetsCriteria(
  schoolId: string,
  studentId: string,
  criteria: BadgeCriteria,
): Promise<boolean> {
  switch (criteria.type) {
    case 'manual':
      // Only a person awards these. The engine must never guess.
      return false;

    case 'points':
      return (await balanceFor(studentId)) >= criteria.threshold;

    case 'streak': {
      const streak = await prisma.streak.findUnique({
        where: { studentId_kind: { studentId, kind: criteria.kind } },
        select: { longestLength: true },
      });
      // Measured against the personal best, not the current run: blueprint 03 says
      // a broken streak "keeps its personal best", so an earned badge stays earned.
      return (streak?.longestLength ?? 0) >= criteria.days;
    }

    case 'activities': {
      const count = await prisma.progressRecord.count({
        where: { schoolId, studentId, status: PathItemStatus.COMPLETED },
      });
      return count >= criteria.count;
    }

    case 'assignments': {
      const count = await prisma.assignmentAttempt.count({
        where: {
          schoolId,
          studentId,
          state: { in: [AssignmentState.SUBMITTED, AssignmentState.COMPLETED] },
          ...(criteria.onTimeOnly ? { isLate: false } : {}),
        },
      });
      return count >= criteria.count;
    }

    case 'mastery': {
      const count = await prisma.masteryRecord.count({
        where: { schoolId, studentId, level: { in: AT_OR_ABOVE[criteria.minLevel] ?? [] } },
      });
      return count >= criteria.count;
    }

    case 'improvement':
      return await hasImproved(schoolId, studentId, criteria.gainPercent);

    default:
      return false;
  }
}

/**
 * Improvement on any single topic, measured from `TopicEvaluation` history: the
 * learner's earliest accuracy on a topic against their latest.
 *
 * Evaluations are the right source because the schema keeps superseded rows
 * deliberately — "keeping the history intact" — so the first attempt is still
 * there to compare against months later.
 */
async function hasImproved(
  schoolId: string,
  studentId: string,
  gainPercent: number,
): Promise<boolean> {
  const evaluations = await prisma.topicEvaluation.findMany({
    where: { schoolId, studentId },
    select: { topicId: true, accuracyPercent: true, evaluatedAt: true },
    orderBy: { evaluatedAt: 'asc' },
    // Bounded: a learner with thousands of evaluations does not need all of them
    // to answer "did you improve by 20 points somewhere?".
    take: 500,
  });

  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const row of evaluations) {
    if (!first.has(row.topicId)) first.set(row.topicId, row.accuracyPercent);
    last.set(row.topicId, row.accuracyPercent);
  }
  for (const [topicId, start] of first) {
    const end = last.get(topicId) ?? start;
    if (end - start >= gainPercent) return true;
  }
  return false;
}

// ── Awarding ────────────────────────────────────────────────────────────────

export interface GrantResult {
  studentBadgeId: string;
  alreadyHeld: boolean;
  pointsEntryId: string | null;
}

/**
 * Writes one award. The single place a `StudentBadge` row is created, so the
 * points entry and the notification can never be forgotten by a caller.
 *
 * Idempotent by `@@unique([studentId, badgeId])`: a learner holds a badge once. A
 * previously revoked award is restored rather than duplicated, because the pair
 * (student, badge) is the identity and re-earning it is the same achievement.
 */
export async function grantBadge(
  badge: AwardableBadge,
  schoolId: string,
  studentId: string,
  options: { awardedById?: string | null; reason?: string | null; notify?: boolean } = {},
): Promise<GrantResult> {
  const existing = await prisma.studentBadge.findUnique({
    where: { studentId_badgeId: { studentId, badgeId: badge.id } },
    select: { id: true, revokedAt: true },
  });

  if (existing && !existing.revokedAt) {
    return { studentBadgeId: existing.id, alreadyHeld: true, pointsEntryId: null };
  }

  const awardedById = options.awardedById ?? null;
  const award = existing
    ? await prisma.studentBadge.update({
        where: { id: existing.id },
        data: {
          awardedAt: new Date(),
          awardedById,
          reason: options.reason ?? null,
          revokedAt: null,
          revokedById: null,
          seenAt: null,
        },
        select: { id: true },
      })
    : await prisma.studentBadge.create({
        data: {
          schoolId,
          studentId,
          badgeId: badge.id,
          awardedById,
          reason: options.reason ?? null,
        },
        select: { id: true },
      });

  // The badge's own points, credited through the ledger like everything else.
  // `sourceId` is the award row, so revoking this badge reverses exactly these
  // points and nothing else.
  const pointsEntryId =
    badge.pointsValue > 0
      ? await earnPoints({
          schoolId,
          studentId,
          reason: PointsReason.BADGE_AWARD,
          points: badge.pointsValue,
          sourceType: 'StudentBadge',
          sourceId: award.id,
          note: `Badge earned: ${badge.name}`,
        })
      : null;

  if (options.notify !== false) {
    await enqueueNotification({
      schoolId,
      userId: studentId,
      category: NotificationCategory.BADGE_EARNED,
      priority: NotificationPriority.NORMAL,
      title: `You earned ${badge.name}`,
      body: options.reason ?? `Well done — the ${badge.name} badge is yours.`,
      actionPath: '/achievements',
      actionLabel: 'See it',
      sourceType: 'StudentBadge',
      sourceId: award.id,
      groupKey: `badge.earned:${award.id}`,
    });
  }

  return { studentBadgeId: award.id, alreadyHeld: false, pointsEntryId };
}

/**
 * Checks every automatic badge in the school against one learner and awards what
 * they have earned. Called after evidence changes (a submission marked, a streak
 * extended) and by the hourly sweep as a safety net.
 *
 * Manual badges are excluded by `meetsCriteria` returning false for them, so a
 * teacher's recognition is never handed out by a rule.
 */
export async function evaluateBadgesFor(schoolId: string, studentId: string): Promise<number> {
  const [badges, held] = await Promise.all([
    prisma.badge.findMany({
      where: { schoolId, isActive: true, archivedAt: null },
      select: { id: true, key: true, name: true, tier: true, pointsValue: true, criteria: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.studentBadge.findMany({
      where: { studentId, revokedAt: null },
      select: { badgeId: true },
    }),
  ]);

  const owned = new Set(held.map((row) => row.badgeId));
  let awarded = 0;

  for (const badge of badges) {
    if (owned.has(badge.id)) continue;
    const criteria = readCriteria(badge.id, badge.criteria);
    if (!criteria || criteria.type === 'manual') continue;

    try {
      if (!(await meetsCriteria(schoolId, studentId, criteria))) continue;
      const result = await grantBadge(badge, schoolId, studentId, { awardedById: null });
      if (!result.alreadyHeld) awarded += 1;
    } catch (error) {
      // One unreadable badge must not stop the rest from being awarded.
      log.error({ err: error, badgeId: badge.id, studentId }, 'Badge evaluation failed');
    }
  }

  return awarded;
}
