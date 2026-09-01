// ─────────────────────────────────────────────────────────────────────────────
// Mission progress: the learner's board and the teacher's monitor
// Blueprint 03: a mission gives short-term purpose. That only works if the bar
// moves when the learner looks at it, so opening this board re-measures rather
// than reading whatever the last hourly roll left behind.
//
// The board is also self-healing: an auto-enrol mission the learner is eligible
// for but has no row on yet is opened here, so a child who joins a class at
// lunchtime does not stare at an empty board until the next roll.
//
// Every read here derives its learner set from `accessibleStudentIds`, never from
// a `studentId` in the query string. A learner sees themselves; staff see the
// learners they are responsible for.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { MissionStatus } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { accessibleStudentIds } from '../../core/rbac/scope.service';
import { logger } from '../../core/logger';
import { MISSION_CORE, PROGRESS_CORE, goalLabel, settleProgress } from './missions.rules';
import { ensureEnrolment } from './missions.service';
import { resolveStudent } from '../gamification/points.service';
import type { MissionProgressListQuery, MyMissionsQuery, RefreshProgressInput } from './missions.validation';

const log = logger.child({ module: 'missions.progress' });

/**
 * The most rows one board request will re-measure. A learner with more missions
 * than this in flight is not a scenario the blueprint describes, and a request that
 * fans out without a bound is a request that eventually times out.
 */
const LIVE_SETTLE_CAP = 40;

/** Statuses still in play. Anything else is history and is not re-measured. */
const IN_FLIGHT: MissionStatus[] = [MissionStatus.NOT_STARTED, MissionStatus.ACTIVE];

const ROW_SELECT = {
  ...PROGRESS_CORE,
  createdAt: true,
  updatedAt: true,
  mission: { select: MISSION_CORE },
  student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} satisfies Prisma.MissionProgressSelect;

type Row = Prisma.MissionProgressGetPayload<{ select: typeof ROW_SELECT }>;

// ── The teacher's monitor ───────────────────────────────────────────────────

/**
 * Who is where on which mission. This one does not re-measure: a teacher scanning
 * thirty learners wants the page to load, and the hourly roll keeps the figures
 * current to within an hour. The learner's own board is the live view.
 */
export async function listProgress(
  context: ActorContext,
  schoolId: string,
  query: MissionProgressListQuery,
) {
  const scoped = await accessibleStudentIds(context.actor, context.tenant);
  const where: Prisma.MissionProgressWhereInput = { schoolId };

  if (scoped !== null) {
    // An out-of-scope filter yields an empty page rather than an error: a list is
    // allowed to be empty, and telling the caller the learner exists would leak.
    where.studentId = query.studentId
      ? { in: scoped.includes(query.studentId) ? [query.studentId] : [] }
      : { in: scoped };
  } else if (query.studentId) {
    where.studentId = query.studentId;
  }

  if (query.missionId) where.missionId = query.missionId;
  if (query.status) where.status = query.status;
  if (query.unseenOnly) {
    where.status = MissionStatus.COMPLETED;
    where.seenAt = null;
  }
  if (query.classId) {
    where.student = { classMemberships: { some: { classId: query.classId, isActive: true } } };
  }
  if (query.currentPeriodOnly) {
    // The round that has not closed yet. A null `periodEnd` is a one-off mission,
    // which is always current until it completes or lapses.
    where.OR = [{ periodEnd: null }, { periodEnd: { gt: new Date() } }];
  }
  if (query.search) {
    where.mission = { title: { contains: query.search } };
  }

  const { skip, take } = toSkipTake(query);
  const [rows, totalItems] = await prisma.$transaction([
    prisma.missionProgress.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.missionProgress.count({ where }),
  ]);

  return { items: rows.map(present), totalItems };
}

// ── The learner's board ─────────────────────────────────────────────────────

/**
 * Everything the learner is working towards, measured now.
 *
 * Order of work matters: enrol first so a brand-new mission appears, then settle so
 * anything already earned is credited before the response is built. A learner who
 * finished a mission an hour ago should see "complete" and their points, not a bar
 * at 100% that has not paid out yet.
 */
export async function myMissions(
  context: ActorContext,
  schoolId: string,
  query: MyMissionsQuery,
) {
  const studentId = await resolveStudent(context, schoolId, query.studentId);
  await openEligibleMissions(schoolId, studentId);

  const statuses = query.includeCompleted
    ? [...IN_FLIGHT, MissionStatus.COMPLETED]
    : IN_FLIGHT;

  const rows = await prisma.missionProgress.findMany({
    where: { schoolId, studentId, status: { in: statuses } },
    select: ROW_SELECT,
    orderBy: [{ status: 'asc' }, { periodEnd: 'asc' }, { updatedAt: 'desc' }],
    take: LIVE_SETTLE_CAP,
  });

  const settled: Row[] = [];
  for (const row of rows) {
    if (!IN_FLIGHT.includes(row.status)) {
      settled.push(row);
      continue;
    }
    try {
      const result = await settleProgress(row.mission, row, new Date());
      settled.push({
        ...row,
        status: result.status,
        progressValue: result.progressValue,
        pointsAwarded: result.pointsAwarded,
        badgeAwarded: result.badgeAwarded,
      });
    } catch (error) {
      // A measurement failure shows the last known figure rather than an error page.
      log.error({ err: error, progressId: row.id }, 'Could not refresh mission progress');
      settled.push(row);
    }
  }

  const items = settled.map(present);
  return {
    studentId,
    items,
    counts: {
      active: items.filter((row) => row.status === MissionStatus.ACTIVE).length,
      notStarted: items.filter((row) => row.status === MissionStatus.NOT_STARTED).length,
      completed: items.filter((row) => row.status === MissionStatus.COMPLETED).length,
      unseen: items.filter(
        (row) => row.status === MissionStatus.COMPLETED && row.seenAt === null,
      ).length,
    },
  };
}

