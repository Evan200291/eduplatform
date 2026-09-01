// ─────────────────────────────────────────────────────────────────────────────
// Seed — assessment attempts and student responses
// Blueprint 03 (screening and checks) and blueprint 12 (evidence, version pinning).
//
// The rule this module follows. Every demo answer is built and then marked by
// `attempts.marking.ts`, which mirrors `src/modules/assessment/assessment.marking.ts`
// branch for branch. Nothing here asserts a score: `isCorrect`, `pointsAwarded`
// and the attempt totals are all derived from the answer that was actually
// written. Without that a demo dashboard would show figures the API cannot
// reproduce the moment a teacher reopens the attempt.
//
// Deliberately left alone:
//   • `teacherOverridden` stays false. An override disagrees with the marker by
//     definition, so it belongs with the seed that also writes its audit trail.
//   • Hints are recorded as used but cost nothing, because every hint in the bank
//     is written with `pointsCost: 0` (`question.seed.ts`). The marker therefore
//     subtracts nothing, and the stored points stay reproducible.
//
// Matching by position. `StudentResponse` has no natural unique key — a student
// may answer the same question in two attempts — so rows are located by
// `(attemptId, questionId)`: everything already stored for the attempt is read
// once, matched in memory, then updated in place. Surplus rows are deleted so
// lowering the item cap cannot leave orphans. `AssessmentAttempt` does have a
// unique key (`assessment_attempt_number_unique`) and is a plain upsert.
// ─────────────────────────────────────────────────────────────────────────────

import type { DifficultyBand} from '@prisma/client';
import { AttemptStatus, Prisma } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import {
  ITEM_CAP,
  activityResultsOf,
  buildResponses,
  itemsFor,
  objectiveResultsOf,
  tallyOf,
  topicResultsOf,
} from './attempts.build';
import type {
  PlannedResponse,
  SeededActivityResult,
  SeededObjectiveResult,
  SeededTopicResult,
} from './attempts.build';
import { attemptSummary, isScored, planAttempts, scorePercent } from './attempts.plan';
import type { AttemptSlot, StudentProgram } from './attempts.plan';
import type { AssessmentFixture, SeededAssessment } from './assessment.seed';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture } from './curriculum.seed';
import { atHour, daysAgo, daysAhead, hashInt, hoursAgo, log, pick, step } from './helpers';
import type { DemoStudent, PeopleFixture } from './people.seed';
import type { QuestionFixture } from './question.seed';
import type { SchoolFixture } from './school.seed';

export type { SeededActivityResult, SeededObjectiveResult, SeededTopicResult };

/** Everything a later module needs without re-reading the attempt rows. */
export interface SeededAttempt {
  id: string;
  assessmentId: string;
  assessmentKey: string;
  studentId: string;
  programKey: string;
  subjectKey: string;
  /** Null for the cross-topic kinds; see `SeededAssessment.topicId`. */
  topicId: string | null;
  attemptNumber: number;
  status: AttemptStatus;
  isPractice: boolean;
  startedAt: Date;
  completedAt: Date | null;
  /** Null unless the attempt reached a scored state. */
  scorePercent: number | null;
  itemsPresented: number;
  itemsCorrect: number;
  highestBandPassed: DifficultyBand | null;
  timeSpentSeconds: number;
  topicResults: SeededTopicResult[];
  activityResults: SeededActivityResult[];
  objectiveResults: SeededObjectiveResult[];
}

export interface AttemptFixture {
  attempts: SeededAttempt[];
  /** Attempts per student id, in the order they were planned. */
  byStudent: Record<string, SeededAttempt[]>;
  /** Scored, non-practice attempts only — what mastery should be built from. */
  gradedByStudent: Record<string, SeededAttempt[]>;
  responses: number;
}

/**
 * Denormalized `studentId`/`schoolId` on `StudentResponse` are `VarChar(32)`, and
 * the API truncates the same way (`assessment.helpers.ts`). A cuid is 25
 * characters so this is a no-op today, but it has to match to keep seeded rows
 * indistinguishable from API-written ones.
 */
const shortId = (value: string): string => value.slice(0, 32);

/** `Decimal(10,2)` columns: keep the seed and the API rounding identical. */
const decimal2 = (value: number): Prisma.Decimal => new Prisma.Decimal(value.toFixed(2));

/** Denormalized columns plus the version pin, constant for one seed run. */
interface WriteContext {
  schoolId: string;
  versionByActivity: Record<string, string>;
}

/**
 * Rewrites one attempt's responses in place, matched on `(attemptId, questionId)`.
 * Returns the number of rows written.
 */
