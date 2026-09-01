// ─────────────────────────────────────────────────────────────────────────────
// Seed — planning layer for evaluations, mastery and progress
// Blueprint 12: progress ("did the learner do it?") and mastery ("can the learner
// do it?") are separate records, and every mastery row names its evidence.
//
// Why this file exists. Nothing here touches the database. It turns the marked
// attempts produced by `attempts.seed.ts` into the exact rows that
// `evaluation.seed.ts` then writes, so the arithmetic can be read, printed and
// checked on its own. Splitting it out also keeps either half short enough to
// hold in one screen.
//
// No level, band or percentage is invented here. Accuracy comes from responses
// that were actually marked, and the level, confidence and percentage are
// produced by the production helpers in
// `src/modules/assessment/assessment.helpers.ts` — the same functions the API
// calls when it evaluates a live attempt. Mirroring them instead would let the
// demo drift away from the product the first time a threshold moves.
// ─────────────────────────────────────────────────────────────────────────────

import { EvidenceConfidence, EvidenceSource, MasteryLevel, PathItemStatus, type DifficultyBand } from '@prisma/client';

import {
  confidenceFromEvidence,
  masteryFromAccuracy,
  percentOf,
  shortId,
} from '../../src/modules/assessment/assessment.helpers';
import { isScored } from './attempts.plan';
import type { SeededAttempt } from './attempts.seed';
import type { ContentFixture } from './content.seed';
import type { SeededTopic } from './curriculum.seed';
import { hashInt, hoursAgo, pick } from './helpers';
import type { PeopleFixture } from './people.seed';
import type { QuestionFixture } from './question.seed';

/** The current topic-grain position, which the learning-path seed builds on. */
export interface SeededTopicMastery {
  studentId: string;
  topicId: string;
  topicKey: string;
  subjectId: string;
  subjectKey: string;
  programKey: string;
  level: MasteryLevel;
  band: DifficultyBand;
  accuracyPercent: number;
  /** How many evaluations stand behind this row, not how many items. */
  evidenceCount: number;
  lastEvidenceAt: Date;
  teacherOverride: boolean;
}

/** One evaluation held in memory so history can be stamped in date order. */
export interface PlannedEvaluation {
  topic: SeededTopic;
  attemptId: string;
  accuracyPercent: number;
  itemsConsidered: number;
  band: DifficultyBand;
  level: MasteryLevel;
  evaluatedAt: Date;
  notes: string;
}

/** One mastery row at either grain: topic-level leaves `objectiveId` null. */
export interface PlannedMastery {
  subjectId: string;
  topicId: string | null;
  objectiveId: string | null;
  level: MasteryLevel;
  band: DifficultyBand;
  scorePercent: number;
  evidenceSource: EvidenceSource;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  firstEvidenceAt: Date;
  lastEvidenceAt: Date;
  teacherOverride: boolean;
  overrideNote: string | null;
  overriddenById: string | null;
}

/** One progress row: exactly one of `activityId` or `lessonId` is set. */
export interface PlannedProgress {
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  status: PathItemStatus;
  completionPercent: number;
  attemptCount: number;
  bestScorePercent: number | null;
  lastScorePercent: number | null;
  timeSpentSeconds: number;
  hintsUsed: number;
  firstStartedAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
}

const LEVEL_LADDER: readonly MasteryLevel[] = [
  MasteryLevel.NOT_ASSESSED,
  MasteryLevel.EMERGING,
  MasteryLevel.DEVELOPING,
  MasteryLevel.PROFICIENT,
  MasteryLevel.MASTERED,
];

/** Moves a level one rung, clamped at both ends. Used only by teacher overrides. */
export function stepLevel(level: MasteryLevel, steps: number): MasteryLevel {
  const index = LEVEL_LADDER.indexOf(level);
  const next = Math.max(0, Math.min(LEVEL_LADDER.length - 1, (index < 0 ? 0 : index) + steps));
  return LEVEL_LADDER[next];
}

