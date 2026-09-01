// ─────────────────────────────────────────────────────────────────────────────
// Companion service
// Blueprint 03: the companion is the learner's, and it grows because they learned.
//
// Three rules shape this file:
//
//   • The learner owns it. Renaming, dressing and interacting are theirs; staff can
//     set one up for a young child and grant growth for learning that happened away
//     from a screen, and that is the whole of the staff surface. There is no
//     "reset companion" and no way to take growth back.
//   • Interaction is affection, not currency. Saying hello nudges growth a little
//     and is capped for the day, so a child cannot tap their way to RADIANT while
//     another child who did the work falls behind. The cap is silent: hitting it
//     still counts as a visit, still moves the streak, and never says "come back
//     tomorrow" in a way that reads as a telling-off.
//   • Nothing here can lower a companion. Growth only adds, stages only advance,
//     and mood — the one thing that can dip — dips to SLEEPY and no further, and
//     only in schools that asked for it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { recordAudit } from '../../core/audit/audit.service';
import { toSkipTake } from '../../core/http/pagination';
import { conflict, featureDisabled, notFound } from '../../core/http/errors';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { accessibleStudentIds } from '../../core/rbac/scope.service';
import { MS_PER_DAY, startOfUtcDay } from '../../core/utils/dates';
import { assertAllInScope, resolveStudent } from '../gamification/points.service';
import {
  COMPANION_SELECT,
  type CompanionRow,
  describeStage,
  growCompanion,
  levelFor,
  moodFor,
  nextStageFor,
  readSettings,
  recordVisit,
  refreshMood,
  STAGE_THRESHOLDS,
  type StageThresholds,
  stageFor,
  writeEvent,
} from './companion.growth';
import type {
  CompanionEventListQuery,
  CompanionListQuery,
  CreateCompanionInput,
  GrantGrowthInput,
  InteractInput,
  InteractionKind,
  UpdateCompanionInput,
} from './companion.validation';

const log = logger.child({ module: 'companion' });

/**
 * What each kindness is worth. Small figures on purpose: a day of interactions is
 * worth less than finishing one activity, so the companion stays a reflection of
 * learning rather than of tapping.
 */
const INTERACTION_GROWTH: Record<InteractionKind, number> = {
  GREET: 2,
  PLAY: 4,
  PRAISE: 3,
};

/** The most growth interactions can contribute in one day. */
const DAILY_INTERACTION_CAP = 10;

/** How quiet a companion has to be before staff see it in the "quiet" filter. */
const QUIET_DAYS_STAFF = 7;

/** The most learners one staff grant will touch in a single call. */
const EVENT_FEED_CAP = 200;

// ── Presentation ────────────────────────────────────────────────────────────

/**
 * The shape the frontend renders. `nextStage` is included so the progress bar has a
 * destination to name — "40 more to hatch" is motivating in a way that a bare
 * percentage is not.
 */
function present(companion: CompanionRow, thresholds: StageThresholds = STAGE_THRESHOLDS) {
  const next = nextStageFor(companion.growthPoints, thresholds);
  const floors = thresholds.map((step) => step.growthPoints);
  const current = [...floors].reverse().find((floor) => companion.growthPoints >= floor) ?? 0;
  const span = next ? next.growthPoints - current : 0;
  const into = companion.growthPoints - current;

  return {
    ...companion,
    stageLabel: describeStage(companion.stage),
    nextStage: next,
    stagePercent: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 100,
  };
}

// ── The learner's own companion ─────────────────────────────────────────────

/**
 * The learner's companion, with its mood brought up to date. Returns null rather
 * than a 404 when there is none yet: "you have not adopted one" is a screen the
 * frontend draws, not an error.
 */
export async function getCompanion(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const settings = await readSettings(schoolId);
  if (!settings.companionEnabled) throw featureDisabled('companion');

  const companion = await find(schoolId, studentId);
  if (!companion) {
    return { studentId, companion: null, speciesAvailable: true };
  }

  const fresh = await refreshMood(companion, settings.companionDecayEnabled);
  return { studentId, companion: present(fresh, settings.stageThresholds), speciesAvailable: false };
}

async function find(schoolId: string, studentId: string): Promise<CompanionRow | null> {
  return prisma.companion.findFirst({
    where: { studentId, schoolId },
    select: COMPANION_SELECT,
  });
}

