// ─────────────────────────────────────────────────────────────────────────────
// Seed — writing topic evaluations, mastery records and progress records
// Blueprint 12: progress and mastery are separate records, and every mastery row
// carries the evidence source it rests on.
//
// The arithmetic lives next door in `evaluation.plan.ts`, which turns marked
// attempts into rows without touching the database. This file only writes them:
//   • `TopicEvaluation` — one row per graded attempt that touched a topic, kept
//     as history. All but the newest per (student, topic) carry `supersededAt`.
//   • `MasteryRecord` — the current position, at topic grain and objective grain.
//   • `ProgressRecord` — engagement only: activities answered and lessons read.
//
// Matching by position, never by upsert. `TopicEvaluation` has no unique key at
// all, and the two compound uniques that do exist — `mastery_student_target_unique`
// and `progress_student_activity_unique` — both contain nullable columns that this
// seed leaves null (a topic-grain mastery row has no objective; a lesson progress
// row has no activity), which rules out the generated unique input. So every write
// reads its group first, matches in memory, then updates in place.
//
// Deliberately left alone. Surplus is only removed inside a group that still has
// evidence. If a topic stops producing evidence altogether its old rows stay: a
// teacher may have written mastery or progress for that topic through the API, and
// a seed run cannot tell that apart from its own leftovers.
// ─────────────────────────────────────────────────────────────────────────────

import { EvidenceSource, MasteryLevel } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { confidenceFromEvidence } from '../../src/modules/assessment/assessment.helpers';
import type { AttemptFixture } from './attempts.seed';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import {
  activityProgressOf,
  evaluationsFor,
  lessonProgressOf,
  objectiveMasteryOf,
  topicMasteryOf,
} from './evaluation.plan';
import type { PlannedEvaluation, PlannedMastery, PlannedProgress, SeededTopicMastery } from './evaluation.plan';
import { daysAhead, log, step } from './helpers';
import type { PeopleFixture } from './people.seed';
import type { QuestionFixture } from './question.seed';
import type { SchoolFixture } from './school.seed';

export type { SeededTopicMastery };

export interface EvaluationFixture {
  topicMastery: SeededTopicMastery[];
  /** Topic mastery per student id, in the order the topics were evaluated. */
  masteryByStudent: Record<string, SeededTopicMastery[]>;
  /** The same rows per student, weakest first — what a learning path starts from. */
  weakestByStudent: Record<string, SeededTopicMastery[]>;
  evaluations: number;
  objectiveMastery: number;
  progressRecords: number;
}

/**
 * Rewrites one student's evaluation history for one topic. Rows are matched by
 * position in date order because `TopicEvaluation` has no unique key, and every
 * row but the last is stamped with the moment the next one replaced it.
 */
