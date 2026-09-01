// ─────────────────────────────────────────────────────────────────────────────
// Seed — building and marking the answers for one attempt (pure, no database)
// Blueprint 03 (item forms) and blueprint 12 (evidence).
//
// This is the half of the attempt seed that decides what a student answered and
// what it was worth. It imports no Prisma client, so the whole scoring path can
// be exercised without a database or an `.env` — which matters, because the claim
// this module rests on is that a seeded score is exactly the score the real
// marker would produce. `attempts.seed.ts` only persists what comes out of here.
//
// Nothing asserts a mark: `answer()` (in `attempts.marking.ts`, a mirror of
// `src/modules/assessment/assessment.marking.ts`) builds the response and then
// marks it, so the two can never drift apart within a run.
// ─────────────────────────────────────────────────────────────────────────────

import { answer } from './attempts.marking';
import type { MarkableQuestion, ResponseIntent } from './attempts.marking';
import { higherBand, shouldAnswerCorrectly, shouldSkip } from './attempts.plan';
import type { AttemptSlot, AttemptTally } from './attempts.plan';
import { hashInt } from './helpers';
import type { SeededAssessment } from './assessment.seed';
import type { DemoStudent } from './people.seed';
import type { QuestionFixture, SeededQuestion } from './question.seed';

/**
 * Items presented per attempt. A unit check legitimately spans every published
 * activity in the unit, which is forty-odd questions; real sittings sample, and so
 * does the demo history. Twelve fills every chart without inflating the seed into
 * tens of thousands of writes.
 */
export const ITEM_CAP = 12;

/** The question set for one attempt, in item order, each question at most once. */
export function itemsFor(assessment: SeededAssessment, questions: QuestionFixture): SeededQuestion[] {
  const items: SeededQuestion[] = [];
  const seen = new Set<string>();
  for (const activityId of assessment.activityIds) {
    for (const question of questions.byActivity[activityId] ?? []) {
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      items.push(question);
      if (items.length >= ITEM_CAP) return items;
    }
  }
  return items;
}

/**
 * `QuestionType` and `MarkableType` list the same six forms, so the cast is total.
 * `numericTolerance` is not carried on `SeededQuestion`; every numeric item in the
 * bank is written with a tolerance of zero, which is exactly what null means here.
 */
export function toMarkable(question: SeededQuestion): MarkableQuestion {
  return {
    id: question.id,
    type: question.type,
    pointsValue: question.pointsValue,
    options: question.options.map((option) => ({
      id: option.id,
      isCorrect: option.isCorrect,
      matchKey: option.matchKey,
    })),
    correctNumeric: question.correctNumeric,
    numericTolerance: null,
    correctBoolean: question.correctBoolean,
    correctText: question.correctText,
  };
}

/** One planned answer, already built and marked. */
export interface PlannedResponse {
  question: SeededQuestion;
  marked: ReturnType<typeof answer>;
  /** Hints revealed. Every hint in the bank costs nothing, so marks are unaffected. */
  hintsUsed: number;
  attemptsUsed: number;
  timeSpentSeconds: number;
  answeredAt: Date;
}

/**
 * Turns a slot and its item set into marked answers. `coverage` decides how far
 * the student got: an abandoned attempt stops a third of the way in, a finished
 * one reaches every item.
 */
export function buildResponses(
  slot: AttemptSlot,
  items: SeededQuestion[],
  student: DemoStudent,
  startedAt: Date,
): PlannedResponse[] {
  const reached = Math.max(1, Math.round(items.length * slot.coverage));
  const planned: PlannedResponse[] = [];
  let clock = startedAt.getTime();

  for (const question of items.slice(0, reached)) {
    const key = `${student.id}:${slot.target.kind}:${slot.attemptNumber}:${question.id}`;
    const correct = shouldAnswerCorrectly(slot.accuracy, `mark:${key}`);
    const intent: ResponseIntent = correct ? 'correct' : shouldSkip(`skip:${key}`) ? 'skipped' : 'wrong';
    const marked = answer(toMarkable(question), intent, key);

    const seconds = intent === 'skipped' ? hashInt(`time:${key}`, 4, 18) : hashInt(`time:${key}`, 20, 110);
    clock += (seconds + 3) * 1000;

    planned.push({
      question,
      marked,
      // Hints are only reached for on a struggle, and never past what was written.
      hintsUsed: slot.usesHints && !correct ? hashInt(`hints:${key}`, 0, question.hintIds.length) : 0,
      attemptsUsed: correct ? 1 : hashInt(`tries:${key}`, 1, 2),
      timeSpentSeconds: seconds,
      answeredAt: new Date(clock),
    });
  }

  return planned;
}