/** Never lets a seeded timestamp run past the moment the seed was started. */
export const notAfter = (value: Date, now: Date): Date =>
  new Date(Math.min(value.getTime(), now.getTime()));

/**
 * Turns a student's graded attempts into evaluations grouped by topic, oldest
 * first. Practice attempts never reach this function: `gradedByStudent` already
 * excludes them, because blueprint 03 keeps practice out of the evidence trail.
 */
export function evaluationsFor(
  graded: SeededAttempt[],
  topicById: Map<string, SeededTopic>,
): Map<string, PlannedEvaluation[]> {
  const byTopic = new Map<string, PlannedEvaluation[]>();
  for (const attempt of graded) {
    for (const result of attempt.topicResults) {
      if (result.presented <= 0) continue;
      const topic = topicById.get(result.topicId);
      if (!topic) continue;
      const accuracyPercent = percentOf(result.correct, result.presented);
      const rows = byTopic.get(result.topicId) ?? [];
      rows.push({
        topic,
        attemptId: attempt.id,
        accuracyPercent,
        itemsConsidered: result.presented,
        band: attempt.highestBandPassed ?? topic.band,
        level: masteryFromAccuracy(accuracyPercent, topic.masteryThreshold),
        evaluatedAt: attempt.completedAt ?? attempt.startedAt,
        notes:
          `${result.correct} of ${result.presented} items correct on “${topic.name}” ` +
          `in ${attempt.assessmentKey} (attempt ${attempt.attemptNumber}).`,
      });
      byTopic.set(result.topicId, rows);
    }
  }
  for (const rows of byTopic.values()) {
    rows.sort((left, right) => left.evaluatedAt.getTime() - right.evaluatedAt.getTime());
  }
  return byTopic;
}

/**
 * The current topic position, taken from the newest evaluation. `rows` must not
 * be empty — callers only reach this with a group that produced evidence.
 *
 * One pair in nine is given a teacher override, handed out by position in the
 * list rather than by a hash: a hash can miss every pair in a small cohort and
 * then the override column ships untested. The direction is deliberate — a
 * mastered topic is nudged down (a teacher not yet convinced by one good check),
 * anything else is nudged up (classwork the check never saw).
 */
export function topicMasteryOf(
  studentId: string,
  topicId: string,
  rows: PlannedEvaluation[],
  pairIndex: number,
  people: PeopleFixture,
): { plan: PlannedMastery; summary: SeededTopicMastery } {
  const first = rows[0];
  const latest = rows[rows.length - 1];
  const itemsConsidered = rows.reduce((sum, row) => sum + row.itemsConsidered, 0);
  const override = pairIndex % 9 === 0;
  const direction = latest.level === MasteryLevel.MASTERED ? -1 : 1;
  const level = override ? stepLevel(latest.level, direction) : latest.level;
  const plan: PlannedMastery = {
    subjectId: latest.topic.subjectId,
    topicId,
    objectiveId: null,
    level,
    band: latest.band,
    scorePercent: latest.accuracyPercent,
    evidenceSource: override ? EvidenceSource.TEACHER_JUDGMENT : EvidenceSource.SYSTEM_ASSESSMENT,
    confidence: override ? EvidenceConfidence.HIGH : confidenceFromEvidence(itemsConsidered),
    evidenceCount: rows.length,
    firstEvidenceAt: first.evaluatedAt,
    lastEvidenceAt: latest.evaluatedAt,
    teacherOverride: override,
    overrideNote: override
      ? `Teacher judgment: classwork on “${latest.topic.name}” sits ` +
        `${direction > 0 ? 'above' : 'below'} the ${latest.accuracyPercent}% the check ` +
        `measured, so the recorded level was moved to ${level}.`
      : null,
    overriddenById: override
      ? shortId(pick(people.teacherIds, `mastery-override:${studentId}:${topicId}`))
      : null,
  };
  const summary: SeededTopicMastery = {
    studentId,
    topicId,
    topicKey: latest.topic.key,
    subjectId: latest.topic.subjectId,
    subjectKey: latest.topic.subjectKey,
    programKey: latest.topic.programKey,
    level,
    band: latest.band,
    accuracyPercent: latest.accuracyPercent,
    evidenceCount: rows.length,
    lastEvidenceAt: latest.evaluatedAt,
    teacherOverride: override,
  };
  return { plan, summary };
}

