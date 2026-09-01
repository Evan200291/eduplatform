// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard service
// Blueprint 03: leaderboards are off by default, identity display is configurable,
// small boards are hidden, and a learner can always opt out.
//
// Those four sentences are enforced in four different places, and it is worth naming
// which is which because they fail in different ways:
//
//   • Off by default — `SchoolSettings.leaderboardEnabled` gates the whole module,
//     and a new board is created inactive. Two switches, both starting closed.
//   • Identity — decided at recompute time by `labelFor`, so an anonymous board never
//     has a real name in the table at all. A read-time redaction would still leave the
//     name sitting in the database waiting for the next export.
//   • Small boards — enforced at read time rather than at recompute, so a board that
//     was too small becomes visible the moment a sixth learner joins instead of an
//     hour later.
//   • Opt-out — `LeaderboardEntry.isHidden`, carried forward by every recompute. There
//     is no per-school switch to disable opting out; the validator refuses it.
//
// The standings are materialised by `recomputeAllLeaderboards` on the hourly job, so
// reading a board never scans the points ledger. A learner always sees their own row,
// hidden or not, and beyond the published top N they see their own position and
// nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { diffRecords, recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { conflict, featureDisabled, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { resolveStudent } from '../gamification/points.service';
import {
  CONFIG_CORE,
  type ConfigCore,
  labelFor,
  participantsFor,
  rankScores,
  scoresFor,
  windowFor,
  type Window,
} from './leaderboard.ranking';
import type {
  BoardQuery,
  CreateLeaderboardInput,
  LeaderboardListQuery,
  OptOutInput,
  UpdateLeaderboardInput,
} from './leaderboard.validation';

const log = logger.child({ module: 'leaderboard' });

/** The most learners one board will rank. Beyond this the board is not the tool. */
const COHORT_CAP = 2_000;

/** Rows written per statement, so one enormous school does not build one enormous query. */
const WRITE_BATCH = 200;

const CONFIG_SELECT = {
  ...CONFIG_CORE,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  _count: { select: { entries: true } },
} satisfies Prisma.LeaderboardConfigurationSelect;

// ── Configuration ───────────────────────────────────────────────────────────

/** Every board a school has defined, including the ones still switched off. */
export async function listBoards(
  _context: ActorContext,
  schoolId: string,
  query: LeaderboardListQuery,
) {
  const where: Prisma.LeaderboardConfigurationWhereInput = { schoolId };
  if (query.scope) where.scope = query.scope;
  if (query.scopeId) where.scopeId = query.scopeId;
  if (query.activeOnly) where.isActive = true;
  if (!query.includeArchived) where.archivedAt = null;
  if (query.search) where.name = { contains: query.search };

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.leaderboardConfiguration.findMany({
      where,
      select: CONFIG_SELECT,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    prisma.leaderboardConfiguration.count({ where }),
  ]);

  return { items, totalItems };
}

async function requireConfig(schoolId: string, configId: string): Promise<ConfigCore> {
  const config = await prisma.leaderboardConfiguration.findFirst({
    where: { id: configId, schoolId },
    select: CONFIG_CORE,
  });
  if (!config) throw notFound('Leaderboard');
  return config;
}

/**
 * Creating a board. It arrives switched off — `isActive` is not in the create schema
 * at all — so publishing one is always a second, deliberate act.
 */
export async function createBoard(
  context: ActorContext,
  schoolId: string,
  input: CreateLeaderboardInput,
) {
  await assertEnabled(schoolId);

  const clash = await prisma.leaderboardConfiguration.findFirst({
    where: { schoolId, name: input.name, archivedAt: null },
    select: { id: true },
  });
  if (clash) throw conflict('A board with that name already exists.');

  const config = await prisma.leaderboardConfiguration.create({
    data: {
      schoolId,
      name: input.name,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
      identityMode: input.identityMode,
      rankingMode: input.rankingMode,
      periodDays: input.periodDays === undefined ? 7 : input.periodDays,
      ...(input.minParticipants !== undefined ? { minParticipants: input.minParticipants } : {}),
      ...(input.showTopN !== undefined ? { showTopN: input.showTopN } : {}),
      allowOptOut: true,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdById: context.actor.userId,
    },
    select: CONFIG_SELECT,
  });

  recordAudit(context, {
    schoolId,
    action: 'leaderboard.configure',
    targetType: 'LeaderboardConfiguration',
    targetId: config.id,
    summary: `Created the leaderboard "${config.name}" (inactive)`,
    afterData: {
      scope: config.scope,
      identityMode: config.identityMode,
      rankingMode: config.rankingMode,
    },
  });

  return config;
}