async function writeResponses(
  attemptId: string,
  planned: PlannedResponse[],
  student: DemoStudent,
  context: WriteContext,
): Promise<number> {
  const existing = await prisma.studentResponse.findMany({
    where: { attemptId },
    select: { id: true, questionId: true },
  });
  const byQuestion = new Map(existing.map((row) => [row.questionId, row.id]));
  const keep: string[] = [];

  for (const entry of planned) {
    const data = {
      activityId: entry.question.activityId,
      activityVersionId: context.versionByActivity[entry.question.activityId] ?? null,
      studentId: shortId(student.id),
      schoolId: shortId(context.schoolId),
      response: entry.marked.payload as unknown as Prisma.InputJsonObject,
      isCorrect: entry.marked.mark.isCorrect,
      pointsAwarded: decimal2(entry.marked.mark.pointsAwarded),
      pointsPossible: decimal2(entry.marked.mark.pointsPossible),
      hintsUsed: entry.hintsUsed,
      attemptsUsed: entry.attemptsUsed,
      timeSpentSeconds: entry.timeSpentSeconds,
      difficultyBand: entry.question.difficultyBand,
      answeredAt: entry.answeredAt,
    };

    const found = byQuestion.get(entry.question.id);
    if (found) {
      await prisma.studentResponse.update({ where: { id: found }, data });
      keep.push(found);
      continue;
    }
    const created = await prisma.studentResponse.create({
      data: { ...data, attemptId, questionId: entry.question.id },
      select: { id: true },
    });
    keep.push(created.id);
  }

  // An empty `notIn` matches every row, so the branch is not optional.
  if (keep.length > 0) {
    await prisma.studentResponse.deleteMany({ where: { attemptId, id: { notIn: keep } } });
  } else {
    await prisma.studentResponse.deleteMany({ where: { attemptId } });
  }
  return keep.length;
}

/** Where each state leaves the clock. `expiresAt` only matters while a window is open. */
function timestampsFor(
  status: AttemptStatus,
  startedAt: Date,
  planned: PlannedResponse[],
  now: Date,
): { submittedAt: Date | null; completedAt: Date | null; expiresAt: Date | null } {
  const last = planned.length > 0 ? (planned[planned.length - 1]).answeredAt : startedAt;
  switch (status) {
    case AttemptStatus.COMPLETED:
      return { submittedAt: last, completedAt: new Date(last.getTime() + 60_000), expiresAt: null };
    case AttemptStatus.SUBMITTED:
      // Handed in, not yet released — the teacher review queue reads this state.
      return { submittedAt: last, completedAt: null, expiresAt: null };
    case AttemptStatus.IN_PROGRESS:
      return { submittedAt: null, completedAt: null, expiresAt: daysAhead(2, now) };
    default:
      // Abandoned and expired both ran out of window, a day after they started.
      return { submittedAt: null, completedAt: null, expiresAt: new Date(startedAt.getTime() + 86_400_000) };
  }
}

const DEVICES = [
  'Chromebook · Chrome 128',
  'iPad · Safari 17',
  'Windows laptop · Edge 127',
  'Android tablet · Chrome 128',
];

/** Upserts one attempt and its answers. Every figure comes from `tallyOf`. */
async function writeAttempt(args: {
  slot: AttemptSlot;
  assessment: SeededAssessment;
  student: DemoStudent;
  planned: PlannedResponse[];
  startedAt: Date;
  context: WriteContext;
  now: Date;
}): Promise<{ attempt: SeededAttempt; responses: number }> {
  const { slot, assessment, student, planned, startedAt, context, now } = args;
  const tally = tallyOf(planned);
  const scored = isScored(slot.status);
  const times = timestampsFor(slot.status, startedAt, planned, now);
  const percent = scored ? scorePercent(tally) : null;
  const firstActivityId = planned.length > 0 ? (planned[0]).question.activityId : '';

  const shape = {
    schoolId: context.schoolId,
    // Blueprint 12: evidence is pinned to the version the student actually saw.
    activityVersionId: context.versionByActivity[firstActivityId] ?? null,
    status: slot.status,
    startedAt,
    submittedAt: times.submittedAt,
    completedAt: times.completedAt,
    expiresAt: times.expiresAt,
    scoreRaw: scored ? decimal2(tally.pointsAwarded) : null,
    scoreMax: scored ? decimal2(tally.pointsPossible) : null,
    scorePercent: percent,
    itemsPresented: tally.presented,
    itemsCorrect: tally.correct,
    timeSpentSeconds: tally.timeSpentSeconds,
    highestBandPassed: scored ? tally.bandPassed : null,
    outcomeSummary: attemptSummary(assessment.title, slot.status, tally),
    isPractice: slot.isPractice,
    deviceInfo: pick(DEVICES, `device:${student.id}`),
  };

  const row = await prisma.assessmentAttempt.upsert({
    where: {
      assessmentId_studentId_attemptNumber: {
        assessmentId: assessment.id,
        studentId: student.id,
        attemptNumber: slot.attemptNumber,
      },
    },
    update: shape,
    create: { ...shape, assessmentId: assessment.id, studentId: student.id, attemptNumber: slot.attemptNumber },
    select: { id: true },
  });

  const responses = await writeResponses(row.id, planned, student, context);
  return {
    responses,
    attempt: {
      id: row.id,
      assessmentId: assessment.id,
      assessmentKey: assessment.key,
      studentId: student.id,
      programKey: assessment.programKey,
      subjectKey: assessment.subjectKey,
      topicId: assessment.topicId,
      attemptNumber: slot.attemptNumber,
      status: slot.status,
      isPractice: slot.isPractice,
      startedAt,
      completedAt: times.completedAt,
      scorePercent: percent,
      itemsPresented: tally.presented,
      itemsCorrect: tally.correct,
      highestBandPassed: scored ? tally.bandPassed : null,
      timeSpentSeconds: tally.timeSpentSeconds,
      topicResults: topicResultsOf(planned),
      activityResults: activityResultsOf(planned),
      objectiveResults: objectiveResultsOf(planned),
    },
  };
}