/** Running totals for one objective across every graded attempt that touched it. */
interface ObjectiveBucket {
  topic: SeededTopic;
  presented: number;
  correct: number;
  evaluations: number;
  first: Date;
  last: Date;
}

/**
 * Objective-grain mastery. Unlike topic mastery this pools every attempt rather
 * than taking the newest, because an objective is usually carried by one or two
 * items per attempt and a single attempt would never clear `INSUFFICIENT`.
 */
export function objectiveMasteryOf(
  graded: SeededAttempt[],
  topicById: Map<string, SeededTopic>,
): PlannedMastery[] {
  const byObjective = new Map<string, ObjectiveBucket>();
  for (const attempt of graded) {
    const at = attempt.completedAt ?? attempt.startedAt;
    for (const result of attempt.objectiveResults) {
      if (result.presented <= 0) continue;
      const topic = topicById.get(result.topicId);
      if (!topic) continue;
      const bucket =
        byObjective.get(result.objectiveId) ??
        { topic, presented: 0, correct: 0, evaluations: 0, first: at, last: at };
      bucket.presented += result.presented;
      bucket.correct += result.correct;
      bucket.evaluations += 1;
      if (at < bucket.first) bucket.first = at;
      if (at > bucket.last) bucket.last = at;
      byObjective.set(result.objectiveId, bucket);
    }
  }

  const rows: PlannedMastery[] = [];
  for (const [objectiveId, bucket] of byObjective) {
    const scorePercent = percentOf(bucket.correct, bucket.presented);
    rows.push({
      subjectId: bucket.topic.subjectId,
      topicId: bucket.topic.id,
      objectiveId,
      level: masteryFromAccuracy(scorePercent, bucket.topic.masteryThreshold),
      band: bucket.topic.band,
      scorePercent,
      evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
      confidence: confidenceFromEvidence(bucket.presented),
      evidenceCount: bucket.evaluations,
      firstEvidenceAt: bucket.first,
      lastEvidenceAt: bucket.last,
      teacherOverride: false,
      overrideNote: null,
      overriddenById: null,
    });
  }
  return rows;
}

/** Running totals for one activity across every attempt that included it. */
interface ActivityBucket {
  topicId: string;
  attempts: number;
  presentedHigh: number;
  bestScorePercent: number;
  lastScorePercent: number;
  timeSpentSeconds: number;
  hintsUsed: number;
  firstStartedAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
}

/**
 * Activity engagement across every attempt, practice included — progress records
 * answer "did the learner do it?", and practice work counts towards that even
 * though blueprint 03 keeps it out of the evidence trail.
 */
