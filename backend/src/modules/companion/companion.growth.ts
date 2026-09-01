// ─────────────────────────────────────────────────────────────────────────────
// Companion growth
// Blueprint 03: "The companion grows through learning." Stages only move forward.
// There is no death and no severe decay unless a school opts in
// (`SchoolSettings.companionDecayEnabled`), and even then decay affects mood, not
// stage.
//
// Everything here follows from those two sentences:
//
//   • `growCompanion` only ever adds. There is no path through this file that
//     lowers `growthPoints`, `level` or `stage`. A staff correction to points is a
//     ledger reversal; a companion's growth has no equivalent, because taking a
//     creature's growth away from a child is a punishment and the blueprint does
//     not allow one.
//   • Mood is *derived*, never stored as a running total that could sink. It is a
//     function of how recently the learner visited and how long their care streak
//     is, recomputed on read, so a companion left alone becomes SLEEPY and nothing
//     worse — and only where the school asked for that.
//   • Stage thresholds live in code because the schema says so: "Stage thresholds
//     are configuration, not data."
//
// `growCompanion` is the seam other modules call. It is safe to call for a learner
// with no companion (returns null) and for a school with companions switched off
// (also null), so callers never need to check first.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { CompanionMood, CompanionStage, NotificationCategory, NotificationPriority } from '@prisma/client';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { MS_PER_DAY, startOfUtcDay } from '../../core/utils/dates';
import { enqueueNotification } from '../notifications/notifications.service';
import type { EventKind } from './companion.validation';

const log = logger.child({ module: 'companion.growth' });

/**
 * Growth needed to reach each stage. The gaps widen deliberately: hatching should
 * happen in the first week of use so a new learner sees the reward loop work, while
 * RADIANT is a whole year's engagement and is meant to feel like one.
 */
export const STAGE_THRESHOLDS: ReadonlyArray<{ stage: CompanionStage; growthPoints: number }> = [
  { stage: CompanionStage.EGG, growthPoints: 0 },
  { stage: CompanionStage.HATCHLING, growthPoints: 50 },
  { stage: CompanionStage.JUVENILE, growthPoints: 150 },
  { stage: CompanionStage.ADOLESCENT, growthPoints: 350 },
  { stage: CompanionStage.ADULT, growthPoints: 700 },
  { stage: CompanionStage.RADIANT, growthPoints: 1_400 },
];

export type StageThresholds = ReadonlyArray<{ stage: CompanionStage; growthPoints: number }>;

/**
 * Validates an admin-supplied override of `STAGE_THRESHOLDS`: every stage present
 * exactly once, in ascending order, starting at 0. An invalid or missing override
 * falls back to the hardcoded ladder so a bad value in the database can never break
 * growth for a school — it just quietly stops applying.
 */
export function resolveStageThresholds(raw: unknown): StageThresholds {
  if (!Array.isArray(raw) || raw.length !== STAGE_THRESHOLDS.length) return STAGE_THRESHOLDS;

  const stageOrder = STAGE_THRESHOLDS.map((step) => step.stage);
  const parsed: { stage: CompanionStage; growthPoints: number }[] = [];
  for (const entry of raw) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof (entry as { stage?: unknown }).stage !== 'string' ||
      typeof (entry as { growthPoints?: unknown }).growthPoints !== 'number'
    ) {
      return STAGE_THRESHOLDS;
    }
    parsed.push({
      stage: (entry as { stage: CompanionStage }).stage,
      growthPoints: (entry as { growthPoints: number }).growthPoints,
    });
  }

  const sameStages = stageOrder.every((stage, index) => parsed[index]?.stage === stage);
  const ascending = parsed.every(
    (step, index) => index === 0 || step.growthPoints > parsed[index - 1].growthPoints,
  );
  if (!sameStages || !ascending || parsed[0].growthPoints !== 0) return STAGE_THRESHOLDS;

  return parsed;
}

/** Growth per level. Levels are the fine-grained progress bar between stages. */
const GROWTH_PER_LEVEL = 25;
const MAX_LEVEL = 99;

/** Days of silence before a companion looks sleepy, where a school enabled decay. */
const QUIET_DAYS = 3;

