// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard ranking
// The measurement half of the module: who is on a board, what their figure is, and
// what name is shown beside it.
//
// Blueprint 03 says schools "may choose alternative cooperative or personal-best
// rankings", and this file treats those two as the interesting cases rather than as
// fallbacks:
//
//   • PERSONAL_BEST scores the learner against their own previous window, so the
//     child who improved most is top even if the child with the highest total sits
//     below them. It is the schema's default for a reason.
//   • COOPERATIVE_TEAM gives every participant the group's combined figure and the
//     same rank. On a cooperative board nobody is ahead of anybody, which is the
//     entire point of offering one.
//
// Identity labelling is here too, because the label is part of the standing: an
// ANONYMOUS_RANK board must never have a real name reach the database, not merely
// avoid rendering one. What is stored is what could leak.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  LeaderboardIdentityMode,
  LeaderboardRankingMode,
  LeaderboardScope,
  MasteryLevel,
  PathItemStatus
} from '@prisma/client';
import { prisma } from '../../core/prisma';
import {
  classStudentIds,
  gradeStudentIds,
  groupStudentIds,
  subjectStudentIds,
} from '../../core/rbac/scope.service';
import { MS_PER_DAY, rollingWindow } from '../../core/utils/dates';

/** Mastery that counts as gained ground for a MASTERY_GAIN board. */
const MASTERED_ENOUGH: MasteryLevel[] = [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED];

export const CONFIG_CORE = {
  id: true,
  schoolId: true,
  name: true,
  scope: true,
  scopeId: true,
  identityMode: true,
  rankingMode: true,
  isActive: true,
  periodDays: true,
  minParticipants: true,
  showTopN: true,
  allowOptOut: true,
  startsAt: true,
  endsAt: true,
  archivedAt: true,
} satisfies Prisma.LeaderboardConfigurationSelect;

export type ConfigCore = Prisma.LeaderboardConfigurationGetPayload<{
  select: typeof CONFIG_CORE;
}>;

export interface Window {
  start: Date;
  end: Date;
}

/**
 * The window a board is currently measuring.
 *
 * All-time boards (`periodDays: null`) still need a concrete `periodStart`, because
 * it is part of the entry's unique key. They use the board's own start date, which
 * makes every recompute land on the same row instead of creating a new one per run.
 */
export function windowFor(config: ConfigCore, now = new Date()): Window {
  if (config.periodDays === null) {
    return { start: config.startsAt ?? new Date(0), end: config.endsAt ?? now };
  }
  const { start, end } = rollingWindow(config.periodDays, now);
  return { start, end: config.endsAt && config.endsAt < end ? config.endsAt : end };
}

/** The window immediately before this one, for measuring improvement. */
export function previousWindow(current: Window): Window {
  const span = Math.max(MS_PER_DAY, current.end.getTime() - current.start.getTime());
  return {
    start: new Date(current.start.getTime() - span),
    end: new Date(current.start.getTime()),
  };
}

// ── Who is on the board ─────────────────────────────────────────────────────

/**
 * The cohort. A board covers a class, a grade, a subject, a group or the whole
 * school; an EVENT board is ad hoc and covers whoever is in the school unless it
 * names a group.
 */
export async function participantsFor(config: ConfigCore): Promise<string[]> {
  switch (config.scope) {
    case LeaderboardScope.CLASS:
      return config.scopeId ? classStudentIds(config.scopeId) : [];
    case LeaderboardScope.GRADE:
      return config.scopeId ? gradeStudentIds(config.schoolId, config.scopeId) : [];
    case LeaderboardScope.SUBJECT:
      return config.scopeId ? subjectStudentIds(config.schoolId, config.scopeId) : [];
    case LeaderboardScope.COHORT:
      return config.scopeId ? groupStudentIds(config.scopeId) : [];
    case LeaderboardScope.EVENT:
      return config.scopeId ? groupStudentIds(config.scopeId) : schoolLearners(config.schoolId);
    case LeaderboardScope.SCHOOL:
    default:
      return schoolLearners(config.schoolId);
  }
}

async function schoolLearners(schoolId: string): Promise<string[]> {
  const learners = await prisma.user.findMany({
    where: { schoolId, primaryRole: 'STUDENT', archivedAt: null },
    select: { id: true },
  });
  return learners.map((learner) => learner.id);
}

// ── What their figure is ────────────────────────────────────────────────────

/**
 * Every participant's score for the window, keyed by student id. One query per board
 * rather than one per learner: a school board can hold hundreds of children and a
 * per-learner loop would make the hourly job quadratic in enrolment.
 */
