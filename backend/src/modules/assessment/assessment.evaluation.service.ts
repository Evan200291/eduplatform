// ─────────────────────────────────────────────────────────────────────────────
// Evidence and inference
// Blueprint 12: "Completion alone does not equal mastery." A submitted attempt
// produces three different kinds of record, and this file is the only place that
// decides which is which:
//
//   StudentResponse  — raw evidence, written during the attempt (attempts service)
//   TopicEvaluation  — the inference drawn from that evidence, labelled with its
//                      source and confidence, superseded rather than overwritten
//   MasteryRecord    — the current position per topic and per objective
//   ProgressRecord   — product activity ("did the learner do it?"), never mastery
//
// A teacher judgment outranks system inference: where `teacherOverride` is set on a
// mastery record, the level and band are left alone and only the evidence counters
// move. Blueprint 04 — the teacher remains the decision maker.
//
// Recognition is the last step and never a condition of any of the above. Once the
// evidence is written, `creditLearning` pays for it through the ledger; if that
// fails, the learning still stands. See `gamification/learning.points.ts` for the
// amounts and `gamification.service.recordLearningEvent` for the chain each award
// sets off (points → streak → badges → companion).
// ─────────────────────────────────────────────────────────────────────────────

import {
  DifficultyBand,
  EvidenceSource,
  MasteryLevel,
  PathItemStatus,
  PointsReason,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { logger } from '../../core/logger';
import { intensityFor, recordLearningEvent } from '../gamification/gamification.service';
import {
  pointsForActivity,
  pointsForAssessment,
  pointsForMastery,
} from '../gamification/learning.points';
import {
  confidenceFromEvidence,
  higherBand,
  masteryFromAccuracy,
  percentOf,
  readAssessmentEngineSettings,
} from './assessment.helpers';
import { parseActivitySnapshot } from './assessment.marking';
import { loadItems, type AttemptTotals } from './assessment.scoring';
import { proposeFromEvidence, type TopicOutcome } from './assessment.recommendations';

const log = logger.child({ module: 'assessment.evidence' });

/** Blueprint 03: mastery decays if unpractised, which is what prompts reassessment. */
const REVIEW_INTERVAL_DAYS = 30;

export interface EvidenceAttempt {
  id: string;
  schoolId: string;
  studentId: string;
  assessmentId: string;
  isPractice: boolean;
  assessment: {
    id: string;
    kind: string;
    subjectId: string;
    topicId: string | null;
    passThreshold: number;
    driveRecommendations: boolean;
  };
}

interface Aggregate {
  awarded: number;
  possible: number;
  questions: number;
  activities: Set<string>;
  bestBand: DifficultyBand | null;
  attemptedBand: DifficultyBand | null;
}

function emptyAggregate(): Aggregate {
  return {
    awarded: 0,
    possible: 0,
    questions: 0,
    activities: new Set<string>(),
    bestBand: null,
    attemptedBand: null,
  };
}

export interface EvidenceOutcome {
  evaluations: number;
  masteryRecords: number;
  progressRecords: number;
  recommendations: number;
}

/**
 * Reads the attempt's stored responses and writes every derived record. Called
 * after a submission and again after a teacher override, so the inference always
 * reflects the evidence as it currently stands.
 */
export async function recordAttemptEvidence(
  context: ActorContext | null,
  attempt: EvidenceAttempt,
  totals: AttemptTotals,
): Promise<EvidenceOutcome> {
  const responses = await prisma.studentResponse.findMany({
    where: { attemptId: attempt.id },
    select: {
      questionId: true,
      activityId: true,
      activityVersionId: true,
      isCorrect: true,
      pointsAwarded: true,
      pointsPossible: true,
      hintsUsed: true,
      timeSpentSeconds: true,
      difficultyBand: true,
    },
  });

  if (responses.length === 0) {
    return { evaluations: 0, masteryRecords: 0, progressRecords: 0, recommendations: 0 };
  }

  const items = await loadItems(attempt.assessmentId);
  const itemBands = new Map(items.map((item) => [item.activityId, item.difficultyBand]));

  const activityIds = [...new Set(responses.map((row) => row.activityId))];
  const activities = await prisma.activity.findMany({
    where: { id: { in: activityIds } },
    select: { id: true, topicId: true, lessonId: true, subjectId: true },
  });
  const activityById = new Map(activities.map((row) => [row.id, row]));

  const objectiveByQuestion = await loadObjectiveMap(responses);

  // ── Aggregate per topic and per objective ─────────────────────────────────
  const byTopic = new Map<string, Aggregate>();
  const byObjective = new Map<string, Aggregate & { topicId: string; subjectId: string }>();
  const byActivity = new Map<
    string,
    { awarded: number; possible: number; hintsUsed: number; timeSpentSeconds: number }
  >();

  for (const response of responses) {
    const activity = activityById.get(response.activityId);
    if (!activity) continue;

    const band = itemBands.get(response.activityId) ?? response.difficultyBand;
    const awarded = Number(response.pointsAwarded);
    const possible = Number(response.pointsPossible);

    const topic = byTopic.get(activity.topicId) ?? emptyAggregate();
    topic.awarded += awarded;
    topic.possible += possible;
    topic.questions += 1;
    topic.activities.add(response.activityId);
    topic.attemptedBand = topic.attemptedBand ? higherBand(topic.attemptedBand, band) : band;
    if (response.isCorrect === true) {
      topic.bestBand = topic.bestBand ? higherBand(topic.bestBand, band) : band;
    }
    byTopic.set(activity.topicId, topic);

    const objectiveId = objectiveByQuestion.get(response.questionId);
    if (objectiveId) {
      const objective =
        byObjective.get(objectiveId) ??
        Object.assign(emptyAggregate(), { topicId: activity.topicId, subjectId: activity.subjectId });
      objective.awarded += awarded;
      objective.possible += possible;
      objective.questions += 1;
      objective.activities.add(response.activityId);
      objective.attemptedBand = objective.attemptedBand
        ? higherBand(objective.attemptedBand, band)
        : band;
      if (response.isCorrect === true) {
        objective.bestBand = objective.bestBand ? higherBand(objective.bestBand, band) : band;
      }
      byObjective.set(objectiveId, objective);
    }

    const progress = byActivity.get(response.activityId) ?? {
      awarded: 0,
      possible: 0,
      hintsUsed: 0,
      timeSpentSeconds: 0,
    };
    progress.awarded += awarded;
    progress.possible += possible;
    progress.hintsUsed += response.hintsUsed;
    progress.timeSpentSeconds += response.timeSpentSeconds;
    byActivity.set(response.activityId, progress);
  }

  const topics = await prisma.topic.findMany({
    where: { id: { in: [...byTopic.keys()] } },
    select: { id: true, name: true, subjectId: true, masteryThreshold: true },
  });
  const topicById = new Map(topics.map((row) => [row.id, row]));

  const engineSettings = await readAssessmentEngineSettings(attempt.schoolId);

  // Practice runs are recorded as activity but never as placement or mastery.
  if (attempt.isPractice) {
    const completed = await writeProgressRecords(attempt, byActivity, activityById);
    // Practice still earns for the activities done — it is real learning — but not
    // the attempt bonus, so a learner cannot farm the same practice set for it.
    await creditLearning(attempt, completed, [], null);
    return { evaluations: 0, masteryRecords: 0, progressRecords: completed.length, recommendations: 0 };
  }

  // ── Write the inference ───────────────────────────────────────────────────
  let evaluations = 0;
  let masteryRecords = 0;
  const topicLevels: TopicOutcome[] = [];

  for (const [topicId, aggregate] of byTopic) {
    const topic = topicById.get(topicId);
    if (!topic) continue;

    const accuracyPercent = percentOf(aggregate.awarded, aggregate.possible);
    const level = masteryFromAccuracy(accuracyPercent, topic.masteryThreshold);
    const confidence = confidenceFromEvidence(aggregate.questions, engineSettings.confidence);
    const band = aggregate.bestBand ?? aggregate.attemptedBand ?? DifficultyBand.DEVELOPING;

    await prisma.topicEvaluation.updateMany({
      where: { studentId: attempt.studentId, topicId, supersededAt: null },
      data: { supersededAt: new Date() },
    });

    await prisma.topicEvaluation.create({
      data: {
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        topicId,
        attemptId: attempt.id,
        band,
        masteryLevel: level,
        accuracyPercent,
        itemsConsidered: aggregate.activities.size,
        evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
        confidence,
        notes: `${aggregate.questions} question(s) across ${aggregate.activities.size} item(s).`.slice(0, 600),
      },
    });
    evaluations += 1;

    masteryRecords += await upsertMastery({
      schoolId: attempt.schoolId,
      studentId: attempt.studentId,
      subjectId: topic.subjectId,
      topicId,
      objectiveId: null,
      level,
      band,
      scorePercent: accuracyPercent,
      confidence,
      evidenceCount: aggregate.questions,
    });

    topicLevels.push({ topicId, topicName: topic.name, level, accuracyPercent });
  }

  for (const [objectiveId, aggregate] of byObjective) {
    const topic = topicById.get(aggregate.topicId);
    const threshold = topic?.masteryThreshold ?? 80;
    const accuracyPercent = percentOf(aggregate.awarded, aggregate.possible);

    masteryRecords += await upsertMastery({
      schoolId: attempt.schoolId,
      studentId: attempt.studentId,
      subjectId: aggregate.subjectId,
      topicId: aggregate.topicId,
      objectiveId,
      level: masteryFromAccuracy(accuracyPercent, threshold),
      band: aggregate.bestBand ?? aggregate.attemptedBand ?? DifficultyBand.DEVELOPING,
      scorePercent: accuracyPercent,
      confidence: confidenceFromEvidence(aggregate.questions, engineSettings.confidence),
      evidenceCount: aggregate.questions,
    });
  }

  const completed = await writeProgressRecords(attempt, byActivity, activityById);
  await creditLearning(attempt, completed, topicLevels, totals);

  const recommendations = attempt.assessment.driveRecommendations
    ? await proposeFromEvidence(context, attempt, totals, topicLevels)
    : 0;

  return { evaluations, masteryRecords, progressRecords: completed.length, recommendations };
}

// ── Objective attribution ───────────────────────────────────────────────────

/**
 * Objective links are read out of the version snapshot the learner actually saw,
 * not out of the current question row, so re-tagging a question later cannot
 * silently re-attribute evidence that has already been gathered.
 */
async function loadObjectiveMap(
  responses: readonly { questionId: string; activityVersionId: string | null }[],
): Promise<Map<string, string>> {
  const versionIds = [
    ...new Set(responses.map((row) => row.activityVersionId).filter((id): id is string => id !== null)),
  ];
  const map = new Map<string, string>();
  if (versionIds.length === 0) return map;

  const versions = await prisma.activityVersion.findMany({
    where: { id: { in: versionIds } },
    select: { snapshot: true },
  });

  for (const version of versions) {
    const snapshot = parseActivitySnapshot(version.snapshot);
    for (const question of snapshot.questions) {
      if (question.objectiveId) map.set(question.questionId, question.objectiveId);
    }
  }
  return map;
}

// ── Mastery ─────────────────────────────────────────────────────────────────

interface MasteryInput {
  schoolId: string;
  studentId: string;
  subjectId: string;
  topicId: string;
  objectiveId: string | null;
  level: MasteryLevel;
  band: DifficultyBand;
  scorePercent: number;
  confidence: Prisma.MasteryRecordCreateInput['confidence'];
  evidenceCount: number;
}

/**
 * `@@unique([studentId, topicId, objectiveId])` cannot be used with Prisma's
 * `upsert` here: MySQL treats each NULL `objectiveId` as distinct, so a topic-level
 * row would be inserted again on every attempt. The lookup is therefore explicit.
 */
async function upsertMastery(input: MasteryInput): Promise<number> {
  const existing = await prisma.masteryRecord.findFirst({
    where: {
      studentId: input.studentId,
      topicId: input.topicId,
      objectiveId: input.objectiveId,
    },
    select: { id: true, teacherOverride: true, level: true, masteredAt: true, evidenceCount: true },
  });

  const now = new Date();
  const reviewDueAt =
    input.level === MasteryLevel.MASTERED
      ? new Date(now.getTime() + REVIEW_INTERVAL_DAYS * 86_400_000)
      : null;

  if (!existing) {
    await prisma.masteryRecord.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        subjectId: input.subjectId,
        topicId: input.topicId,
        objectiveId: input.objectiveId,
        level: input.level,
        band: input.band,
        scorePercent: input.scorePercent,
        evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
        confidence: input.confidence,
        evidenceCount: input.evidenceCount,
        firstEvidenceAt: now,
        lastEvidenceAt: now,
        masteredAt: input.level === MasteryLevel.MASTERED ? now : null,
        reviewDueAt,
      },
    });
    return 1;
  }

  // A teacher judgment stands. Only the evidence counters move.
  if (existing.teacherOverride) {
    await prisma.masteryRecord.update({
      where: { id: existing.id },
      data: {
        evidenceCount: { increment: input.evidenceCount },
        lastEvidenceAt: now,
      },
    });
    return 1;
  }

  await prisma.masteryRecord.update({
    where: { id: existing.id },
    data: {
      level: input.level,
      band: input.band,
      scorePercent: input.scorePercent,
      evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
      confidence: input.confidence,
      evidenceCount: { increment: input.evidenceCount },
      lastEvidenceAt: now,
      masteredAt:
        input.level === MasteryLevel.MASTERED ? (existing.masteredAt ?? now) : null,
      reviewDueAt,
    },
  });
  return 1;
}

