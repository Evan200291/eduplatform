// ─────────────────────────────────────────────────────────────────────────────
// Missions: the catalogue, enrolment, and the period roll
// Blueprint 03: "practise subtraction three times this week" — a mission is a
// short, achievable goal, optionally repeating, optionally scoped to one class or
// one topic.
//
// Three rules are enforced here:
//
//   1. A mission is archived, never deleted. Progress rows point at it, and a
//      learner's finished mission should not disappear when a school tidies up.
//   2. Editing a mission never moves a goalpost. `MissionProgress.goalTarget` is a
//      snapshot taken at enrolment, so raising the target affects the next round
//      and nobody's current one.
//   3. Withdrawing a mission from a learner is CANCELLED with a reason, not a
//      delete, because blueprint 04 wants a teacher's decisions attributable.
//
// Measuring and rewarding live in `missions.rules.ts`; the learner-facing views
// live in `missions.progress.service.ts`. This file owns definitions and who is
// enrolled on what.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { MissionStatus } from '@prisma/client';
import { diffRecords, recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { assertCanAccessClass, classStudentIds } from '../../core/rbac/scope.service';
import { currentPeriod } from '../../core/utils/dates';
import { logger } from '../../core/logger';
import { MISSION_CORE, PROGRESS_CORE, goalLabel, settleProgress } from './missions.rules';
import type { MissionCore } from './missions.rules';
import { assertAllInScope, resolveStudent } from '../gamification/points.service';
import type {
  CancelMissionInput,
  CreateMissionInput,
  EnrolMissionInput,
  MissionListQuery,
  UpdateMissionInput,
} from './missions.validation';

const log = logger.child({ module: 'missions' });

/** How many missions one roll handles, so a large school does not stall the loop. */
const ROLL_BATCH = 200;

/**
 * The largest cohort one school-wide mission will auto-enrol in a single pass.
 * A school with more learners than this still gets everyone, one roll at a time,
 * because `ensureEnrolment` only writes the rows that are missing.
 */
const COHORT_CAP = 2_000;

/** How many progress rows one roll settles, for the same reason. */
const SETTLE_BATCH = 400;

const MISSION_SELECT = {
  id: true,
  schoolId: true,
  key: true,
  title: true,
  description: true,
  classId: true,
  topicId: true,
  ageMode: true,
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
  createdById: true,
  createdAt: true,
  updatedAt: true,
  class: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
  rewardBadge: { select: { id: true, key: true, name: true, tier: true } },
  _count: { select: { progress: true } },
} satisfies Prisma.MissionSelect;

// ── The catalogue ───────────────────────────────────────────────────────────

/**
 * The mission board. `withMine` attaches the caller's own row, which is what lets
 * a learner and a teacher read the same endpoint and each see what they need.
 */
export async function listMissions(
  context: ActorContext,
  schoolId: string,
  query: MissionListQuery,
) {
  const where: Prisma.MissionWhereInput = { schoolId };
  if (query.activeOnly) where.isActive = true;
  if (!query.includeArchived) where.archivedAt = null;
  if (query.classId) where.classId = query.classId;
  if (query.topicId) where.topicId = query.topicId;
  if (query.goalType) where.goalType = query.goalType;
  if (query.recurringOnly) where.isRecurring = true;
  // A mission with no age mode suits every age band, so it must not be filtered out.
  if (query.ageMode) where.OR = [{ ageMode: query.ageMode }, { ageMode: null }];
  if (query.search) {
    where.AND = [
      {
        OR: [
          { title: { contains: query.search } },
          { description: { contains: query.search } },
        ],
      },
    ];
  }

  const { skip, take } = toSkipTake(query);
  const [rows, totalItems] = await prisma.$transaction([
    prisma.mission.findMany({
      where,
      select: MISSION_SELECT,
      orderBy: [{ isActive: 'desc' }, { startsAt: 'desc' }, { title: 'asc' }],
      skip,
      take,
    }),
    prisma.mission.count({ where }),
  ]);

  const items = rows.map(decorate);
  if (!query.withMine || items.length === 0) return { items, totalItems };

  const studentId = await resolveStudent(context, schoolId, undefined).catch(() => null);
  if (!studentId) return { items, totalItems };

  const mine = await prisma.missionProgress.findMany({
    where: { studentId, missionId: { in: items.map((row) => row.id) } },
    select: {
      missionId: true,
      status: true,
      progressValue: true,
      goalTarget: true,
      periodEnd: true,
      completedAt: true,
      seenAt: true,
    },
    orderBy: { periodStart: 'desc' },
  });

  // Newest round wins where a recurring mission has several rows for one learner.
  const byMission = new Map<string, (typeof mine)[number]>();
  for (const row of mine) if (!byMission.has(row.missionId)) byMission.set(row.missionId, row);

  return {
    items: items.map((row) => {
      const held = byMission.get(row.id);
      return {
        ...row,
        mine: held
          ? {
              enrolled: true,
              status: held.status,
              progressValue: held.progressValue,
              goalTarget: held.goalTarget,
              percent: percentOf(held.progressValue, held.goalTarget),
              endsAt: held.periodEnd,
              completedAt: held.completedAt,
              seen: held.seenAt !== null,
            }
          : { enrolled: false },
      };
    }),
    totalItems,
  };
}

export async function getMission(_context: ActorContext, schoolId: string, missionId: string) {
  const mission = await prisma.mission.findFirst({
    where: { id: missionId, schoolId },
    select: MISSION_SELECT,
  });
  if (!mission) throw notFound('Mission');
  return decorate(mission);
}

/** Adds the human-readable goal so a client never has to interpret `goalType`. */
function decorate<T extends { goalType: string; goalTarget: number }>(mission: T) {
  return { ...mission, goalLabel: goalLabel(mission.goalType, mission.goalTarget) };
}

function percentOf(value: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
}

export async function createMission(
  context: ActorContext,
  schoolId: string,
  input: CreateMissionInput,
) {
  if (input.classId) await assertCanAccessClass(context.actor, context.tenant, input.classId);
  await assertReferences(schoolId, input.topicId, input.rewardBadgeId);

  const clash = await prisma.mission.findFirst({
    where: { schoolId, key: input.key },
    select: { id: true },
  });
  if (clash) throw conflict(`A mission with the key "${input.key}" already exists.`);

  const mission = await prisma.mission.create({
    data: {
      schoolId,
      key: input.key,
      title: input.title,
      description: input.description,
      classId: input.classId ?? null,
      topicId: input.topicId ?? null,
      ageMode: input.ageMode ?? null,
      goalType: input.goalType,
      goalTarget: input.goalTarget,
      pointsReward: input.pointsReward,
      rewardBadgeId: input.rewardBadgeId ?? null,
      startsAt: input.startsAt ?? new Date(),
      endsAt: input.endsAt ?? null,
      isRecurring: input.isRecurring,
      recurrenceDays: input.recurrenceDays ?? null,
      autoEnrol: input.autoEnrol,
      createdById: context.actor.userId,
    },
    select: MISSION_SELECT,
  });

  recordAudit(context, {
    action: 'mission.create',
    targetType: 'Mission',
    targetId: mission.id,
    summary: `Created the mission "${mission.title}"`,
    afterData: { key: mission.key, goalType: mission.goalType, goalTarget: mission.goalTarget },
  });

  return decorate(mission);
}

export async function updateMission(
  context: ActorContext,
  schoolId: string,
  missionId: string,
  input: UpdateMissionInput,
) {
  const before = await prisma.mission.findFirst({
    where: { id: missionId, schoolId },
    select: MISSION_SELECT,
  });
  if (!before) throw notFound('Mission');
  if (input.classId) await assertCanAccessClass(context.actor, context.tenant, input.classId);
  await assertReferences(schoolId, input.topicId, input.rewardBadgeId);

  const after = await prisma.mission.update({
    where: { id: missionId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.classId !== undefined ? { classId: input.classId } : {}),
      ...(input.topicId !== undefined ? { topicId: input.topicId } : {}),
      ...(input.ageMode !== undefined ? { ageMode: input.ageMode } : {}),
      ...(input.goalType !== undefined ? { goalType: input.goalType } : {}),
      ...(input.goalTarget !== undefined ? { goalTarget: input.goalTarget } : {}),
      ...(input.pointsReward !== undefined ? { pointsReward: input.pointsReward } : {}),
      ...(input.rewardBadgeId !== undefined ? { rewardBadgeId: input.rewardBadgeId } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.isRecurring !== undefined ? { isRecurring: input.isRecurring } : {}),
      ...(input.recurrenceDays !== undefined ? { recurrenceDays: input.recurrenceDays } : {}),
      ...(input.autoEnrol !== undefined ? { autoEnrol: input.autoEnrol } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: MISSION_SELECT,
  });

  recordAudit(context, {
    action: 'mission.update',
    targetType: 'Mission',
    targetId: missionId,
    summary: `Edited the mission "${after.title}"`,
    afterData: diffRecords(before, after),
  });

  return decorate(after);
}

/**
 * Withdrawn from the board. Rows already in flight are left alone: a learner
 * halfway through a mission the school retires still gets to finish it, and one
 * who finished it keeps the record.
 */
export async function archiveMission(context: ActorContext, schoolId: string, missionId: string) {
  const mission = await prisma.mission.findFirst({
    where: { id: missionId, schoolId },
    select: { id: true, title: true, archivedAt: true },
  });
  if (!mission) throw notFound('Mission');
  if (mission.archivedAt) throw conflict('That mission is already archived.');

  const updated = await prisma.mission.update({
    where: { id: missionId },
    data: { archivedAt: new Date(), isActive: false },
    select: MISSION_SELECT,
  });

  recordAudit(context, {
    action: 'mission.update',
    targetType: 'Mission',
    targetId: missionId,
    summary: `Archived the mission "${mission.title}"`,
    afterData: { archivedAt: updated.archivedAt },
  });

  return decorate(updated);
}

/** Referenced records must exist in this school before they can be pointed at. */
async function assertReferences(
  schoolId: string,
  topicId?: string | null,
  rewardBadgeId?: string | null,
): Promise<void> {
  if (topicId) {
    const topic = await prisma.topic.findFirst({ where: { id: topicId }, select: { id: true } });
    if (!topic) throw notFound('Topic');
  }
  if (rewardBadgeId) {
    const badge = await prisma.badge.findFirst({
      where: { id: rewardBadgeId, schoolId },
      select: { id: true },
    });
    if (!badge) throw notFound('Badge');
  }
}

// ── Who is on which mission ─────────────────────────────────────────────────

/**
 * The bounds of the round a learner joining now belongs to.
 *
 * A one-off mission has no period: `periodStart` stays null and the deadline is the
 * mission's own end date. A repeating mission is anchored to `startsAt` so every
 * learner in a school is measured over the same days regardless of when they joined
 * — otherwise "this week" would mean something different for each child.
 */
function roundFor(mission: RollableMission, now: Date) {
  if (!mission.isRecurring || !mission.recurrenceDays) {
    return { periodStart: null, periodEnd: mission.endsAt, expiresAt: mission.endsAt };
  }
  const { periodStart, periodEnd } = currentPeriod(mission.startsAt, mission.recurrenceDays, now);
  // A repeating mission that also has a hard end must not schedule past it.
  const end = mission.endsAt && mission.endsAt < periodEnd ? mission.endsAt : periodEnd;
  return { periodStart, periodEnd: end, expiresAt: end };
}

/**
 * The mission fields enrolment and the roll need. Shared with `missions.rules.ts`
 * rather than redeclared, so a field added for measurement is automatically
 * available to the roll that drives it.
 */
const ROLLABLE_SELECT = MISSION_CORE;

type RollableMission = MissionCore;

/**
 * Creates the missing progress rows for the current round and returns how many were
 * written. Idempotent by set difference rather than by `upsert`, because MySQL treats
 * each NULL in a composite unique as distinct and a one-off mission's `periodStart`
 * is NULL — an upsert would insert a duplicate every time it ran.
 */
export async function ensureEnrolment(
  mission: RollableMission,
  studentIds: string[],
  now = new Date(),
): Promise<number> {
  if (studentIds.length === 0) return 0;
  const round = roundFor(mission, now);

  const existing = await prisma.missionProgress.findMany({
    where: {
      missionId: mission.id,
      studentId: { in: studentIds },
      periodStart: round.periodStart,
    },
    select: { studentId: true },
  });
  const already = new Set(existing.map((row) => row.studentId));
  const missing = studentIds.filter((id) => !already.has(id));
  if (missing.length === 0) return 0;

  const result = await prisma.missionProgress.createMany({
    data: missing.map((studentId) => ({
      schoolId: mission.schoolId,
      missionId: mission.id,
      studentId,
      // The snapshot that stops a later edit moving the goalposts mid-round.
      goalTarget: mission.goalTarget,
      periodStart: round.periodStart,
      periodEnd: round.periodEnd,
      expiresAt: round.expiresAt,
      status: MissionStatus.NOT_STARTED,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Enrolling named learners by hand, for the nudge a teacher wants to give a few. */
export async function enrolStudents(
  context: ActorContext,
  schoolId: string,
  missionId: string,
  input: EnrolMissionInput,
) {
  const mission = await requireRollable(schoolId, missionId);
  if (mission.archivedAt) throw conflict('That mission is archived, so nobody new can join it.');
  await assertAllInScope(context, schoolId, input.studentIds);

  const enrolled = await ensureEnrolment(mission, input.studentIds);

  recordAudit(context, {
    action: 'mission.update',
    targetType: 'Mission',
    targetId: missionId,
    summary: `Added ${input.studentIds.length} learner(s) to "${mission.title}"`,
    afterData: { requested: input.studentIds.length, enrolled },
  });

  return { missionId, requested: input.studentIds.length, enrolled };
}

/**
 * Withdraws a mission from named learners. The reason lives in the audit trail
 * rather than on the row: `MissionProgress` has no reason column, and adding a
 * value the schema does not describe would be worse than recording it where every
 * other teacher decision is already recorded.
 *
 * Completed rows are left alone. A finished mission has been finished.
 */
export async function cancelForStudents(
  context: ActorContext,
  schoolId: string,
  missionId: string,
  input: CancelMissionInput,
) {
  const mission = await requireRollable(schoolId, missionId);
  await assertAllInScope(context, schoolId, input.studentIds);

  const result = await prisma.missionProgress.updateMany({
    where: {
      missionId,
      schoolId,
      studentId: { in: input.studentIds },
      status: { in: [MissionStatus.NOT_STARTED, MissionStatus.ACTIVE] },
    },
    data: { status: MissionStatus.CANCELLED },
  });

  recordAudit(context, {
    action: 'mission.update',
    targetType: 'Mission',
    targetId: missionId,
    summary: `Withdrew "${mission.title}" from ${result.count} learner(s)`,
    reason: input.reason,
    afterData: { cancelled: result.count },
  });

  return { missionId, cancelled: result.count };
}

async function requireRollable(schoolId: string, missionId: string): Promise<RollableMission> {
  const mission = await prisma.mission.findFirst({
    where: { id: missionId, schoolId },
    select: ROLLABLE_SELECT,
  });
  if (!mission) throw notFound('Mission');
  return mission;
}

/** The cohort a mission auto-enrols: one class where it names one, otherwise the school. */
async function cohortFor(mission: RollableMission): Promise<string[]> {
  if (mission.classId) return classStudentIds(mission.classId);
  const learners = await prisma.user.findMany({
    where: { schoolId: mission.schoolId, primaryRole: 'STUDENT', status: 'ACTIVE' },
    select: { id: true },
    take: COHORT_CAP,
  });
  return learners.map((learner) => learner.id);
}

// ── The hourly roll ─────────────────────────────────────────────────────────

/**
 * The scheduled job. Blueprint 13 wants routine operations on a schedule and
 * observable, so this returns the number of rows it changed and the caller writes
 * a `JobRun`.
 *
 * Each pass does three things per mission: opens the current round for anyone
 * missing from it, re-measures every row still in flight, and lets the ones whose
 * deadline has passed lapse. All three are idempotent, so a missed hour costs
 * nothing and a double run changes nothing twice.
 *
 * Note what does *not* happen: no learner is notified that a mission lapsed, and no
 * points are taken back. Blueprint 03 frames a mission as achievable rather than as
 * a penalty, and a message about a mission the child did not finish would turn a
 * missed opportunity into a telling-off.
 */
export async function rollMissionPeriods(): Promise<number> {
  const now = new Date();
  const missions = await prisma.mission.findMany({
    where: { isActive: true, archivedAt: null, startsAt: { lte: now } },
    select: ROLLABLE_SELECT,
    orderBy: { updatedAt: 'asc' },
    take: ROLL_BATCH,
  });

  let touched = 0;
  for (const mission of missions) {
    // One broken mission must not stop the rest of the school's rolling.
    try {
      touched += await rollOne(mission, now);
    } catch (error) {
      log.error({ err: error, missionId: mission.id }, 'Could not roll mission');
    }
  }

  if (touched > 0) {
    log.info({ missions: missions.length, rows: touched }, 'Mission progress rolled');
  }
  return touched;
}

async function rollOne(mission: RollableMission, now: Date): Promise<number> {
  let touched = 0;

  /**
   * Enrolment first, so a round that opened this hour is measured in the same pass
   * rather than sitting empty until the next one. A mission past its end date opens
   * no new rounds — `roundFor` would hand out a window that has already closed.
   */
  const ended = mission.endsAt !== null && mission.endsAt <= now;
  if (mission.autoEnrol && !ended) {
    touched += await ensureEnrolment(mission, await cohortFor(mission), now);
  }

  const rows = await prisma.missionProgress.findMany({
    where: {
      missionId: mission.id,
      status: { in: [MissionStatus.NOT_STARTED, MissionStatus.ACTIVE] },
    },
    select: PROGRESS_CORE,
    orderBy: { updatedAt: 'asc' },
    take: SETTLE_BATCH,
  });

  for (const row of rows) {
    try {
      const result = await settleProgress(mission, row, now);
      if (result.status !== row.status || result.progressValue !== row.progressValue) {
        touched += 1;
      }
    } catch (error) {
      log.error({ err: error, progressId: row.id }, 'Could not settle mission progress');
    }
  }

  return touched;
}

