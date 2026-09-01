// ─────────────────────────────────────────────────────────────────────────────
// Learning paths and recommendations — the only file here that writes
// Blueprint 03 "Learning path — Modes" and blueprint 04 "The system proposes.
// The teacher decides."
//
// Locking is not re-implemented. `resolveUnlockable` from the learning module is
// called with the mastery rows the evaluation seed has just written, so a seeded
// step is locked by exactly the rule that locks a generated one, and a change to
// what counts as a hard prerequisite cannot leave the demo behind.
//
// Matching by position, never by upsert. `LearningPath`, `LearningPathItem` and
// `Recommendation` all have surrogate ids and no natural unique key — a path is
// identified by (student, subject, version), a step by its `sortOrder`, and a
// proposal by when it was raised. Each group is read back in that order and the
// planned rows are written over it one by one.
//
// Deliberately left alone: surplus rows are pruned only inside a group that the
// plan still populates. A teacher who added a step or raised a proposal through
// the API owns that row, and a seed run cannot tell it apart from its own
// leftovers, so it does not try.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { resolveUnlockable } from '../../src/modules/learning/learning.helpers';
import type { AssessmentFixture } from './assessment.seed';
import type { AttemptFixture, SeededAttempt } from './attempts.seed';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import type { EvaluationFixture } from './evaluation.seed';
import { log, step } from './helpers';
import { pathsFor } from './learning.plan';
import type { PathInput, PlannedPath, PlannedPathItem, PlannedRecommendation } from './learning.plan';
import { recommendationsFor } from './learning.recommend';
import type { PeopleFixture } from './people.seed';
import type { SchoolFixture } from './school.seed';

export interface LearningFixture {
  paths: number;
  pathItems: number;
  recommendations: number;
  /** Active path id per `${studentId}:${subjectId}`, for any later seed that needs it. */
  activePathIds: Record<string, string>;
}

/** One programme a grade is taught, with its topics in teaching order. */
interface GradeProgram {
  programKey: string;
  subjectKey: string;
  subjectId: string;
  topics: SeededTopic[];
}

/**
 * Programmes per grade key, in curriculum order. `curriculum.topics` is already
 * built programme → unit → topic, so insertion order is the teaching order.
 */
function programsByGrade(curriculum: CurriculumFixture): Record<string, GradeProgram[]> {
  const result: Record<string, GradeProgram[]> = {};
  for (const topic of curriculum.topics) {
    const programs = (result[topic.gradeKey] ??= []);
    let program = programs.find((entry) => entry.programKey === topic.programKey);
    if (!program) {
      program = {
        programKey: topic.programKey,
        subjectKey: topic.subjectKey,
        subjectId: topic.subjectId,
        topics: [],
      };
      programs.push(program);
    }
    program.topics.push(topic);
  }
  return result;
}