// ── Progress (product activity, not mastery) ────────────────────────────────

/** One activity the attempt finished, and the row that records it. */
interface CompletedActivity {
  progressId: string;
  scorePercent: number;
}

async function writeProgressRecords(
  attempt: EvidenceAttempt,
  byActivity: Map<string, { awarded: number; possible: number; hintsUsed: number; timeSpentSeconds: number }>,
  activityById: Map<string, { id: string; topicId: string; lessonId: string | null }>,
): Promise<CompletedActivity[]> {
  const written: CompletedActivity[] = [];

  for (const [activityId, totals] of byActivity) {
    const activity = activityById.get(activityId);
    if (!activity) continue;

    const scorePercent = percentOf(totals.awarded, totals.possible);
    const now = new Date();

    const existing = await prisma.progressRecord.findFirst({
      where: { studentId: attempt.studentId, activityId },
      select: { id: true, bestScorePercent: true },
    });

    if (existing) {
      await prisma.progressRecord.update({
        where: { id: existing.id },
        data: {
          status: PathItemStatus.COMPLETED,
          completionPercent: 100,
          attemptCount: { increment: 1 },
          bestScorePercent: Math.max(existing.bestScorePercent ?? 0, scorePercent),
          lastScorePercent: scorePercent,
          timeSpentSeconds: { increment: totals.timeSpentSeconds },
          hintsUsed: { increment: totals.hintsUsed },
          lastActivityAt: now,
          completedAt: now,
        },
      });
      written.push({ progressId: existing.id, scorePercent });
    } else {
      const created = await prisma.progressRecord.create({
        data: {
          schoolId: attempt.schoolId,
          studentId: attempt.studentId,
          topicId: activity.topicId,
          lessonId: activity.lessonId,
          activityId,
          status: PathItemStatus.COMPLETED,
          completionPercent: 100,
          attemptCount: 1,
          bestScorePercent: scorePercent,
          lastScorePercent: scorePercent,
          timeSpentSeconds: totals.timeSpentSeconds,
          hintsUsed: totals.hintsUsed,
          firstStartedAt: now,
          lastActivityAt: now,
          completedAt: now,
        },
        select: { id: true },
      });
      written.push({ progressId: created.id, scorePercent });
    }
  }

  return written;
}