export function activityProgressOf(
  all: SeededAttempt[],
  questions: QuestionFixture,
  now: Date,
): PlannedProgress[] {
  const ordered = [...all].sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  const byActivity = new Map<string, ActivityBucket>();
  for (const attempt of ordered) {
    const at = notAfter(attempt.completedAt ?? attempt.startedAt, now);
    for (const result of attempt.activityResults) {
      if (result.presented <= 0) continue;
      const total = (questions.byActivity[result.activityId] ?? []).length;
      const percent = percentOf(result.pointsAwarded, result.pointsPossible);
      const bucket =
        byActivity.get(result.activityId) ??
        {
          topicId: result.topicId,
          attempts: 0,
          presentedHigh: 0,
          bestScorePercent: 0,
          lastScorePercent: 0,
          timeSpentSeconds: 0,
          hintsUsed: 0,
          firstStartedAt: attempt.startedAt,
          lastActivityAt: at,
          completedAt: null,
        };
      bucket.attempts += 1;
      bucket.presentedHigh = Math.max(bucket.presentedHigh, result.presented);
      bucket.bestScorePercent = Math.max(bucket.bestScorePercent, percent);
      bucket.lastScorePercent = percent;
      bucket.timeSpentSeconds += result.timeSpentSeconds;
      bucket.hintsUsed += result.hintsUsed;
      bucket.lastActivityAt = at;
      // Completion is never taken back by a later, shorter attempt.
      if (isScored(attempt.status) && total > 0 && result.presented >= total) bucket.completedAt = at;
      byActivity.set(result.activityId, bucket);
    }
  }

  const rows: PlannedProgress[] = [];
  for (const [activityId, bucket] of byActivity) {
    const total = (questions.byActivity[activityId] ?? []).length;
    const done = bucket.completedAt !== null;
    rows.push({
      topicId: bucket.topicId,
      lessonId: null,
      activityId,
      status: done ? PathItemStatus.COMPLETED : PathItemStatus.IN_PROGRESS,
      completionPercent: done ? 100 : percentOf(bucket.presentedHigh, total),
      attemptCount: bucket.attempts,
      bestScorePercent: bucket.bestScorePercent,
      lastScorePercent: bucket.lastScorePercent,
      timeSpentSeconds: bucket.timeSpentSeconds,
      hintsUsed: bucket.hintsUsed,
      firstStartedAt: bucket.firstStartedAt,
      lastActivityAt: bucket.lastActivityAt,
      completedAt: bucket.completedAt,
    });
  }
  return rows;
}

/**
 * Lesson engagement. A student who answered questions on a topic is taken to
 * have opened its lesson first, so reading starts two hours before the earliest
 * attempt.
 *
 * Reading has no ground truth here — the seed records no lesson views — so
 * "finished reading" cannot be inferred the way an activity's completion can.
 * Graded evidence on a topic is treated as having read its lesson, except for
 * every fourth (student, lesson) pair in cohort order, which is left part-read.
 * That carve-out is positional, not `chance()`-gated: a probability can miss a
 * whole state in a cohort this small and ship an empty "resume where you left
 * off" panel, which is exactly the bug this seed exists to prevent.
 */
export function lessonProgressOf(
  studentId: string,
  all: SeededAttempt[],
  gradedTopicIds: Set<string>,
  content: ContentFixture,
  now: Date,
  pairIndex: number,
): PlannedProgress[] {
  const firstTouch = new Map<string, Date>();
  for (const attempt of all) {
    for (const result of attempt.topicResults) {
      const seen = firstTouch.get(result.topicId);
      if (!seen || attempt.startedAt < seen) firstTouch.set(result.topicId, attempt.startedAt);
    }
  }

  // Sorted so the carve-out below lands on the same lessons on every run,
  // whatever order the attempts happened to arrive in.
  const touched = [...firstTouch.entries()].sort(
    (left, right) => left[1].getTime() - right[1].getTime() || left[0].localeCompare(right[0]),
  );

  const rows: PlannedProgress[] = [];
  let position = pairIndex;
  for (const [topicId, touchedAt] of touched) {
    const lesson = content.lessonByTopic[topicId];
    if (!lesson) continue;
    const done = gradedTopicIds.has(topicId) && position % 4 !== 3;
    position += 1;
    const window = Math.max(360, lesson.estimatedMinutes * 60);
    const seconds = hashInt(`lesson-time:${studentId}:${lesson.id}`, 180, window);
    const firstStartedAt = hoursAgo(2, touchedAt);
    const spent = done ? seconds : Math.round(seconds * 0.45);
    const lastActivityAt = notAfter(new Date(firstStartedAt.getTime() + spent * 1000), now);
    rows.push({
      topicId,
      lessonId: lesson.id,
      activityId: null,
      status: done ? PathItemStatus.COMPLETED : PathItemStatus.IN_PROGRESS,
      completionPercent: done ? 100 : 45,
      attemptCount: 1,
      bestScorePercent: null,
      lastScorePercent: null,
      timeSpentSeconds: spent,
      hintsUsed: 0,
      firstStartedAt,
      lastActivityAt,
      completedAt: done ? lastActivityAt : null,
    });
  }
  return rows;
}
