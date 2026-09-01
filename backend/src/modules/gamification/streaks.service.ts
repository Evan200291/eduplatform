// ─────────────────────────────────────────────────────────────────────────────
// Streaks
// Blueprint 03, quoted from the schema: "streaks encourage habit without punishing
// absence — a broken streak keeps its personal best and starts again."
//
// That single sentence decides the whole design:
//
//   • `longestLength` is never lowered. Losing a run costs the run, not the record.
//   • `freezesRemaining` is a grace allowance, so one missed day does not erase a
//     fortnight. A freeze is spent only when the learner comes back, never by the
//     sweep — otherwise an absent child would silently burn their grace while doing
//     nothing at all.
//   • Breaking a streak is quiet. There is no "you lost your streak" notification;
//     the only message is STREAK_AT_RISK, sent while it can still be saved.
//
// Continuity is measured in whole periods, not hours: a daily streak counts calendar
// days and a weekly streak counts calendar weeks, so a learner working at 23:50 and
// again at 00:10 has worked on two days, which is what a child would say happened.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  NotificationCategory,
  NotificationPriority,
  StreakKind,
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import { toSkipTake } from '../../core/http/pagination';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { accessibleStudentIds, assertCanViewStudent } from '../../core/rbac/scope.service';
import { notifyUsers } from '../notifications/notifications.service';
import { evaluateBadgesFor } from './gamification.rules';
import { resolveStudent } from './points.service';
import type { GrantFreezeInput, StreakListQuery } from './gamification.validation';

const log = logger.child({ module: 'gamification.streaks' });

const JOB_BATCH = 500;
const DAY_MS = 86_400_000;
/** Restored when a streak breaks, so the next run has its grace back — the
 *  hardcoded fallback for a school that has not set `streakDefaultFreezes`. */
const DEFAULT_FREEZES = 1;

// ── Admin-configurable streak behavior (SchoolSettings) ─────────────────────

export interface StreakSettings {
  /** Freezes granted to a new or reset streak. */
  defaultFreezes: number;
  /** Whether Saturday/Sunday count toward a daily-granularity streak's continuity. */
  weekendsCount: boolean;
  /** Cap on accumulated `freezesRemaining`, or null for unlimited. */
  maxFreezes: number | null;
}

const DEFAULT_STREAK_SETTINGS: StreakSettings = {
  defaultFreezes: DEFAULT_FREEZES,
  weekendsCount: true,
  maxFreezes: null,
};

/** Reads the three streak knobs, falling back to today's hardcoded behavior. */
export async function readStreakSettings(schoolId: string): Promise<StreakSettings> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: { streakDefaultFreezes: true, streakWeekendsCount: true, streakMaxFreezes: true },
  });
  if (!settings) return DEFAULT_STREAK_SETTINGS;
  return {
    defaultFreezes: settings.streakDefaultFreezes,
    weekendsCount: settings.streakWeekendsCount,
    maxFreezes: settings.streakMaxFreezes,
  };
}

const STREAK_SELECT = {
  id: true,
  studentId: true,
  kind: true,
  currentLength: true,
  longestLength: true,
  lastQualifiedOn: true,
  startedOn: true,
  atRiskNotifiedAt: true,
  freezesRemaining: true,
  updatedAt: true,
  student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} satisfies Prisma.StreakSelect;

// ── Period arithmetic ───────────────────────────────────────────────────────

/** Midnight local, which is the resolution `lastQualifiedOn` is documented at. */
export function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/** Monday 00:00 local. Weeks start on Monday so a school week reads naturally. */
function startOfWeek(at: Date): Date {
  const day = startOfDay(at);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function isWeekly(kind: StreakKind): boolean {
  return kind === StreakKind.WEEKLY_LEARNING;
}

/** The bucket a moment belongs to, for this kind of streak. */
function periodStart(kind: StreakKind, at: Date): Date {
  return isWeekly(kind) ? startOfWeek(at) : startOfDay(at);
}

/** How many whole periods separate two bucket starts. Negative is impossible. */
function periodsBetween(kind: StreakKind, from: Date, to: Date): number {
  const span = isWeekly(kind) ? DAY_MS * 7 : DAY_MS;
  // Rounded because a DST shift moves a boundary by an hour, not by a day.
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / span));
}

/**
 * Counts weekdays strictly between two daily bucket starts (Mon-Fri only),
 * `from` exclusive, `to` inclusive. Only meaningful for a daily-granularity kind;
 * a weekly streak already skips the weekend by construction.
 */
function weekdaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor.getTime() <= to.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * `periodsBetween`, adjusted for a school that has switched weekends off for a
 * daily-granularity streak: Saturday and Sunday no longer count as missed days,
 * so a learner who last worked Friday and returns Monday sees no gap at all.
 * Weekly streaks and a school with `weekendsCount: true` (the default) are
 * unaffected — exactly today's behavior.
 */
