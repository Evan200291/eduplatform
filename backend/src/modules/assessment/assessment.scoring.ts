// ─────────────────────────────────────────────────────────────────────────────
// Attempt scoring and item selection
// The arithmetic behind an attempt, kept in one file so it can be reviewed
// independently of the request handling: which item comes next, what the raw score
// is, and which difficulty band the learner actually passed.
//
// Blueprint 03: screening steps up a band on success and down on failure, and the
// result is a placement rather than a grade. Blueprint 12: the score is derived
// from stored evidence every time, never accumulated in place, so a teacher
// override recomputes the same way a submission does.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentStatus, DifficultyBand, type Prisma } from '@prisma/client';
import { preconditionFailed } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import {
  BAND_LADDER,
  bandIndex,
  percentOf,
  seededShuffle,
  stepBand,
} from './assessment.helpers';

export interface ItemPlan {
  itemId: string;
  activityId: string;
  difficultyBand: DifficultyBand;
  weight: number;
  sortOrder: number;
  isAdaptiveEntry: boolean;
}

export interface ResponseFacts {
  questionId: string;
  activityId: string;
  isCorrect: boolean | null;
  pointsAwarded: number;
  pointsPossible: number;
  answeredAt: Date;
}

export async function loadItems(assessmentId: string): Promise<ItemPlan[]> {
  const rows = await prisma.assessmentItem.findMany({
    where: { assessmentId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      activityId: true,
      difficultyBand: true,
      weight: true,
      sortOrder: true,
      isAdaptiveEntry: true,
    },
  });

  return rows.map((row) => ({
    itemId: row.id,
    activityId: row.activityId,
    difficultyBand: row.difficultyBand,
    weight: row.weight,
    sortOrder: row.sortOrder,
    isAdaptiveEntry: row.isAdaptiveEntry,
  }));
}

/**
 * The version a response must be pinned to. `assertItemsPublishable` runs at
 * publication time, so reaching this error means the content was unpublished after
 * the assessment went live — worth failing loudly rather than marking against the
 * mutable question row.
 */
export async function loadPublishedVersion(activityId: string) {
  const version = await prisma.activityVersion.findFirst({
    where: { activityId, status: ContentStatus.PUBLISHED },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, snapshot: true, publishedAt: true },
  });
  if (!version) {
    throw preconditionFailed('That activity has no published version to mark against.');
  }
  return version;
}

export async function loadResponseFacts(attemptId: string): Promise<ResponseFacts[]> {
  const rows = await prisma.studentResponse.findMany({
    where: { attemptId },
    orderBy: { answeredAt: 'asc' },
    select: {
      questionId: true,
      activityId: true,
      isCorrect: true,
      pointsAwarded: true,
      pointsPossible: true,
      answeredAt: true,
    },
  });

  return rows.map((row) => ({
    questionId: row.questionId,
    activityId: row.activityId,
    isCorrect: row.isCorrect,
    pointsAwarded: Number(row.pointsAwarded),
    pointsPossible: Number(row.pointsPossible),
    answeredAt: row.answeredAt,
  }));
}

export interface ActivityRollup {
  awarded: number;
  possible: number;
  correct: number;
  answered: number;
  lastAnsweredAt: Date;
}

/** Evidence is grouped per activity because an item is an activity, not a question. */
export function rollupByActivity(facts: readonly ResponseFacts[]): Map<string, ActivityRollup> {
  const groups = new Map<string, ActivityRollup>();

  for (const fact of facts) {
    const current = groups.get(fact.activityId) ?? {
      awarded: 0,
      possible: 0,
      correct: 0,
      answered: 0,
      lastAnsweredAt: fact.answeredAt,
    };
    current.awarded += fact.pointsAwarded;
    current.possible += fact.pointsPossible;
    current.correct += fact.isCorrect === true ? 1 : 0;
    current.answered += 1;
    if (fact.answeredAt > current.lastAnsweredAt) current.lastAnsweredAt = fact.answeredAt;
    groups.set(fact.activityId, current);
  }

  return groups;
}

/**
 * Replays the adaptive walk from the recorded evidence rather than storing a
 * cursor. A reload, a resumed session and a recomputation therefore all agree on
 * which band comes next.
 */
export function walkCurrentBand(
  assessment: { adaptiveEnabled: boolean; startingBand: DifficultyBand; passThreshold: number },
  groups: Map<string, ActivityRollup>,
): DifficultyBand {
  if (!assessment.adaptiveEnabled) return assessment.startingBand;

  const ordered = [...groups.entries()].sort(
    (left, right) => left[1].lastAnsweredAt.getTime() - right[1].lastAnsweredAt.getTime(),
  );

  let band = assessment.startingBand;
  for (const [, rollup] of ordered) {
    if (rollup.possible <= 0) continue;
    const passed = percentOf(rollup.awarded, rollup.possible) >= assessment.passThreshold;
    band = stepBand(band, passed ? 1 : -1);
  }
  return band;
}

/**
 * Picks the item to present next. The band is preferred exactly; when that band is
 * exhausted the nearest band is used, biased downwards so a struggling learner is
 * offered something gentler rather than something harder.
 */