// ── Recognition ─────────────────────────────────────────────────────────────

/**
 * Pays for the learning that has just been recorded.
 *
 * Every award is keyed to a durable record rather than to this call, which is what
 * makes the whole step replayable: `earnPoints` dedupes on
 * `(student, reason, sourceType, sourceId)`, so re-evaluating an attempt after a
 * teacher override credits nothing new, and — because an activity has exactly one
 * progress row per learner — redoing the same activity for a second helping of
 * points is impossible by construction. Blueprint 03's "must not reward repeated
 * low-value actions" is enforced by the key, not by a rate limit.
 *
 * `totals` is null for a practice run, which earns for its activities but not for
 * the attempt. Failures are logged and swallowed: recognition is a consequence of
 * learning and must never undo it.
 */
async function creditLearning(
  attempt: EvidenceAttempt,
  completed: readonly CompletedActivity[],
  topicLevels: readonly TopicOutcome[],
  totals: AttemptTotals | null,
): Promise<void> {
  try {
    const intensity = await intensityFor(attempt.schoolId);

    for (const activity of completed) {
      await recordLearningEvent({
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        reason: PointsReason.ACTIVITY_COMPLETION,
        points: pointsForActivity(activity.scorePercent, intensity),
        sourceType: 'ProgressRecord',
        sourceId: activity.progressId,
        note: 'Activity completed',
      });
    }

    if (totals) {
      await recordLearningEvent({
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        reason: PointsReason.ASSESSMENT_COMPLETION,
        points: pointsForAssessment(totals.scorePercent, totals.itemsPresented, intensity),
        sourceType: 'AssessmentAttempt',
        sourceId: attempt.id,
        note: 'Assessment finished',
      });
    }

    // A milestone is a property of the topic, so the source is the topic and the
    // level is in the source type: a learner crossing into PROFICIENT and later
    // into MASTERED is paid once for each, and never again for either.
    for (const topic of topicLevels) {
      const points = pointsForMastery(topic.level, intensity);
      if (points === 0) continue;
      await recordLearningEvent({
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        reason: PointsReason.MASTERY_MILESTONE,
        points,
        sourceType: topic.level === MasteryLevel.MASTERED ? 'TopicMastered' : 'TopicProficient',
        sourceId: topic.topicId,
        note: `${topic.topicName}: ${topic.level.toLowerCase()}`,
        // The milestone is recognition of learning already counted above; counting
        // it again would extend the habit measure twice for one sitting.
        countsAsLearning: false,
      });
    }
  } catch (error) {
    log.error({ err: error, attemptId: attempt.id }, 'Could not credit learning points');
  }
}

/** Exported for the mastery-override route in the progress module. */
export function reviewDueFrom(level: MasteryLevel, from = new Date()): Date | null {
  return level === MasteryLevel.MASTERED
    ? new Date(from.getTime() + REVIEW_INTERVAL_DAYS * 86_400_000)
    : null;
}