/**
 * Editing, including publishing. Anything that changes what the figures mean — the
 * ranking mode, the window, the cohort, the identity mode — triggers an immediate
 * recompute, because leaving yesterday's standings under a new heading would be a
 * quiet lie about what the numbers are.
 */
export async function updateBoard(
  context: ActorContext,
  schoolId: string,
  configId: string,
  input: UpdateLeaderboardInput,
) {
  await assertEnabled(schoolId);
  const before = await requireConfig(schoolId, configId);

  const after = await prisma.leaderboardConfiguration.update({
    where: { id: configId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.scopeId !== undefined ? { scopeId: input.scopeId } : {}),
      ...(input.identityMode !== undefined ? { identityMode: input.identityMode } : {}),
      ...(input.rankingMode !== undefined ? { rankingMode: input.rankingMode } : {}),
      ...(input.periodDays !== undefined ? { periodDays: input.periodDays } : {}),
      ...(input.minParticipants !== undefined ? { minParticipants: input.minParticipants } : {}),
      ...(input.showTopN !== undefined ? { showTopN: input.showTopN } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: CONFIG_SELECT,
  });

  recordAudit(context, {
    schoolId,
    action: 'leaderboard.configure',
    targetType: 'LeaderboardConfiguration',
    targetId: configId,
    summary: `Updated the leaderboard "${after.name}"`,
    beforeData: { name: before.name, isActive: before.isActive },
    afterData: diffRecords(before, after),
  });

  const meaningChanged =
    input.rankingMode !== undefined ||
    input.periodDays !== undefined ||
    input.scope !== undefined ||
    input.scopeId !== undefined ||
    input.identityMode !== undefined;

  if (meaningChanged || input.isActive === true) {
    const fresh = await requireConfig(schoolId, configId);
    await recomputeBoard(fresh).catch((error) =>
      log.error({ err: error, configId }, 'Could not recompute after a configuration change'),
    );
  }

  return after;
}

/**
 * Archiving. The standings are kept: a learner who was proud of a position in March
 * should still be able to find it, and deleting a board would take that away.
 */
export async function archiveBoard(context: ActorContext, schoolId: string, configId: string) {
  const config = await requireConfig(schoolId, configId);

  const archived = await prisma.leaderboardConfiguration.update({
    where: { id: configId },
    data: { archivedAt: new Date(), isActive: false },
    select: CONFIG_SELECT,
  });

  recordAudit(context, {
    schoolId,
    action: 'leaderboard.configure',
    targetType: 'LeaderboardConfiguration',
    targetId: configId,
    summary: `Archived the leaderboard "${config.name}"`,
    afterData: { archivedAt: archived.archivedAt },
  });

  return archived;
}

async function assertEnabled(schoolId: string): Promise<void> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: { leaderboardEnabled: true },
  });
  // The column defaults to false, and a school with no settings row has not turned
  // leaderboards on. Off is the safe reading of silence here.
  if (!settings?.leaderboardEnabled) throw featureDisabled('leaderboard');
}

// ── Reading a board ─────────────────────────────────────────────────────────

/**
 * The standing.
 *
 * Three rules apply on the way out, in this order: a board with too few participants
 * shows nobody at all; beyond the published top N a learner sees only their own row;
 * and a learner who opted out is absent from everybody's list except their own.
 */
export async function getBoard(
  context: ActorContext,
  schoolId: string,
  configId: string,
  query: BoardQuery,
) {
  await assertEnabled(schoolId);
  const config = await requireConfig(schoolId, configId);
  const viewer = await resolveStudent(context, schoolId, query.studentId).catch(() => null);
  const window = windowFor(config);

  const entries = await prisma.leaderboardEntry.findMany({
    where: { configId, periodStart: window.start },
    orderBy: [{ rank: 'asc' }, { score: 'desc' }],
    select: {
      studentId: true,
      score: true,
      rank: true,
      previousRank: true,
      displayLabel: true,
      isHidden: true,
      computedAt: true,
    },
  });

  const participantCount = entries.length;
  const mine = viewer ? entries.find((entry) => entry.studentId === viewer) ?? null : null;

  if (participantCount < config.minParticipants) {
    return {
      board: summarise(config, window, participantCount),
      // Blueprint 03: a board too small to be a board is a public notice about the
      // few children on it, so it publishes nothing — not even to them.
      standings: [],
      mine: mine ? own(mine) : null,
      hiddenReason: 'TOO_FEW_PARTICIPANTS' as const,
    };
  }

  const visible = entries.filter((entry) => !entry.isHidden);
  const published = visible.slice(0, Math.min(config.showTopN, query.limit));

  return {
    board: summarise(config, window, participantCount),
    standings: published.map((entry) => ({
      rank: entry.rank,
      previousRank: entry.previousRank,
      movement: entry.previousRank === null ? null : entry.previousRank - entry.rank,
      score: entry.score,
      label: entry.displayLabel,
      // The viewer's own row is the only one that is ever identified as somebody's.
      isMe: viewer !== null && entry.studentId === viewer,
    })),
    mine: mine ? own(mine) : null,
    hiddenReason: null,
  };
}