export function selectNextItem(
  items: readonly ItemPlan[],
  answeredActivityIds: ReadonlySet<string>,
  band: DifficultyBand,
  options: { adaptiveEnabled: boolean; shuffleItems: boolean; seed: string; isFirstItem: boolean },
): ItemPlan | null {
  const remaining = items.filter((item) => !answeredActivityIds.has(item.activityId));
  if (remaining.length === 0) return null;

  const ordered = options.shuffleItems ? seededShuffle(remaining, options.seed) : remaining;
  if (!options.adaptiveEnabled) {
    return [...ordered].sort((left, right) => left.sortOrder - right.sortOrder)[0] ?? null;
  }

  if (options.isFirstItem) {
    const entry = ordered.find((item) => item.isAdaptiveEntry && item.difficultyBand === band);
    if (entry) return entry;
  }

  const target = bandIndex(band);
  const ranked = [...ordered].sort((left, right) => {
    const leftDistance = Math.abs(bandIndex(left.difficultyBand) - target);
    const rightDistance = Math.abs(bandIndex(right.difficultyBand) - target);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    // Same distance: prefer the easier band, then the author's ordering.
    const leftBand = bandIndex(left.difficultyBand);
    const rightBand = bandIndex(right.difficultyBand);
    if (leftBand !== rightBand) return leftBand - rightBand;
    return left.sortOrder - right.sortOrder;
  });

  return ranked[0] ?? null;
}

// ── Totals ──────────────────────────────────────────────────────────────────

export interface BandResult {
  band: DifficultyBand;
  awarded: number;
  possible: number;
  accuracyPercent: number;
  itemsAnswered: number;
  passed: boolean;
}

export interface AttemptTotals {
  scoreRaw: number;
  scoreMax: number;
  scorePercent: number;
  itemsPresented: number;
  itemsCorrect: number;
  questionsAnswered: number;
  highestBandPassed: DifficultyBand | null;
  bands: BandResult[];
}

/**
 * Raw score is weighted per item: `weight` is a percentage, so the default 100
 * leaves the arithmetic unchanged and a weight of 200 counts an item twice.
 */
export function computeTotals(
  items: readonly ItemPlan[],
  facts: readonly ResponseFacts[],
  passThreshold: number,
): AttemptTotals {
  const groups = rollupByActivity(facts);
  const byActivity = new Map(items.map((item) => [item.activityId, item]));

  let scoreRaw = 0;
  let scoreMax = 0;
  let itemsCorrect = 0;
  const perBand = new Map<DifficultyBand, BandResult>();

  for (const [activityId, rollup] of groups) {
    const item = byActivity.get(activityId);
    const weight = (item?.weight ?? 100) / 100;
    const band = item?.difficultyBand ?? DifficultyBand.DEVELOPING;

    scoreRaw += rollup.awarded * weight;
    scoreMax += rollup.possible * weight;

    const itemPassed = rollup.possible > 0 && percentOf(rollup.awarded, rollup.possible) >= passThreshold;
    if (itemPassed) itemsCorrect += 1;

    const current = perBand.get(band) ?? {
      band,
      awarded: 0,
      possible: 0,
      accuracyPercent: 0,
      itemsAnswered: 0,
      passed: false,
    };
    current.awarded += rollup.awarded;
    current.possible += rollup.possible;
    current.itemsAnswered += 1;
    perBand.set(band, current);
  }

  const bands = BAND_LADDER.filter((band) => perBand.has(band)).map((band) => {
    const result = perBand.get(band) as BandResult;
    result.accuracyPercent = percentOf(result.awarded, result.possible);
    result.passed = result.possible > 0 && result.accuracyPercent >= passThreshold;
    return result;
  });

  const passedBands = bands.filter((entry) => entry.passed);
  const highestBandPassed =
    passedBands.length === 0
      ? null
      : (passedBands.reduce((highest, entry) =>
          bandIndex(entry.band) > bandIndex(highest.band) ? entry : highest,
        ).band);

  return {
    scoreRaw: round2(scoreRaw),
    scoreMax: round2(scoreMax),
    scorePercent: percentOf(scoreRaw, scoreMax),
    itemsPresented: groups.size,
    itemsCorrect,
    questionsAnswered: facts.length,
    highestBandPassed,
    bands,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Blueprint 03: the teacher is told the placement in plain language, including how
 * much evidence it rests on. Never shown to the learner.
 */
export function buildOutcomeSummary(
  totals: AttemptTotals,
  passThreshold: number,
): string {
  const placement = totals.highestBandPassed ?? 'no band';
  const bandDetail = totals.bands
    .map((band) => `${band.band} ${band.accuracyPercent}%`)
    .join(', ');

  const headline =
    totals.highestBandPassed === null
      ? `No band reached the ${passThreshold}% pass mark.`
      : `Highest band passed: ${placement}.`;

  return [
    headline,
    `Overall ${totals.scorePercent}% across ${totals.itemsPresented} item(s) and ${totals.questionsAnswered} question(s).`,
    bandDetail ? `By band: ${bandDetail}.` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ')
    .slice(0, 600);
}

/**
 * Recomputes and stores an attempt's totals from its stored responses. Used by both
 * submission and teacher override, so the two can never disagree.
 */
export async function recomputeAttemptTotals(
  attemptId: string,
  assessment: { adaptiveEnabled: boolean; startingBand: DifficultyBand; passThreshold: number },
  assessmentId: string,
  extra: Prisma.AssessmentAttemptUpdateInput = {},
): Promise<AttemptTotals> {
  const [items, facts] = await Promise.all([loadItems(assessmentId), loadResponseFacts(attemptId)]);
  const totals = computeTotals(items, facts, assessment.passThreshold);

  await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      scoreRaw: totals.scoreRaw,
      scoreMax: totals.scoreMax,
      scorePercent: totals.scorePercent,
      itemsPresented: totals.itemsPresented,
      itemsCorrect: totals.itemsCorrect,
      highestBandPassed: totals.highestBandPassed,
      outcomeSummary: buildOutcomeSummary(totals, assessment.passThreshold),
      ...extra,
    },
  });

  return totals;
}