export const COMPANION_SELECT = {
  id: true,
  schoolId: true,
  studentId: true,
  speciesKey: true,
  name: true,
  stage: true,
  mood: true,
  growthPoints: true,
  level: true,
  appearance: true,
  accessories: true,
  hatchedAt: true,
  lastInteractionAt: true,
  lastStageChangeAt: true,
  careStreak: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanionSelect;

export type CompanionRow = Prisma.CompanionGetPayload<{ select: typeof COMPANION_SELECT }>;

// ── Pure arithmetic ─────────────────────────────────────────────────────────

/** The highest stage this much growth has reached. Never goes down. */
export function stageFor(growthPoints: number, thresholds: StageThresholds = STAGE_THRESHOLDS): CompanionStage {
  let reached: CompanionStage = CompanionStage.EGG;
  for (const step of thresholds) {
    if (growthPoints >= step.growthPoints) reached = step.stage;
  }
  return reached;
}

export function levelFor(growthPoints: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(growthPoints / GROWTH_PER_LEVEL));
}

/**
 * What comes next, so the UI can say "40 more to hatch" rather than showing a bar
 * with no destination. Null at RADIANT: there is nothing left to promise.
 */
export function nextStageFor(
  growthPoints: number,
  thresholds: StageThresholds = STAGE_THRESHOLDS,
): {
  stage: CompanionStage;
  growthPoints: number;
  remaining: number;
} | null {
  const upcoming = thresholds.find((step) => step.growthPoints > growthPoints);
  if (!upcoming) return null;
  return { ...upcoming, remaining: upcoming.growthPoints - growthPoints };
}

/**
 * Mood, derived on read.
 *
 * A companion that has not been visited is SLEEPY at worst, and only where the
 * school switched decay on. Everything else is a shade of pleased, scaled by the
 * care streak — blueprint 03 wants the streak to "encourage habit without punishing
 * absence", so a broken streak drops the companion to CALM, not to something sad.
 */
export function moodFor(
  companion: Pick<CompanionRow, 'lastInteractionAt' | 'careStreak' | 'stage'>,
  decayEnabled: boolean,
  now = new Date(),
): CompanionMood {
  const quietDays = Math.floor(
    (startOfUtcDay(now).getTime() - startOfUtcDay(companion.lastInteractionAt).getTime()) /
      MS_PER_DAY,
  );

  if (decayEnabled && quietDays >= QUIET_DAYS) return CompanionMood.SLEEPY;
  if (companion.stage === CompanionStage.EGG) return CompanionMood.CALM;
  if (companion.careStreak >= 7) return CompanionMood.PROUD;
  if (companion.careStreak >= 3) return CompanionMood.HAPPY;
  if (companion.careStreak >= 1) return CompanionMood.CONTENT;
  return CompanionMood.CALM;
}

// ── Growing ─────────────────────────────────────────────────────────────────

export interface GrowthInput {
  schoolId: string;
  studentId: string;
  /** Always positive. A negative delta is rejected rather than clamped, so a
   *  caller that computed one finds out rather than silently doing nothing. */
  growthPoints: number;
  description: string;
  kind?: EventKind;
  sourceType?: string | null;
  sourceId?: string | null;
  /** Counts towards the care streak. Learning does; a staff grant does not. */
  countsAsVisit?: boolean;
  /**
   * Credit this source at most once. Set by learning events, because a re-marked
   * assignment settles its points by reversing the first credit and writing a new
   * one — and the companion has no reversal. Growing it a second time for the same
   * piece of work would be the only way a re-mark could inflate a companion, so the
   * source is checked instead.
   */
  once?: boolean;
}

export interface GrowthResult {
  companionId: string;
  growthPoints: number;
  level: number;
  stage: CompanionStage;
  stageChanged: boolean;
  previousStage: CompanionStage;
  mood: CompanionMood;
  careStreak: number;
  levelledUp: boolean;
}

/**
 * Adds growth and records why. Returns null when the learner has no companion or the
 * school has companions switched off, so callers can fire this at every learning
 * event without checking either condition first.
 */