/** Resolves a planned slot to the assessment it refers to, or null if unseeded. */
function assessmentFor(slot: AttemptSlot, assessments: AssessmentFixture): SeededAssessment | null {
  const target = slot.target;
  switch (target.kind) {
    case 'screening':
      return assessments.screeningByProgram[target.programKey] ?? null;
    case 'topic-check':
      return assessments.topicCheckByTopicId[target.topicId] ?? null;
    case 'unit-check':
      return assessments.unitCheckByUnitKey[target.unitKey] ?? null;
    case 'reassessment':
      return assessments.reassessmentByProgram[target.programKey] ?? null;
    default:
      return assessments.teacherTestByProgram[target.programKey] ?? null;
  }
}

/**
 * The programmes a grade is taught, in curriculum order, each carrying its topic
 * ids in teaching order and the key of its first unit. `curriculum.topics` is
 * already built in programme → unit → topic order, so insertion order is the
 * teaching order.
 */
function programsByGrade(curriculum: CurriculumFixture): Record<string, StudentProgram[]> {
  const result: Record<string, StudentProgram[]> = {};
  for (const topic of curriculum.topics) {
    const programs = (result[topic.gradeKey] ??= []);
    let program = programs.find((entry) => entry.programKey === topic.programKey);
    if (!program) {
      program = {
        programKey: topic.programKey,
        topicIds: [],
        unitKey: `${topic.programKey}:${topic.unitKey}`,
      };
      programs.push(program);
    }
    program.topicIds.push(topic.id);
  }
  return result;
}

/** Mid-morning to early afternoon, so demo timelines read like a school day. */
function startOf(slot: AttemptSlot, student: DemoStudent, assessmentKey: string, now: Date): Date {
  if (slot.daysBack <= 0) return hoursAgo(3, now);
  return atHour(daysAgo(slot.daysBack, now), hashInt(`hour:${student.id}:${assessmentKey}`, 9, 14));
}

/**
 * Writes the demo assessment history. Depends on questions and assessments having
 * been seeded first; a slot whose assessment or item set is missing is counted and
 * skipped rather than guessed at, so a thin question bank degrades quietly.
 */
export async function seedAttempts(
  fixture: SchoolFixture,
  people: PeopleFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  questions: QuestionFixture,
  assessments: AssessmentFixture,
  now: Date,
): Promise<AttemptFixture> {
  step('Assessment attempts and student responses (blueprint 03, 12)');

  const context: WriteContext = {
    schoolId: fixture.schoolId,
    versionByActivity: Object.fromEntries(
      content.activities.map((activity) => [activity.id, activity.versionId]),
    ),
  };
  const programs = programsByGrade(curriculum);
  const result: AttemptFixture = { attempts: [], byStudent: {}, gradedByStudent: {}, responses: 0 };
  let skipped = 0;

  for (const [cohortIndex, student] of people.students.entries()) {
    for (const slot of planAttempts(student, programs[student.gradeKey] ?? [], cohortIndex)) {
      const assessment = assessmentFor(slot, assessments);
      const items = assessment ? itemsFor(assessment, questions) : [];
      if (!assessment || items.length === 0) {
        skipped += 1;
        continue;
      }

      const startedAt = startOf(slot, student, assessment.key, now);
      const planned = buildResponses(slot, items, student, startedAt);
      const written = await writeAttempt({ slot, assessment, student, planned, startedAt, context, now });

      result.attempts.push(written.attempt);
      (result.byStudent[student.id] ??= []).push(written.attempt);
      if (isScored(slot.status) && !slot.isPractice) {
        (result.gradedByStudent[student.id] ??= []).push(written.attempt);
      }
      result.responses += written.responses;
    }
  }

  const byStatus = Object.values(AttemptStatus)
    .map((status) => `${status} ${result.attempts.filter((entry) => entry.status === status).length}`)
    .join(', ');
  const scored = result.attempts.filter((entry) => entry.scorePercent !== null);

  log(`${result.attempts.length} attempts across ${people.students.length} students`);
  log(`${result.responses} marked responses, ${ITEM_CAP} items per sitting at most`);
  log(`by status: ${byStatus}`);
  if (scored.length > 0) {
    const mean = Math.round(
      scored.reduce((total, entry) => total + (entry.scorePercent ?? 0), 0) / scored.length,
    );
    log(`mean ${mean}% over ${scored.length} scored attempts`);
  }
  if (skipped > 0) log(`${skipped} planned attempts had no assessment or no items — skipped`);

  return result;
}