function periodsBetweenFor(kind: StreakKind, from: Date, to: Date, settings: StreakSettings): number {
  if (isWeekly(kind) || settings.weekendsCount) return periodsBetween(kind, from, to);
  return weekdaysBetween(from, to);
}

// ── Recording (engine side) ─────────────────────────────────────────────────

export interface StreakUpdate {
  kind: StreakKind;
  currentLength: number;
  longestLength: number;
  extended: boolean;
  reset: boolean;
  freezeUsed: boolean;
  isPersonalBest: boolean;
}

/**
 * Records that a learner did something qualifying. Idempotent within a period: ten
 * activities in one afternoon are one day of the streak, which is the point of a
 * habit measure.
 *
 * `upsert` is deliberately avoided. MySQL treats each NULL in a composite unique as
 * distinct, and while `[studentId, kind]` has no nullable column, the read-then-write
 * shape is needed anyway: the new length depends on the old row.
 */
export async function recordStreakActivity(
  schoolId: string,
  studentId: string,
  kind: StreakKind,
  at: Date = new Date(),
): Promise<StreakUpdate> {
  const bucket = periodStart(kind, at);
  const settings = await readStreakSettings(schoolId);

  const existing = await prisma.streak.findUnique({
    where: { studentId_kind: { studentId, kind } },
    select: {
      id: true,
      currentLength: true,
      longestLength: true,
      lastQualifiedOn: true,
      freezesRemaining: true,
    },
  });

  if (!existing) {
    const created = await prisma.streak.create({
      data: {
        schoolId,
        studentId,
        kind,
        currentLength: 1,
        longestLength: 1,
        lastQualifiedOn: bucket,
        startedOn: bucket,
        freezesRemaining: settings.defaultFreezes,
      },
      select: { currentLength: true, longestLength: true },
    });
    return {
      kind,
      currentLength: created.currentLength,
      longestLength: created.longestLength,
      extended: true,
      reset: false,
      freezeUsed: false,
      isPersonalBest: true,
    };
  }

  const gap = existing.lastQualifiedOn
    ? periodsBetweenFor(kind, periodStart(kind, existing.lastQualifiedOn), bucket, settings)
    : Number.MAX_SAFE_INTEGER;

  // Already counted this period. Nothing to write, so nothing is written.
  if (gap === 0 && existing.currentLength > 0) {
    return {
      kind,
      currentLength: existing.currentLength,
      longestLength: existing.longestLength,
      extended: false,
      reset: false,
      freezeUsed: false,
      isPersonalBest: existing.currentLength >= existing.longestLength,
    };
  }

  const missed = Math.max(0, gap - 1);
  const freezeUsed = missed > 0 && missed <= existing.freezesRemaining;
  const continues = gap === 1 || freezeUsed;

  const currentLength = continues ? existing.currentLength + 1 : 1;
  const longestLength = Math.max(existing.longestLength, currentLength);

  await prisma.streak.update({
    where: { id: existing.id },
    data: {
      currentLength,
      longestLength,
      lastQualifiedOn: bucket,
      ...(continues ? {} : { startedOn: bucket }),
      ...(freezeUsed ? { freezesRemaining: existing.freezesRemaining - missed } : {}),
      // The nudge is spent; the next lapse gets a fresh one.
      atRiskNotifiedAt: null,
    },
    select: { id: true },
  });

  // A streak badge may now be earned. Best-effort: a failure here must not undo
  // the learner's day.
  try {
    await evaluateBadgesFor(schoolId, studentId);
  } catch (error) {
    log.error({ err: error, studentId }, 'Badge evaluation after streak update failed');
  }

  return {
    kind,
    currentLength,
    longestLength,
    extended: continues,
    reset: !continues,
    freezeUsed,
    isPersonalBest: currentLength >= longestLength,
  };
}

/**
 * The shorthand the learning engine calls after any completed work. Daily learning
 * is the streak every school gets; the other kinds are recorded by the module that
 * owns their evidence.
 */
export async function touchDailyLearning(
  schoolId: string,
  studentId: string,
  at: Date = new Date(),
): Promise<StreakUpdate> {
  return recordStreakActivity(schoolId, studentId, StreakKind.DAILY_LEARNING, at);
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listStreaks(context: ActorContext, schoolId: string, query: StreakListQuery) {
  const scoped = await accessibleStudentIds(context.actor, context.tenant);

  const where: Prisma.StreakWhereInput = { schoolId };
  if (scoped !== null) where.studentId = { in: scoped };
  if (query.studentId) {
    where.studentId =
      scoped === null || scoped.includes(query.studentId) ? query.studentId : { in: [] };
  }
  if (query.classId) {
    where.student = { classMemberships: { some: { classId: query.classId, isActive: true } } };
  }
  if (query.kind) where.kind = query.kind;
  if (query.atRiskOnly) {
    // Last qualified before the current period began, so today is still open.
    where.currentLength = { gt: 0 };
    where.lastQualifiedOn = { lt: startOfDay(new Date()) };
  }

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.streak.findMany({
      where,
      select: STREAK_SELECT,
      orderBy: [{ currentLength: 'desc' }, { longestLength: 'desc' }],
      skip,
      take,
    }),
    prisma.streak.count({ where }),
  ]);
  return { items, totalItems };
}