async function writeEvaluations(
  schoolId: string,
  studentId: string,
  topicId: string,
  planned: PlannedEvaluation[],
): Promise<void> {
  const existing = await prisma.topicEvaluation.findMany({
    where: { studentId, topicId },
    orderBy: [{ evaluatedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  const keep: string[] = [];

  for (const [index, row] of planned.entries()) {
    const data = {
      schoolId,
      attemptId: row.attemptId,
      band: row.band,
      masteryLevel: row.level,
      accuracyPercent: row.accuracyPercent,
      itemsConsidered: row.itemsConsidered,
      evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
      confidence: confidenceFromEvidence(row.itemsConsidered),
      notes: row.notes,
      evaluatedAt: row.evaluatedAt,
      supersededAt: index + 1 < planned.length ? planned[index + 1].evaluatedAt : null,
    };

    if (index < existing.length) {
      const found = existing[index].id;
      await prisma.topicEvaluation.update({ where: { id: found }, data });
      keep.push(found);
      continue;
    }
    const created = await prisma.topicEvaluation.create({
      data: { ...data, studentId, topicId },
      select: { id: true },
    });
    keep.push(created.id);
  }

  if (keep.length > 0) {
    await prisma.topicEvaluation.deleteMany({ where: { studentId, topicId, id: { notIn: keep } } });
  } else {
    await prisma.topicEvaluation.deleteMany({ where: { studentId, topicId } });
  }
}

/**
 * One mastery row, located by its target: `mastery_student_target_unique` covers
 * `(studentId, topicId, objectiveId)` and the last two are nullable, so a
 * topic-grain row cannot be addressed through the unique input.
 */
async function writeMastery(schoolId: string, studentId: string, row: PlannedMastery): Promise<void> {
  const mastered = row.level === MasteryLevel.MASTERED;
  const data = {
    schoolId,
    subjectId: row.subjectId,
    level: row.level,
    band: row.band,
    scorePercent: row.scorePercent,
    evidenceSource: row.evidenceSource,
    confidence: row.confidence,
    evidenceCount: row.evidenceCount,
    teacherOverride: row.teacherOverride,
    overrideNote: row.overrideNote,
    overriddenById: row.overriddenById,
    firstEvidenceAt: row.firstEvidenceAt,
    lastEvidenceAt: row.lastEvidenceAt,
    masteredAt: mastered ? row.lastEvidenceAt : null,
    // Blueprint 03: mastery decays if unpractised. Older evidence therefore leaves
    // the row already overdue, which is what the reassessment queue has to surface.
    reviewDueAt: daysAhead(mastered ? 30 : 7, row.lastEvidenceAt),
  };

  const found = await prisma.masteryRecord.findFirst({
    where: { studentId, topicId: row.topicId, objectiveId: row.objectiveId },
    select: { id: true },
  });
  if (found) {
    await prisma.masteryRecord.update({ where: { id: found.id }, data });
    return;
  }
  await prisma.masteryRecord.create({
    data: { ...data, studentId, topicId: row.topicId, objectiveId: row.objectiveId },
  });
}

/**
 * One progress row, located by `(studentId, activityId, lessonId)` for the same
 * reason: `progress_student_activity_unique` contains a nullable `activityId`, and
 * lesson rows leave it null.
 */
async function writeProgress(schoolId: string, studentId: string, row: PlannedProgress): Promise<void> {
  const { topicId, lessonId, activityId, ...rest } = row;
  const found = await prisma.progressRecord.findFirst({
    where: { studentId, activityId, lessonId },
    select: { id: true },
  });
  if (found) {
    await prisma.progressRecord.update({ where: { id: found.id }, data: { schoolId, ...rest } });
    return;
  }
  await prisma.progressRecord.create({
    data: { schoolId, studentId, topicId, lessonId, activityId, ...rest },
  });
}

export async function seedEvaluations(
  fixture: SchoolFixture,
  people: PeopleFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  questions: QuestionFixture,
  attempts: AttemptFixture,
  now: Date,
): Promise<EvaluationFixture> {
  step('Topic evaluations, mastery and progress');

  const topicById = new Map<string, SeededTopic>(curriculum.topics.map((topic) => [topic.id, topic]));
  const topicMastery: SeededTopicMastery[] = [];
  const masteryByStudent: Record<string, SeededTopicMastery[]> = {};
  const weakestByStudent: Record<string, SeededTopicMastery[]> = {};
  let evaluations = 0;
  let objectiveRows = 0;
  let progressRows = 0;
  let overrides = 0;
  let pairIndex = 0;
  let lessonIndex = 0;

  for (const student of people.students) {
    const graded = attempts.gradedByStudent[student.id] ?? [];
    const all = attempts.byStudent[student.id] ?? [];
    const byTopic = evaluationsFor(graded, topicById);
    const mine: SeededTopicMastery[] = [];

    for (const [topicId, rows] of byTopic) {
      await writeEvaluations(fixture.schoolId, student.id, topicId, rows);
      evaluations += rows.length;
      const { plan, summary } = topicMasteryOf(student.id, topicId, rows, pairIndex, people);
      await writeMastery(fixture.schoolId, student.id, plan);
      if (plan.teacherOverride) overrides += 1;
      topicMastery.push(summary);
      mine.push(summary);
      pairIndex += 1;
    }

    for (const row of objectiveMasteryOf(graded, topicById)) {
      await writeMastery(fixture.schoolId, student.id, row);
      objectiveRows += 1;
    }

    const gradedTopicIds = new Set(byTopic.keys());
    for (const row of activityProgressOf(all, questions, now)) {
      await writeProgress(fixture.schoolId, student.id, row);
      progressRows += 1;
    }
    for (const row of lessonProgressOf(
      student.id,
      all,
      gradedTopicIds,
      content,
      now,
      lessonIndex,
    )) {
      await writeProgress(fixture.schoolId, student.id, row);
      progressRows += 1;
      lessonIndex += 1;
    }

    masteryByStudent[student.id] = mine;
    weakestByStudent[student.id] = [...mine].sort(
      (left, right) =>
        left.accuracyPercent - right.accuracyPercent || left.topicKey.localeCompare(right.topicKey),
    );
  }

  const mastered = topicMastery.filter((row) => row.level === MasteryLevel.MASTERED).length;
  log(`${evaluations} topic evaluations across ${people.students.length} students`);
  log(`${topicMastery.length} topic mastery rows (${mastered} mastered, ${overrides} teacher-overridden)`);
  log(`${objectiveRows} objective mastery rows`);
  log(`${progressRows} progress records`);

  return {
    topicMastery,
    masteryByStudent,
    weakestByStudent,
    evaluations,
    objectiveMastery: objectiveRows,
    progressRecords: progressRows,
  };
}