/**
 * Opens the current round of every auto-enrol mission this learner qualifies for.
 *
 * A mission scoped to a class only reaches learners in that class; a mission with no
 * class reaches the school. `ensureEnrolment` writes only what is missing, so calling
 * this on every board load is cheap after the first time.
 */
async function openEligibleMissions(schoolId: string, studentId: string): Promise<number> {
  const memberships = await prisma.classMembership.findMany({
    where: { userId: studentId, isActive: true },
    select: { classId: true },
  });
  const classIds = memberships.map((membership) => membership.classId);
  const now = new Date();

  const missions = await prisma.mission.findMany({
    where: {
      schoolId,
      isActive: true,
      autoEnrol: true,
      archivedAt: null,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      ...(classIds.length > 0
        ? { AND: [{ OR: [{ classId: null }, { classId: { in: classIds } }] }] }
        : { classId: null }),
    },
    select: MISSION_CORE,
    take: LIVE_SETTLE_CAP,
  });

  let opened = 0;
  for (const mission of missions) {
    try {
      opened += await ensureEnrolment(mission, [studentId], now);
    } catch (error) {
      log.error({ err: error, missionId: mission.id }, 'Could not open mission for learner');
    }
  }
  return opened;
}

/** Shapes a row for a client: the goal in words, and the bar as a percentage. */
function present(row: Row) {
  const percent =
    row.goalTarget > 0
      ? Math.min(100, Math.round((row.progressValue / row.goalTarget) * 100))
      : 0;
  return {
    id: row.id,
    missionId: row.missionId,
    studentId: row.studentId,
    status: row.status,
    progressValue: row.progressValue,
    goalTarget: row.goalTarget,
    percent,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    expiresAt: row.expiresAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    pointsAwarded: row.pointsAwarded,
    badgeAwarded: row.badgeAwarded,
    seenAt: row.seenAt,
    student: row.student,
    mission: {
      id: row.mission.id,
      key: row.mission.key,
      title: row.mission.title,
      description: row.mission.description,
      goalType: row.mission.goalType,
      goalLabel: goalLabel(row.mission.goalType, row.goalTarget),
      pointsReward: row.mission.pointsReward,
      rewardBadgeId: row.mission.rewardBadgeId,
      topicId: row.mission.topicId,
      classId: row.mission.classId,
      isRecurring: row.mission.isRecurring,
    },
  };
}

// ── Refreshing and acknowledging ────────────────────────────────────────────

/**
 * Re-measures on demand, for the moment right after a learner finishes an activity.
 * The hourly roll would get there eventually; this is what makes the bar move while
 * the child is still looking at it.
 *
 * `missionId` narrows the work to one mission, which is what the client sends when
 * it knows which card the learner just affected.
 */
export async function refreshProgress(
  context: ActorContext,
  schoolId: string,
  input: RefreshProgressInput,
) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  await openEligibleMissions(schoolId, studentId);

  const rows = await prisma.missionProgress.findMany({
    where: {
      schoolId,
      studentId,
      status: { in: IN_FLIGHT },
      ...(input.missionId ? { missionId: input.missionId } : {}),
    },
    select: ROW_SELECT,
    orderBy: { updatedAt: 'asc' },
    take: LIVE_SETTLE_CAP,
  });

  const completed: string[] = [];
  let changed = 0;
  for (const row of rows) {
    try {
      const result = await settleProgress(row.mission, row, new Date());
      if (result.progressValue !== row.progressValue || result.status !== row.status) changed += 1;
      if (result.justCompleted) completed.push(row.missionId);
    } catch (error) {
      log.error({ err: error, progressId: row.id }, 'Could not refresh mission progress');
    }
  }

  return { studentId, examined: rows.length, changed, completed };
}

/**
 * Marks finished missions as seen, which is what stops the celebration replaying
 * every time the learner opens the app. Returns how many were cleared.
 */
export async function markMissionsSeen(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
): Promise<number> {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const result = await prisma.missionProgress.updateMany({
    where: { schoolId, studentId, status: MissionStatus.COMPLETED, seenAt: null },
    data: { seenAt: new Date() },
  });
  return result.count;
}

/**
 * Headline counts for a dashboard card. Cheap by design — five `count` calls rather
 * than a re-measure, because a dashboard is a summary and not the live board.
 */
export async function missionSummary(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const base = { schoolId, studentId };

  const [active, notStarted, completed, unseen, expired] = await prisma.$transaction([
    prisma.missionProgress.count({ where: { ...base, status: MissionStatus.ACTIVE } }),
    prisma.missionProgress.count({ where: { ...base, status: MissionStatus.NOT_STARTED } }),
    prisma.missionProgress.count({ where: { ...base, status: MissionStatus.COMPLETED } }),
    prisma.missionProgress.count({
      where: { ...base, status: MissionStatus.COMPLETED, seenAt: null },
    }),
    prisma.missionProgress.count({ where: { ...base, status: MissionStatus.EXPIRED } }),
  ]);

  return { studentId, active, notStarted, completed, unseen, expired };
}