/** Writes one path's steps, matched to the planned list by `sortOrder`. */
async function writeItems(pathId: string, planned: PlannedPathItem[]): Promise<number> {
  const existing = await prisma.learningPathItem.findMany({
    where: { pathId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });

  const keep: string[] = [];
  for (const [index, item] of planned.entries()) {
    const current = existing[index];
    // The target is data here, not identity: the same slot may hold a topic in
    // one plan and a lesson in the next, so it is written on update as well.
    if (current) {
      await prisma.learningPathItem.update({ where: { id: current.id }, data: item });
      keep.push(current.id);
      continue;
    }
    const created = await prisma.learningPathItem.create({
      data: { ...item, pathId },
      select: { id: true },
    });
    keep.push(created.id);
  }

  // Only prunes inside a path the plan still owns; see the header.
  if (keep.length > 0) {
    await prisma.learningPathItem.deleteMany({ where: { pathId, id: { notIn: keep } } });
  }
  return planned.length;
}

/**
 * Writes every version of one learner's path for one subject, oldest first, and
 * returns the id of the active one so recommendations can point at it.
 */
async function writePaths(
  schoolId: string,
  studentId: string,
  subjectId: string,
  planned: PlannedPath[],
): Promise<{ activePathId: string | null; items: number }> {
  const existing = await prisma.learningPath.findMany({
    where: { studentId, subjectId },
    orderBy: [{ version: 'asc' }, { generatedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });

  const keep: string[] = [];
  let activePathId: string | null = null;
  let items = 0;

  for (const [index, plan] of planned.entries()) {
    // `subjectKey`/`programKey` are planning aids, not columns, so they are
    // dropped here rather than spread into `data`.
    const { items: steps, subjectKey: _subjectKey, programKey: _programKey, ...data } = plan;
    const current = existing[index];
    const id = current
      ? (
          await prisma.learningPath.update({
            where: { id: current.id },
            data,
            select: { id: true },
          })
        ).id
      : (
          await prisma.learningPath.create({
            data: { ...data, schoolId, studentId, subjectId },
            select: { id: true },
          })
        ).id;

    keep.push(id);
    items += await writeItems(id, steps);
    if (plan.isActive) activePathId = id;
  }

  if (keep.length > 0) {
    await prisma.learningPath.deleteMany({
      where: { studentId, subjectId, id: { notIn: keep } },
    });
  }
  return { activePathId, items };
}

/**
 * Writes one learner's proposals for one subject, matched by when they were
 * raised. `proposal` and `appliedChange` are plain objects; Prisma needs them
 * cast to `InputJsonValue` because `Json` columns accept anything serialisable.
 */
async function writeRecommendations(
  schoolId: string,
  studentId: string,
  subjectId: string,
  pathId: string | null,
  planned: PlannedRecommendation[],
): Promise<number> {
  const existing = await prisma.recommendation.findMany({
    where: { studentId, subjectId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });

  const ordered = [...planned].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  const keep: string[] = [];
  for (const [index, row] of ordered.entries()) {
    // `pathVersion` records which plan generation the row argued about; the
    // column does not exist, so it is dropped rather than written.
    const { pathVersion: _pathVersion, proposal, appliedChange, ...rest } = row;
    // `Json` columns take anything serialisable, which a typed interface is not
    // structurally assignable to; `appliedChange` is `Json?`, so "nothing was
    // applied" has to be `DbNull` (SQL NULL) rather than `JsonNull` (a JSON null).
    const data = {
      ...rest,
      pathId,
      proposal: proposal as unknown as Prisma.InputJsonValue,
      appliedChange:
        appliedChange === null
          ? Prisma.DbNull
          : (appliedChange as unknown as Prisma.InputJsonValue),
    };
    const current = existing[index];
    if (current) {
      await prisma.recommendation.update({ where: { id: current.id }, data });
      keep.push(current.id);
      continue;
    }
    const created = await prisma.recommendation.create({
      data: { ...data, schoolId, studentId, subjectId },
      select: { id: true },
    });
    keep.push(created.id);
  }

  if (keep.length > 0) {
    await prisma.recommendation.deleteMany({
      where: { studentId, subjectId, id: { notIn: keep } },
    });
  }
  return ordered.length;
}

/**
 * One active learning path per learner per subject, its steps, and the proposals
 * behind it. Depends on evaluation having run first: locking and step status are
 * read from the mastery rows it wrote, so running this against an empty mastery
 * table would produce a path where nothing is secure and everything is locked —
 * technically correct, and a useless demo.
 */
export async function seedLearning(
  fixture: SchoolFixture,
  people: PeopleFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  assessments: AssessmentFixture,
  attempts: AttemptFixture,
  evaluation: EvaluationFixture,
  now: Date,
): Promise<LearningFixture> {
  step('Learning paths and recommendations (blueprints 03 and 04)');

  const subjects = await prisma.subject.findMany({
    where: { schoolId: fixture.schoolId },
    select: { id: true, name: true },
  });
  const subjectNames = new Map(subjects.map((row) => [row.id, row.name]));
  const programs = programsByGrade(curriculum);

  const result: LearningFixture = {
    paths: 0,
    pathItems: 0,
    recommendations: 0,
    activePathIds: {},
  };
  let pairIndex = 0;
  let pending = 0;
  let skipped = 0;

  for (const student of people.students) {
    const mastery = evaluation.masteryByStudent[student.id] ?? [];
    const history = attempts.byStudent[student.id] ?? [];

    for (const program of programs[student.gradeKey] ?? []) {
      const topicIds = program.topics.map((topic) => topic.id);
      const { available, blockedBy } = await resolveUnlockable(student.id, topicIds);

      const input: PathInput = {
        student,
        subjectId: program.subjectId,
        subjectName: subjectNames.get(program.subjectId) ?? program.subjectKey,
        subjectKey: program.subjectKey,
        programKey: program.programKey,
        topics: program.topics,
        mastery: mastery.filter((row) => row.subjectId === program.subjectId),
        unlocked: available,
        blockedBy,
        attempts: history.filter((attempt: SeededAttempt) => attempt.programKey === program.programKey),
        content,
        reassessment: assessments.reassessmentByProgram[program.programKey],
        teacherIds: people.teacherIds,
        pairIndex,
        now,
      };

      const planned = pathsFor(input);
      const { activePathId, items } = await writePaths(
        fixture.schoolId,
        student.id,
        program.subjectId,
        planned,
      );
      result.paths += planned.length;
      result.pathItems += items;
      if (activePathId) result.activePathIds[`${student.id}:${program.subjectId}`] = activePathId;

      const active = planned.find((path) => path.isActive);
      if (active && active.approvedAt === null) pending += 1;
      skipped += planned.reduce(
        (count, path) => count + path.items.filter((item) => item.status === 'SKIPPED').length,
        0,
      );

      result.recommendations += await writeRecommendations(
        fixture.schoolId,
        student.id,
        program.subjectId,
        activePathId,
        recommendationsFor(input, active?.version ?? 1),
      );
      pairIndex += 1;
    }
  }

  log(`${result.paths} learning paths (${pending} awaiting teacher approval)`);
  log(`${result.pathItems} path steps (${skipped} skipped as already secure)`);
  log(`${result.recommendations} recommendations across every origin and decision state`);
  return result;
}