function own(entry: {
  rank: number;
  previousRank: number | null;
  score: number;
  displayLabel: string;
  isHidden: boolean;
}) {
  return {
    rank: entry.rank,
    previousRank: entry.previousRank,
    movement: entry.previousRank === null ? null : entry.previousRank - entry.rank,
    score: entry.score,
    label: entry.displayLabel,
    optedOut: entry.isHidden,
  };
}

function summarise(config: ConfigCore, window: Window, participantCount: number) {
  return {
    id: config.id,
    name: config.name,
    scope: config.scope,
    scopeId: config.scopeId,
    identityMode: config.identityMode,
    rankingMode: config.rankingMode,
    isActive: config.isActive,
    periodDays: config.periodDays,
    periodStart: window.start,
    periodEnd: window.end,
    showTopN: config.showTopN,
    minParticipants: config.minParticipants,
    participantCount,
  };
}

/**
 * Where the learner stands across every active board, for their own screen. Boards
 * they have opted out of are included with `optedOut: true`, because hiding the fact
 * that they opted out would make the choice impossible to reverse from the UI.
 */
export async function myStandings(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const configs = await prisma.leaderboardConfiguration.findMany({
    where: { schoolId, isActive: true, archivedAt: null },
    select: CONFIG_CORE,
    take: 50,
  });

  const standings = [];
  for (const config of configs) {
    const window = windowFor(config);
    const [entry, participantCount] = await Promise.all([
      prisma.leaderboardEntry.findFirst({
        where: { configId: config.id, studentId, periodStart: window.start },
        select: {
          rank: true,
          previousRank: true,
          score: true,
          displayLabel: true,
          isHidden: true,
        },
      }),
      prisma.leaderboardEntry.count({ where: { configId: config.id, periodStart: window.start } }),
    ]);
    if (!entry) continue;
    standings.push({
      board: summarise(config, window, participantCount),
      ...own(entry),
    });
  }

  return { studentId, standings };
}

/**
 * Blueprint 03's opt-out, and the learner's own decision to make.
 *
 * Staff can read a board but cannot make this choice on a learner's behalf: an
 * opt-out imposed by an adult is not an opt-out. The row is kept either way, so the
 * learner can still see their own position while nobody else can.
 */
export async function setOptOut(
  context: ActorContext,
  schoolId: string,
  configId: string,
  input: OptOutInput,
) {
  const config = await requireConfig(schoolId, configId);
  const studentId = await resolveStudent(context, schoolId, undefined);
  if (studentId !== context.actor.userId) {
    throw forbidden('Only the learner can choose whether they appear on a leaderboard.');
  }
  if (!config.allowOptOut && input.hidden) {
    // Defensive: the validator refuses to switch `allowOptOut` off, so this should be
    // unreachable. If a hand-edited row ever makes it reachable, the learner wins.
    log.warn({ configId }, 'A board has opt-out disabled; honouring the learner anyway');
  }

  const window = windowFor(config);
  const result = await prisma.leaderboardEntry.updateMany({
    where: { configId, studentId },
    data: { isHidden: input.hidden },
  });

  return {
    configId,
    studentId,
    optedOut: input.hidden,
    entriesUpdated: result.count,
    periodStart: window.start,
  };
}

// ── Recomputing ─────────────────────────────────────────────────────────────

/**
 * The hourly job. Every active, unarchived, in-date board in every school.
 *
 * Returns the number of boards recomputed, which is what the job runner logs. A
 * board that throws is logged and skipped: one broken cohort must not stop the rest
 * of the platform's standings from being current.
 */