/** The attempt totals, read off the marks rather than asserted. */
export function tallyOf(planned: PlannedResponse[]): AttemptTally {
  const total: AttemptTally = {
    presented: 0,
    correct: 0,
    pointsAwarded: 0,
    pointsPossible: 0,
    timeSpentSeconds: 0,
    bandPassed: null,
  };
  for (const entry of planned) {
    total.presented += 1;
    total.pointsAwarded += entry.marked.mark.pointsAwarded;
    total.pointsPossible += entry.marked.mark.pointsPossible;
    total.timeSpentSeconds += entry.timeSpentSeconds;
    if (entry.marked.mark.isCorrect) {
      total.correct += 1;
      total.bandPassed = higherBand(total.bandPassed, entry.question.difficultyBand);
    }
  }
  return total;
}

/** The numbers every grouping of one attempt's answers produces. */
export interface SeededResultBucket {
  presented: number;
  correct: number;
  pointsAwarded: number;
  pointsPossible: number;
  timeSpentSeconds: number;
  hintsUsed: number;
}

/** Correctness on one topic inside one attempt. Feeds `TopicEvaluation`. */
export interface SeededTopicResult extends SeededResultBucket {
  topicId: string;
}

/** Correctness on one activity inside one attempt. Feeds `ProgressRecord`. */
export interface SeededActivityResult extends SeededResultBucket {
  activityId: string;
  topicId: string;
}

/** Correctness on one objective inside one attempt. Feeds objective mastery. */
export interface SeededObjectiveResult extends SeededResultBucket {
  objectiveId: string;
  topicId: string;
}

const emptyBucket = (): SeededResultBucket => ({
  presented: 0,
  correct: 0,
  pointsAwarded: 0,
  pointsPossible: 0,
  timeSpentSeconds: 0,
  hintsUsed: 0,
});

/**
 * Splits one attempt's marked answers by whatever key `keyOf` returns, skipping
 * answers with no key. Insertion order is preserved, so the first item's group
 * comes first — which keeps the seed log and the demo screens stable.
 */
function tallyGroups(
  planned: PlannedResponse[],
  keyOf: (entry: PlannedResponse) => string | null,
): Map<string, { bucket: SeededResultBucket; topicId: string }> {
  const groups = new Map<string, { bucket: SeededResultBucket; topicId: string }>();
  for (const entry of planned) {
    const key = keyOf(entry);
    if (!key) continue;
    const group = groups.get(key) ?? { bucket: emptyBucket(), topicId: entry.question.topicId };
    group.bucket.presented += 1;
    group.bucket.correct += entry.marked.mark.isCorrect ? 1 : 0;
    group.bucket.pointsAwarded += entry.marked.mark.pointsAwarded;
    group.bucket.pointsPossible += entry.marked.mark.pointsPossible;
    group.bucket.timeSpentSeconds += entry.timeSpentSeconds;
    group.bucket.hintsUsed += entry.hintsUsed;
    groups.set(key, group);
  }
  return groups;
}

/** Totals split by topic, which is what a topic evaluation is calculated from. */
export function topicResultsOf(planned: PlannedResponse[]): SeededTopicResult[] {
  return [...tallyGroups(planned, (entry) => entry.question.topicId)].map(([topicId, group]) => ({
    topicId,
    ...group.bucket,
  }));
}

/** Totals split by activity, which is what a progress record is calculated from. */
export function activityResultsOf(planned: PlannedResponse[]): SeededActivityResult[] {
  return [...tallyGroups(planned, (entry) => entry.question.activityId)].map(([activityId, group]) => ({
    activityId,
    topicId: group.topicId,
    ...group.bucket,
  }));
}

/**
 * Totals split by learning objective. Questions that carry no objective are left
 * out rather than pooled under a placeholder, so objective mastery only ever
 * rests on questions that were actually tagged.
 */
export function objectiveResultsOf(planned: PlannedResponse[]): SeededObjectiveResult[] {
  return [...tallyGroups(planned, (entry) => entry.question.objectiveId)].map(([objectiveId, group]) => ({
    objectiveId,
    topicId: group.topicId,
    ...group.bucket,
  }));
}