/** The one that exists, or a 404 — for the paths that need one to act on. */
async function requireCompanion(schoolId: string, studentId: string): Promise<CompanionRow> {
  const companion = await find(schoolId, studentId);
  if (!companion) throw notFound('Companion');
  return companion;
}

/**
 * Adopting. One per learner, enforced by the schema and reported here as a conflict
 * rather than silently returning the existing one — a learner who thinks they are
 * choosing a new creature should be told the old one is still theirs.
 */
export async function createCompanion(
  context: ActorContext,
  schoolId: string,
  input: CreateCompanionInput,
) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  const settings = await readSettings(schoolId);
  if (!settings.companionEnabled) throw featureDisabled('companion');

  const existing = await find(schoolId, studentId);
  if (existing) throw conflict('That learner already has a companion.');

  const companion = await prisma.companion.create({
    data: {
      schoolId,
      studentId,
      speciesKey: input.speciesKey,
      name: input.name,
    },
    select: COMPANION_SELECT,
  });

  await writeEvent(companion.id, {
    kind: 'MILESTONE',
    description: `${companion.name} arrived as an egg.`,
    stageAfter: companion.stage,
    moodAfter: companion.mood,
  });

  recordAudit(context, {
    schoolId,
    action: 'companion.configure',
    targetType: 'Companion',
    targetId: companion.id,
    summary: `Adopted a companion named "${companion.name}"`,
    afterData: { speciesKey: companion.speciesKey, name: companion.name },
  });

  return present(companion, settings.stageThresholds);
}

/**
 * Renaming and redressing. Cosmetic only — species, stage and growth are all absent
 * from what this will write, because the history has to stay the learner's own.
 */
export async function updateCompanion(
  context: ActorContext,
  schoolId: string,
  input: UpdateCompanionInput,
) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  const companion = await requireCompanion(schoolId, studentId);
  const settings = await readSettings(schoolId);

  const updated = await prisma.companion.update({
    where: { id: companion.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.appearance !== undefined
        ? { appearance: input.appearance as Prisma.InputJsonValue }
        : {}),
      ...(input.accessories !== undefined
        ? { accessories: input.accessories as Prisma.InputJsonValue }
        : {}),
    },
    select: COMPANION_SELECT,
  });

  if (input.appearance !== undefined || input.accessories !== undefined) {
    await writeEvent(companion.id, {
      kind: 'ACCESSORY_UNLOCK',
      description: `${updated.name} got a new look.`,
    });
  }

  return present(updated, settings.stageThresholds);
}

// ── Interaction ─────────────────────────────────────────────────────────────

/**
 * Greeting, playing, praising.
 *
 * The daily cap is applied by measuring what interactions have already given today
 * rather than by storing a counter, so it cannot drift and there is no midnight job
 * to reset. Once the cap is reached the visit still lands: the streak moves, the
 * mood lifts, and the response says so plainly through `growthAwarded: 0` without
 * an error the child would read as being told off.
 */
export async function interact(context: ActorContext, schoolId: string, input: InteractInput) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  const settings = await readSettings(schoolId);
  if (!settings.companionEnabled) throw featureDisabled('companion');

  const companion = await requireCompanion(schoolId, studentId);
  const now = new Date();

  const spentToday = await interactionGrowthToday(companion.id, now);
  const allowance = Math.max(0, DAILY_INTERACTION_CAP - spentToday);
  const wanted = INTERACTION_GROWTH[input.kind];
  const granted = Math.min(wanted, allowance);

  if (granted <= 0) {
    const visited = await recordVisit(
      companion,
      describeInteraction(input.kind, companion.name),
      'INTERACTION',
      settings.companionDecayEnabled,
      now,
    );
    return {
      companion: present(visited, settings.stageThresholds),
      growthAwarded: 0,
      stageChanged: false,
      dailyCapReached: true,
    };
  }

  const result = await growCompanion({
    schoolId,
    studentId,
    growthPoints: granted,
    description: describeInteraction(input.kind, companion.name),
    kind: 'INTERACTION',
    sourceType: 'CompanionInteraction',
    sourceId: companion.id,
    countsAsVisit: true,
  });

  // `growCompanion` returns null only for a missing companion or a disabled school,
  // both of which were ruled out above. Falling back to a re-read keeps the response
  // shape honest if that ever stops being true.
  const fresh = await requireCompanion(schoolId, studentId);
  return {
    companion: present(fresh, settings.stageThresholds),
    growthAwarded: result ? granted : 0,
    stageChanged: result?.stageChanged ?? false,
    dailyCapReached: granted + spentToday >= DAILY_INTERACTION_CAP,
  };
}