/**
 * One learner's streaks, with every kind represented — a kind with no row yet reads
 * as zero rather than being absent, so the dashboard has a stable shape.
 */
export async function streaksFor(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const [rows, settings] = await Promise.all([
    prisma.streak.findMany({ where: { schoolId, studentId }, select: STREAK_SELECT }),
    readStreakSettings(schoolId),
  ]);
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  const today = startOfDay(new Date());

  const streaks = Object.values(StreakKind).map((kind) => {
    const row = byKind.get(kind);
    const bucket = periodStart(kind, new Date());
    const qualifiedThisPeriod = Boolean(
      row?.lastQualifiedOn && periodStart(kind, row.lastQualifiedOn).getTime() === bucket.getTime(),
    );
    return {
      kind,
      currentLength: row?.currentLength ?? 0,
      longestLength: row?.longestLength ?? 0,
      lastQualifiedOn: row?.lastQualifiedOn ?? null,
      startedOn: row?.startedOn ?? null,
      freezesRemaining: row?.freezesRemaining ?? settings.defaultFreezes,
      qualifiedThisPeriod,
      /** True while the run can still be saved today. */
      atRisk: Boolean(row && row.currentLength > 0 && !qualifiedThisPeriod),
    };
  });

  return { studentId, asOf: today, streaks };
}

/**
 * A teacher restoring grace after an authorised absence. Blueprint 03 again: illness
 * should not cost a child three weeks of effort, and a teacher is the right person
 * to decide that.
 */
export async function grantFreeze(
  context: ActorContext,
  schoolId: string,
  input: GrantFreezeInput,
) {
  await assertCanViewStudent(context.actor, context.tenant, input.studentId);

  const settings = await readStreakSettings(schoolId);
  const cap = (value: number) => (settings.maxFreezes === null ? value : Math.min(value, settings.maxFreezes));

  const existing = await prisma.streak.findUnique({
    where: { studentId_kind: { studentId: input.studentId, kind: input.kind } },
    select: { id: true, freezesRemaining: true },
  });

  const row = existing
    ? await prisma.streak.update({
        where: { id: existing.id },
        data: { freezesRemaining: cap(existing.freezesRemaining + input.freezes) },
        select: STREAK_SELECT,
      })
    : await prisma.streak.create({
        data: {
          schoolId,
          studentId: input.studentId,
          kind: input.kind,
          freezesRemaining: cap(settings.defaultFreezes + input.freezes),
        },
        select: STREAK_SELECT,
      });

  recordAudit(context, {
    action: 'points.adjust',
    targetType: 'Streak',
    targetId: row.id,
    summary: `Granted ${input.freezes} streak freeze(s) for ${input.kind}`,
    reason: input.reason,
    schoolId,
    afterData: { studentId: input.studentId, freezesRemaining: row.freezesRemaining },
  });

  return row;
}

// ── Scheduled maintenance ───────────────────────────────────────────────────

/**
 * The hourly sweep. Two jobs in one pass, both cheap:
 *
 *   1. Warn learners whose run lapses at the end of this period, once per lapse.
 *   2. Close out runs that even a full spend of freezes cannot bridge.
 *
 * Returns the number of streak rows it touched, which is what the job log shows.
 */
export async function runStreakMaintenance(): Promise<number> {
  const now = new Date();

  const candidates = await prisma.streak.findMany({
    where: { currentLength: { gt: 0 }, lastQualifiedOn: { not: null } },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      kind: true,
      currentLength: true,
      longestLength: true,
      lastQualifiedOn: true,
      atRiskNotifiedAt: true,
      freezesRemaining: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: JOB_BATCH,
  });

  const atRisk: typeof candidates = [];
  const toBreak: typeof candidates = [];

  const settingsBySchool = new Map<string, StreakSettings>();
  const settingsFor = async (schoolId: string): Promise<StreakSettings> => {
    const cached = settingsBySchool.get(schoolId);
    if (cached) return cached;
    const fetched = await readStreakSettings(schoolId);
    settingsBySchool.set(schoolId, fetched);
    return fetched;
  };

  for (const row of candidates) {
    if (!row.lastQualifiedOn) continue;
    const settings = await settingsFor(row.schoolId);
    const bucket = periodStart(row.kind, now);
    const gap = periodsBetweenFor(row.kind, periodStart(row.kind, row.lastQualifiedOn), bucket, settings);

    // Worked this period already, or the run is still live within its grace.
    if (gap === 0) continue;

    if (gap === 1) {
      // Nothing done yet this period. Notify once per lapse; `atRiskNotifiedAt` is
      // cleared the moment the learner returns, so the next lapse warns again.
      const notified = row.atRiskNotifiedAt;
      if (!notified || notified < bucket) atRisk.push(row);
      continue;
    }

    // A freeze bridges one missed period each, and is only spent when the learner
    // comes back. Once the gap exceeds what they hold, the run is over.
    if (gap - 1 > row.freezesRemaining) toBreak.push(row);
  }

  let touched = 0;
  if (atRisk.length > 0) touched += await warnAtRisk(atRisk, now);
  if (toBreak.length > 0) touched += await breakStreaks(toBreak, settingsBySchool);
  return touched;
}