export async function growCompanion(input: GrowthInput): Promise<GrowthResult | null> {
  if (input.growthPoints <= 0) return null;

  const companion = await prisma.companion.findFirst({
    where: { studentId: input.studentId, schoolId: input.schoolId },
    select: COMPANION_SELECT,
  });
  if (!companion) return null;

  const settings = await readSettings(input.schoolId);
  if (!settings.companionEnabled) return null;

  if (input.once && input.sourceType && input.sourceId) {
    const already = await prisma.companionEvent.findFirst({
      where: {
        companionId: companion.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        growthDelta: { gt: 0 },
      },
      select: { id: true },
    });
    if (already) return null;
  }

  const now = new Date();
  const growthPoints = companion.growthPoints + input.growthPoints;
  const stage = stageFor(growthPoints, settings.stageThresholds);
  const level = levelFor(growthPoints);
  const stageChanged = stage !== companion.stage;
  const levelledUp = level > companion.level;

  const careStreak =
    input.countsAsVisit === false
      ? companion.careStreak
      : nextCareStreak(companion.lastInteractionAt, companion.careStreak, now);

  const mood = moodFor(
    { lastInteractionAt: input.countsAsVisit === false ? companion.lastInteractionAt : now, careStreak, stage },
    settings.companionDecayEnabled,
    now,
  );

  const updated = await prisma.companion.update({
    where: { id: companion.id },
    data: {
      growthPoints,
      level,
      stage,
      mood,
      careStreak,
      ...(input.countsAsVisit === false ? {} : { lastInteractionAt: now }),
      ...(stageChanged ? { lastStageChangeAt: now } : {}),
      // Hatching is a one-off moment worth being able to point at later.
      ...(stageChanged && companion.stage === CompanionStage.EGG && companion.hatchedAt === null
        ? { hatchedAt: now }
        : {}),
    },
    select: COMPANION_SELECT,
  });

  await writeEvent(companion.id, {
    kind: input.kind ?? (stageChanged ? 'STAGE_CHANGE' : 'GROWTH'),
    description: input.description,
    growthDelta: input.growthPoints,
    stageBefore: companion.stage,
    stageAfter: stage,
    moodBefore: companion.mood,
    moodAfter: mood,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    occurredAt: now,
  });

  if (stageChanged) await announceStage(updated, companion.stage);

  return {
    companionId: updated.id,
    growthPoints: updated.growthPoints,
    level: updated.level,
    stage: updated.stage,
    stageChanged,
    previousStage: companion.stage,
    mood: updated.mood,
    careStreak: updated.careStreak,
    levelledUp,
  };
}

/**
 * How much a companion grows from a piece of learning.
 *
 * Half the points, bounded at both ends. The floor of one means practice that
 * carries no points still moves the creature — a learner who read for ten minutes
 * did learn — and the ceiling of twenty stops one enormous end-of-term assessment
 * from skipping three stages at once, which would make every earlier week feel
 * pointless in hindsight.
 */
export function growthForLearning(points: number): number {
  if (points <= 0) return 1;
  return Math.min(20, Math.max(1, Math.round(points / 2)));
}

/**
 * The care streak's step. Same day changes nothing, the next day continues, a longer
 * gap starts again at one — which is a restart, not a reset to zero, because the
 * learner is here now and that is the thing being counted.
 */
export function nextCareStreak(lastVisit: Date, current: number, now: Date): number {
  const days = Math.floor(
    (startOfUtcDay(now).getTime() - startOfUtcDay(lastVisit).getTime()) / MS_PER_DAY,
  );
  if (days <= 0) return Math.max(1, current);
  if (days === 1) return current + 1;
  return 1;
}

/**
 * A visit that earns nothing — the learner has already had today's interaction
 * growth, or is simply saying hello. The streak still moves, because the streak
 * counts turning up, and the mood still lifts, because being visited is the point.
 */
export async function recordVisit(
  companion: CompanionRow,
  description: string,
  kind: EventKind = 'INTERACTION',
  decayEnabled = false,
  now = new Date(),
): Promise<CompanionRow> {
  const careStreak = nextCareStreak(companion.lastInteractionAt, companion.careStreak, now);
  const mood = moodFor({ lastInteractionAt: now, careStreak, stage: companion.stage }, decayEnabled, now);

  const updated = await prisma.companion.update({
    where: { id: companion.id },
    data: { lastInteractionAt: now, careStreak, mood },
    select: COMPANION_SELECT,
  });

  await writeEvent(companion.id, {
    kind,
    description,
    growthDelta: 0,
    moodBefore: companion.mood,
    moodAfter: mood,
    occurredAt: now,
  });

  return updated;
}

/**
 * Mood is derived, so a row read hours after it was written can be carrying a stale
 * one. This brings it up to date on read and persists the correction, which keeps the
 * staff monitor's `mood` filter honest without a job to sweep for it. A transition is
 * worth a line in the history; a re-read that changes nothing writes nothing.
 */