export async function recomputeAllLeaderboards(): Promise<number> {
  const now = new Date();
  const configs = await prisma.leaderboardConfiguration.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: CONFIG_CORE,
  });

  let done = 0;
  for (const config of configs) {
    try {
      await recomputeBoard(config, now);
      done += 1;
    } catch (error) {
      log.error({ err: error, configId: config.id }, 'Could not recompute a leaderboard');
    }
  }
  return done;
}

/**
 * Recomputing one board on demand, for the administrator who has just changed a
 * setting and wants to see the effect before publishing. Same work as the job does,
 * scoped to one board and to the caller's school.
 */
export async function recomputeOne(
  _context: ActorContext,
  schoolId: string,
  configId: string,
): Promise<number> {
  await assertEnabled(schoolId);
  const config = await requireConfig(schoolId, configId);
  return recomputeBoard(config);
}

/**
 * One board's standings, for the window it is currently measuring.
 *
 * Two things are carried forward rather than recomputed: a learner's opt-out, because
 * it is a standing decision and not a property of this week's figures, and their
 * previous rank, so the board can show movement.
 */
export async function recomputeBoard(config: ConfigCore, now = new Date()): Promise<number> {
  const window = windowFor(config, now);
  const cohort = (await participantsFor(config)).slice(0, COHORT_CAP);
  if (cohort.length === 0) {
    await prisma.leaderboardEntry.deleteMany({
      where: { configId: config.id, periodStart: window.start },
    });
    return 0;
  }

  const scores = await scoresFor(config, cohort, window);
  const cooperative = config.rankingMode === 'COOPERATIVE_TEAM';
  const rows = cohort.map((studentId) => ({ studentId, score: scores.get(studentId) ?? 0 }));
  const ranks = cooperative
    ? new Map(cohort.map((studentId) => [studentId, 1]))
    : rankScores(rows);

  const [learners, history] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: cohort } },
      select: { id: true, displayName: true, firstName: true, nickname: true },
    }),
    priorEntries(config.id, window.start),
  ]);
  const named = new Map(learners.map((learner) => [learner.id, learner]));

  // A learner who has left the class stops appearing, without touching the periods
  // they were part of.
  await prisma.leaderboardEntry.deleteMany({
    where: { configId: config.id, periodStart: window.start, studentId: { notIn: cohort } },
  });

  const ordered = [...rows].sort((a, b) => b.score - a.score);
  for (let index = 0; index < ordered.length; index += WRITE_BATCH) {
    const batch = ordered.slice(index, index + WRITE_BATCH);
    await Promise.all(
      batch.map((row, offset) => {
        const position = index + offset + 1;
        const prior = history.get(row.studentId);
        return prisma.leaderboardEntry.upsert({
          where: {
            configId_studentId_periodStart: {
              configId: config.id,
              studentId: row.studentId,
              periodStart: window.start,
            },
          },
          create: {
            schoolId: config.schoolId,
            configId: config.id,
            studentId: row.studentId,
            periodStart: window.start,
            periodEnd: window.end,
            score: row.score,
            rank: ranks.get(row.studentId) ?? position,
            previousRank: prior?.rank ?? null,
            displayLabel: labelFor(config.identityMode, named.get(row.studentId), position),
            isHidden: prior?.isHidden ?? false,
            computedAt: now,
          },
          update: {
            periodEnd: window.end,
            score: row.score,
            rank: ranks.get(row.studentId) ?? position,
            previousRank: prior?.rank ?? null,
            displayLabel: labelFor(config.identityMode, named.get(row.studentId), position),
            computedAt: now,
            // `isHidden` is deliberately absent: the learner's opt-out is theirs and a
            // recompute has no business overwriting it.
          },
        });
      }),
    );
  }

  return ordered.length;
}

/**
 * The previous period's rows, for movement and for the opt-out that has to survive
 * into this period. Two bounded queries rather than a scan: find the most recent
 * earlier `periodStart`, then read only that period.
 */
async function priorEntries(
  configId: string,
  currentStart: Date,
): Promise<Map<string, { rank: number; isHidden: boolean }>> {
  const previous = await prisma.leaderboardEntry.findFirst({
    where: { configId, periodStart: { lt: currentStart } },
    orderBy: { periodStart: 'desc' },
    select: { periodStart: true },
  });
  if (!previous) return new Map();

  const rows = await prisma.leaderboardEntry.findMany({
    where: { configId, periodStart: previous.periodStart },
    select: { studentId: true, rank: true, isHidden: true },
  });
  return new Map(rows.map((row) => [row.studentId, { rank: row.rank, isHidden: row.isHidden }]));
}