/** One notification per learner per lapse, grouped by streak so it cannot pile up. */
async function warnAtRisk(
  rows: readonly {
    id: string;
    schoolId: string;
    studentId: string;
    kind: StreakKind;
    currentLength: number;
  }[],
  now: Date,
): Promise<number> {
  for (const row of rows) {
    const unit = isWeekly(row.kind) ? 'week' : 'day';
    await notifyUsers([row.studentId], {
      schoolId: row.schoolId,
      category: NotificationCategory.STREAK_AT_RISK,
      priority: NotificationPriority.NORMAL,
      title: `Your ${row.currentLength}-${unit} streak needs you`,
      body: `A little learning today keeps your ${row.currentLength}-${unit} streak going.`,
      actionPath: '/learn',
      actionLabel: 'Do something small',
      sourceType: 'Streak',
      sourceId: row.id,
      groupKey: `streak.atRisk:${row.id}`,
    });
  }

  const result = await prisma.streak.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { atRiskNotifiedAt: now },
  });
  return result.count;
}

/**
 * Closes a run. `longestLength` is untouched and `freezesRemaining` is restored, so
 * starting again is genuinely a fresh start. No notification: blueprint 03 asks for
 * habit without punishment, and a message about failure is a punishment.
 */
async function breakStreaks(
  rows: readonly { id: string; schoolId: string }[],
  settingsBySchool: ReadonlyMap<string, StreakSettings>,
): Promise<number> {
  // Grouped by the school's configured default freezes, so one query per distinct
  // value rather than one per row — in practice almost always a single group.
  const bySchoolDefault = new Map<number, string[]>();
  for (const row of rows) {
    const defaultFreezes = settingsBySchool.get(row.schoolId)?.defaultFreezes ?? DEFAULT_FREEZES;
    const ids = bySchoolDefault.get(defaultFreezes) ?? [];
    ids.push(row.id);
    bySchoolDefault.set(defaultFreezes, ids);
  }

  let touched = 0;
  for (const [defaultFreezes, ids] of bySchoolDefault) {
    const result = await prisma.streak.updateMany({
      where: { id: { in: ids } },
      data: {
        currentLength: 0,
        startedOn: null,
        atRiskNotifiedAt: null,
        freezesRemaining: defaultFreezes,
      },
    });
    touched += result.count;
  }
  return touched;
}

// ── Behavior configuration (gamification.config) ────────────────────────────

export async function getStreakConfig(schoolId: string) {
  return readStreakSettings(schoolId);
}

/**
 * An administrator changing the three streak knobs. Existing streak rows are left
 * untouched — a lower `defaultFreezes` does not claw back grace a learner already
 * holds, it only changes what the *next* new or broken streak starts with, and a
 * new `maxFreezes` cap is applied the next time a freeze is granted, not
 * retroactively.
 */
export async function updateStreakConfig(
  context: ActorContext,
  schoolId: string,
  input: StreakSettings,
) {
  const before = await readStreakSettings(schoolId);

  await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: {
      schoolId,
      allowedLoginMethods: ['EMAIL_PASSWORD', 'STUDENT_CODE_PIN'],
      streakDefaultFreezes: input.defaultFreezes,
      streakWeekendsCount: input.weekendsCount,
      streakMaxFreezes: input.maxFreezes,
    },
    update: {
      streakDefaultFreezes: input.defaultFreezes,
      streakWeekendsCount: input.weekendsCount,
      streakMaxFreezes: input.maxFreezes,
      updatedById: context.actor.userId,
    },
  });

  recordAudit(context, {
    schoolId,
    action: 'school.settings.update',
    targetType: 'SchoolSettings',
    targetId: schoolId,
    summary: 'Updated streak behavior configuration.',
    beforeData: before,
    afterData: input,
  });

  return readStreakSettings(schoolId);
}