async function interactionGrowthToday(companionId: string, now: Date): Promise<number> {
  const totals = await prisma.companionEvent.aggregate({
    where: {
      companionId,
      kind: 'INTERACTION',
      occurredAt: { gte: startOfUtcDay(now) },
    },
    _sum: { growthDelta: true },
  });
  return totals._sum.growthDelta ?? 0;
}

function describeInteraction(kind: InteractionKind, name: string): string {
  switch (kind) {
    case 'PLAY':
      return `You played with ${name}.`;
    case 'PRAISE':
      return `You told ${name} you were proud of them.`;
    default:
      return `You said hello to ${name}.`;
  }
}

// ── History ─────────────────────────────────────────────────────────────────

/**
 * The companion's story. Blueprint 03 wants growth to be explainable — "you earned
 * this by finishing three lessons" — and this feed is where that explanation lives.
 */
export async function listEvents(
  context: ActorContext,
  schoolId: string,
  query: CompanionEventListQuery,
) {
  const studentId = await resolveStudent(context, schoolId, query.studentId);
  const companion = await find(schoolId, studentId);
  if (!companion) return { items: [], totalItems: 0 };

  const where: Prisma.CompanionEventWhereInput = { companionId: companion.id };
  if (query.kind) where.kind = query.kind;
  if (query.unseenOnly) where.seenAt = null;
  if (query.search) where.description = { contains: query.search };

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.companionEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip,
      take: Math.min(take, EVENT_FEED_CAP),
    }),
    prisma.companionEvent.count({ where }),
  ]);

  return { items, totalItems };
}

/** Acknowledging the celebration, so it is not replayed on the next visit. */
export async function markEventsSeen(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
): Promise<number> {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const companion = await find(schoolId, studentId);
  if (!companion) return 0;

  const result = await prisma.companionEvent.updateMany({
    where: { companionId: companion.id, seenAt: null },
    data: { seenAt: new Date() },
  });
  return result.count;
}

// ── Staff views ─────────────────────────────────────────────────────────────

/**
 * Who has a companion and who has stopped opening it. Deliberately thin: this is a
 * prompt for a conversation with a child who has gone quiet, not a management
 * console for other people's pets.
 */
export async function listCompanions(
  context: ActorContext,
  schoolId: string,
  query: CompanionListQuery,
) {
  const scoped = await accessibleStudentIds(context.actor, context.tenant);
  const where: Prisma.CompanionWhereInput = { schoolId };
  if (scoped !== null) where.studentId = { in: scoped };
  if (query.stage) where.stage = query.stage;
  if (query.mood) where.mood = query.mood;
  if (query.classId) {
    where.student = { classMemberships: { some: { classId: query.classId, isActive: true } } };
  }
  if (query.quietOnly) {
    where.lastInteractionAt = { lt: new Date(Date.now() - QUIET_DAYS_STAFF * MS_PER_DAY) };
  }
  if (query.search) where.name = { contains: query.search };

  const { skip, take } = toSkipTake(query);
  const [rows, totalItems] = await prisma.$transaction([
    prisma.companion.findMany({
      where,
      select: {
        ...COMPANION_SELECT,
        student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
      },
      orderBy: [{ lastInteractionAt: 'desc' }],
      skip,
      take,
    }),
    prisma.companion.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      stageLabel: describeStage(row.stage),
      quietDays: Math.floor(
        (startOfUtcDay(new Date()).getTime() - startOfUtcDay(row.lastInteractionAt).getTime()) /
          MS_PER_DAY,
      ),
    })),
    totalItems,
  };
}

/**
 * Growth for learning that happened off-screen — a workbook page, a reading session
 * at home a parent mentioned. The note is required and goes to the audit trail,
 * because an unexplained jump in a child's record is worse than no jump at all.
 *
 * Learners without a companion are skipped rather than having one created for them:
 * choosing the creature is the child's moment and a staff grant should not spend it.
 */