export async function refreshMood(
  companion: CompanionRow,
  decayEnabled: boolean,
  now = new Date(),
): Promise<CompanionRow> {
  const mood = moodFor(companion, decayEnabled, now);
  if (mood === companion.mood) return companion;

  const updated = await prisma.companion.update({
    where: { id: companion.id },
    data: { mood },
    select: COMPANION_SELECT,
  });

  await writeEvent(companion.id, {
    kind: 'MOOD_CHANGE',
    description: `${companion.name} is feeling ${mood.toLowerCase()}.`,
    moodBefore: companion.mood,
    moodAfter: mood,
    occurredAt: now,
  });

  return updated;
}

export interface EventInput {
  // Kept loose deliberately: the seed scripts write events with kinds outside `EventKind`.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  kind: EventKind | string;
  description: string;
  growthDelta?: number;
  stageBefore?: CompanionStage | null;
  stageAfter?: CompanionStage | null;
  moodBefore?: CompanionMood | null;
  moodAfter?: CompanionMood | null;
  sourceType?: string | null;
  sourceId?: string | null;
  occurredAt?: Date;
}

/** Appends to the companion's history. Never throws into the caller's path. */
export async function writeEvent(companionId: string, input: EventInput): Promise<string | null> {
  try {
    const event = await prisma.companionEvent.create({
      data: {
        companionId,
        kind: input.kind,
        description: input.description.slice(0, 400),
        growthDelta: input.growthDelta ?? 0,
        stageBefore: input.stageBefore ?? null,
        stageAfter: input.stageAfter ?? null,
        moodBefore: input.moodBefore ?? null,
        moodAfter: input.moodAfter ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      },
      select: { id: true },
    });
    return event.id;
  } catch (error) {
    log.error({ err: error, companionId }, 'Could not record companion event');
    return null;
  }
}

/** Blueprint 06: a milestone has a purpose, a recipient, a trigger and an action. */
async function announceStage(companion: CompanionRow, previous: CompanionStage): Promise<void> {
  try {
    await enqueueNotification({
      schoolId: companion.schoolId,
      userId: companion.studentId,
      category: NotificationCategory.COMPANION_MILESTONE,
      priority: NotificationPriority.NORMAL,
      title: previous === CompanionStage.EGG ? `${companion.name} hatched!` : `${companion.name} grew!`,
      body:
        previous === CompanionStage.EGG
          ? `Your companion is out of its egg. Go and say hello.`
          : `${companion.name} is now ${describeStage(companion.stage)}.`,
      actionPath: '/companion',
      actionLabel: 'Go and see',
      sourceType: 'Companion',
      sourceId: companion.id,
      groupKey: `companion.stage:${companion.id}:${companion.stage}`,
    });
  } catch (error) {
    log.error({ err: error, companionId: companion.id }, 'Could not announce companion milestone');
  }
}

/** Words a seven-year-old can read, for the stage names. */
export function describeStage(stage: CompanionStage): string {
  switch (stage) {
    case CompanionStage.EGG:
      return 'still an egg';
    case CompanionStage.HATCHLING:
      return 'a hatchling';
    case CompanionStage.JUVENILE:
      return 'growing up';
    case CompanionStage.ADOLESCENT:
      return 'nearly grown';
    case CompanionStage.ADULT:
      return 'fully grown';
    case CompanionStage.RADIANT:
      return 'radiant';
    default:
      return 'growing';
  }
}

/** The school switches and stage ladder this module reads, with the schema's own
 *  defaults standing in for a school with no settings row at all. */
export async function readSettings(schoolId: string): Promise<{
  companionEnabled: boolean;
  companionDecayEnabled: boolean;
  stageThresholds: StageThresholds;
}> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: { companionEnabled: true, companionDecayEnabled: true, companionStageThresholds: true },
  });
  // A school with no settings row has not opted out of anything, so the column
  // defaults apply: companions on, decay off, hardcoded stage ladder.
  if (!settings) {
    return { companionEnabled: true, companionDecayEnabled: false, stageThresholds: STAGE_THRESHOLDS };
  }
  return {
    companionEnabled: settings.companionEnabled,
    companionDecayEnabled: settings.companionDecayEnabled,
    stageThresholds: resolveStageThresholds(settings.companionStageThresholds),
  };
}