export async function scoresFor(
  config: ConfigCore,
  studentIds: string[],
  window: Window,
): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();

  switch (config.rankingMode) {
    case LeaderboardRankingMode.MASTERY_GAIN: {
      // Prisma's `groupBy` result has to land in a variable before it is passed on:
      // handing the call straight to a function confuses its overload inference.
      const rows = await prisma.masteryRecord.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          level: { in: MASTERED_ENOUGH },
          lastEvidenceAt: { gte: window.start, lte: window.end },
        },
        _count: { _all: true },
        orderBy: { studentId: 'asc' },
      });
      return countBy(rows);
    }

    case LeaderboardRankingMode.ACTIVITY_COUNT: {
      const rows = await prisma.progressRecord.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          status: PathItemStatus.COMPLETED,
          completedAt: { gte: window.start, lte: window.end },
        },
        _count: { _all: true },
        orderBy: { studentId: 'asc' },
      });
      return countBy(rows);
    }

    case LeaderboardRankingMode.PERSONAL_BEST: {
      // Improvement, not attainment. A learner who went from 20 to 60 is ahead of one
      // who went from 400 to 410, which is the only ranking a struggling child can
      // ever win — and blueprint 03 wants that ranking to be available.
      const [current, before] = await Promise.all([
        pointsBy(studentIds, window),
        pointsBy(studentIds, previousWindow(window)),
      ]);
      const gains = new Map<string, number>();
      for (const studentId of studentIds) {
        const gain = (current.get(studentId) ?? 0) - (before.get(studentId) ?? 0);
        gains.set(studentId, Math.max(0, gain));
      }
      return gains;
    }

    case LeaderboardRankingMode.COOPERATIVE_TEAM: {
      // One figure, shared. Everybody sees what the group achieved together.
      const points = await pointsBy(studentIds, window);
      let team = 0;
      for (const value of points.values()) team += value;
      return new Map(studentIds.map((studentId) => [studentId, team]));
    }

    case LeaderboardRankingMode.POINTS:
    default:
      return pointsBy(studentIds, window);
  }
}

/**
 * Points earned in the window. Reversals are excluded on both sides — the original
 * entry once it has been cancelled, and the negative entry that cancelled it — so a
 * corrected mark leaves no trace in a standing rather than showing as a deduction.
 */
async function pointsBy(studentIds: string[], window: Window): Promise<Map<string, number>> {
  const rows = await prisma.pointsLedger.groupBy({
    by: ['studentId'],
    where: {
      studentId: { in: studentIds },
      occurredAt: { gte: window.start, lte: window.end },
      reversedAt: null,
      reversesEntryId: null,
    },
    _sum: { points: true },
    orderBy: { studentId: 'asc' },
  });

  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.studentId, Math.max(0, row._sum.points ?? 0));
  return totals;
}

function countBy(rows: { studentId: string; _count: { _all: number } }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.studentId, row._count._all);
  return totals;
}

// ── What is shown beside it ─────────────────────────────────────────────────

export interface Named {
  id: string;
  displayName: string;
  firstName: string;
  nickname: string | null;
}

/**
 * The label that is stored. On an ANONYMOUS_RANK board this is "Learner 4" and the
 * child's name never reaches the table, so an export, a screenshot or a leaked query
 * cannot reveal what the school chose not to publish.
 */
export function labelFor(
  mode: LeaderboardIdentityMode,
  learner: Named | undefined,
  position: number,
): string {
  if (!learner) return `Learner ${position}`;
  switch (mode) {
    case LeaderboardIdentityMode.REAL_NAME:
      return learner.displayName.slice(0, 120);
    case LeaderboardIdentityMode.NICKNAME:
      // Falling back to a first name, not the full one: a school that asked for
      // nicknames has already said it does not want surnames on a wall.
      return (learner.nickname ?? learner.firstName).slice(0, 120);
    case LeaderboardIdentityMode.AVATAR_ONLY:
      return (learner.nickname ?? learner.firstName).slice(0, 120);
    case LeaderboardIdentityMode.ANONYMOUS_RANK:
    default:
      return `Learner ${position}`;
  }
}

/**
 * Standard competition ranking: equal scores share a rank and the next distinct
 * score skips. Two children on the same figure being told they are 3rd and 4th is
 * an arbitrary insult, so they are both 3rd.
 *
 * A cooperative board is the exception and everyone is first, which is handled by
 * the caller because it is a property of the board rather than of the arithmetic.
 */
export function rankScores(entries: { studentId: string; score: number }[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  let rank = 0;
  let seen = 0;
  let lastScore: number | null = null;

  for (const entry of sorted) {
    seen += 1;
    if (lastScore === null || entry.score !== lastScore) {
      rank = seen;
      lastScore = entry.score;
    }
    ranks.set(entry.studentId, rank);
  }
  return ranks;
}