export async function grantGrowth(
  context: ActorContext,
  schoolId: string,
  input: GrantGrowthInput,
) {
  const studentIds = await assertAllInScope(context, schoolId, input.studentIds);
  const settings = await readSettings(schoolId);
  if (!settings.companionEnabled) throw featureDisabled('companion');

  let granted = 0;
  let skipped = 0;
  const hatched: string[] = [];

  for (const studentId of studentIds) {
    try {
      const result = await growCompanion({
        schoolId,
        studentId,
        growthPoints: input.growthPoints,
        description: input.note,
        kind: 'GROWTH',
        sourceType: 'StaffGrant',
        sourceId: context.actor.userId,
        // A staff grant is not the learner turning up, so it must not move the
        // streak: the streak counts visits, and crediting one the child did not
        // make would make the number a fiction.
        countsAsVisit: false,
      });
      if (!result) {
        skipped += 1;
        continue;
      }
      granted += 1;
      if (result.stageChanged) hatched.push(studentId);
    } catch (error) {
      skipped += 1;
      log.error({ err: error, studentId }, 'Could not grant companion growth');
    }
  }

  recordAudit(context, {
    schoolId,
    action: 'companion.configure',
    targetType: 'Companion',
    targetId: studentIds[0] ?? schoolId,
    summary: `Granted ${input.growthPoints} companion growth to ${granted} learner(s): ${input.note}`,
    afterData: { growthPoints: input.growthPoints, granted, skipped, note: input.note },
  });

  return { granted, skipped, stageChanges: hatched.length };
}

/**
 * A dashboard card's worth of companion state, and the one place outside `present`
 * that needs the stage arithmetic — kept here so the routes never import the growth
 * engine directly.
 */
export async function companionSummary(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const settings = await readSettings(schoolId);
  const companion = await find(schoolId, studentId);

  if (!companion) {
    return {
      studentId,
      enabled: settings.companionEnabled,
      hasCompanion: false,
      unseenEvents: 0,
    };
  }

  const unseenEvents = await prisma.companionEvent.count({
    where: { companionId: companion.id, seenAt: null },
  });

  return {
    studentId,
    enabled: settings.companionEnabled,
    hasCompanion: true,
    name: companion.name,
    speciesKey: companion.speciesKey,
    stage: companion.stage,
    stageLabel: describeStage(companion.stage),
    mood: moodFor(companion, settings.companionDecayEnabled),
    level: levelFor(companion.growthPoints),
    growthPoints: companion.growthPoints,
    nextStage: nextStageFor(companion.growthPoints, settings.stageThresholds),
    careStreak: companion.careStreak,
    unseenEvents,
  };
}

/**
 * Exported for the seed and for tests: the stage a figure lands on, without needing
 * the threshold table. Re-exported rather than duplicated.
 */
export { stageFor };

// ── Growth configuration (companion.config) ─────────────────────────────────

/**
 * The stage ladder as this school currently has it configured — the hardcoded
 * defaults when nothing has been set. Used by the admin screen to pre-fill the
 * editor with real numbers rather than blanks.
 */
export async function getGrowthConfig(schoolId: string) {
  const settings = await readSettings(schoolId);
  return {
    thresholds: settings.stageThresholds,
    isCustom: settings.stageThresholds !== STAGE_THRESHOLDS,
  };
}

/**
 * An administrator replacing the stage ladder. Existing companions are left
 * exactly as they are — `growthPoints` never changes here — but the next time
 * anything grows them, `stageFor` is evaluated against the new thresholds, so a
 * companion already past a raised bar keeps the stage it earned (stages never move
 * backwards) while one short of a lowered bar advances on its next update.
 */
export async function updateGrowthConfig(
  context: ActorContext,
  schoolId: string,
  thresholds: StageThresholds,
) {
  const before = await getGrowthConfig(schoolId);

  await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: {
      schoolId,
      allowedLoginMethods: ['EMAIL_PASSWORD', 'STUDENT_CODE_PIN'],
      companionStageThresholds: thresholds,
    },
    update: { companionStageThresholds: thresholds, updatedById: context.actor.userId },
  });

  recordAudit(context, {
    schoolId,
    action: 'companion.configure',
    targetType: 'SchoolSettings',
    targetId: schoolId,
    summary: 'Updated the companion growth-stage thresholds.',
    beforeData: { thresholds: before.thresholds },
    afterData: { thresholds },
  });

  return getGrowthConfig(schoolId);
}
