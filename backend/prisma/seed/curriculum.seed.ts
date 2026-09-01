// ─────────────────────────────────────────────────────────────────────────────
// Seed — curriculum spine
// Blueprint 02 "Curriculum engine": writes the Program → Unit → Topic →
// Objective hierarchy from the plain data tables in prisma/seed/data, then
// derives the prerequisite chain from the order the topics are written in.
//
// Everything is published (`ContentStatus.PUBLISHED`) because a demo school
// should open with a working curriculum, not a review queue. The draft and
// in-review states are exercised by content.seed.ts instead.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentOwnership, ContentStatus, type DifficultyBand } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { CURRICULUM, type ProgramSpec } from './data/curriculum';
import { daysAgo, log, step } from './helpers';
import type { SchoolFixture } from './school.seed';

export interface SeededObjective {
  id: string;
  code: string;
  statement: string;
}

export interface SeededTopic {
  id: string;
  key: string;
  name: string;
  description: string;
  minutes: number;
  band: DifficultyBand;
  masteryThreshold: number;
  subjectKey: string;
  subjectId: string;
  gradeKey: string;
  gradeId: string | null;
  programKey: string;
  unitKey: string;
  unitId: string;
  /** Position within the program, from 0. Drives ordering and prerequisites. */
  order: number;
  objectives: SeededObjective[];
}

export interface CurriculumFixture {
  /** Program id by program key, e.g. `maths-y3`. */
  programIds: Record<string, string>;
  /** Unit id by `${programKey}:${unitKey}`. */
  unitIds: Record<string, string>;
  topics: SeededTopic[];
  /** Topic by `${programKey}:${topicKey}`. */
  topicByKey: Record<string, SeededTopic>;
  /** Topics in curriculum order, by `${subjectKey}:${gradeKey}`. */
  topicsBySubjectGrade: Record<string, SeededTopic[]>;
}

const MASTERY_THRESHOLD = 80;
/** Program row. `status` is PUBLISHED so the demo opens on a live curriculum. */
async function upsertProgram(
  spec: ProgramSpec,
  ids: { schoolId: string; subjectId: string; gradeId: string | null; authorId: string },
  publishedAt: Date,
): Promise<string> {
  const program = await prisma.curriculumProgram.upsert({
    where: {
      schoolId_subjectId_key: { schoolId: ids.schoolId, subjectId: ids.subjectId, key: spec.key },
    },
    update: {
      name: spec.name,
      description: spec.description,
      framework: spec.framework,
      gradeId: ids.gradeId,
      status: ContentStatus.PUBLISHED,
      publishedAt,
      archivedAt: null,
    },
    create: {
      schoolId: ids.schoolId,
      subjectId: ids.subjectId,
      gradeId: ids.gradeId,
      key: spec.key,
      name: spec.name,
      description: spec.description,
      framework: spec.framework,
      status: ContentStatus.PUBLISHED,
      ownership: ContentOwnership.MIDAS_ORIGINAL,
      publishedAt,
      createdById: ids.authorId,
    },
    select: { id: true },
  });
  return program.id;
}
/**
 * Prerequisites are not written by hand: a topic requires the one before it.
 * Inside a unit that is a hard prerequisite (the path engine blocks the item);
 * across a unit boundary it is soft (the teacher is warned, nothing is blocked).
 */
async function linkPrerequisites(topics: SeededTopic[]): Promise<number> {
  let written = 0;
  for (let index = 1; index < topics.length; index += 1) {
    const topic = topics[index] as SeededTopic;
    const previous = topics[index - 1] as SeededTopic;
    const isHard = topic.unitId === previous.unitId;

    await prisma.topicPrerequisite.upsert({
      where: { topicId_requiredTopicId: { topicId: topic.id, requiredTopicId: previous.id } },
      update: { isHard },
      create: { topicId: topic.id, requiredTopicId: previous.id, isHard },
    });
    written += 1;
  }
  return written;
}
/** Objectives for one topic. Blueprint 12: mastery attaches here, not to a topic. */
async function upsertObjectives(
  topicSpec: { objectives: readonly (readonly [string, string])[]; band: DifficultyBand },
  ids: { schoolId: string; topicId: string },
): Promise<SeededObjective[]> {
  const seeded: SeededObjective[] = [];

  for (const [index, [code, statement]] of topicSpec.objectives.entries()) {
    const objective = await prisma.learningObjective.upsert({
      where: { topicId_code: { topicId: ids.topicId, code } },
      update: { statement, difficultyBand: topicSpec.band, sortOrder: index },
      create: {
        schoolId: ids.schoolId,
        topicId: ids.topicId,
        code,
        statement,
        difficultyBand: topicSpec.band,
        sortOrder: index,
      },
      select: { id: true },
    });
    seeded.push({ id: objective.id, code, statement });
  }

  return seeded;
}

export async function seedCurriculum(
  fixture: SchoolFixture,
  authorId: string,
  now: Date,
): Promise<CurriculumFixture> {
  step('Curriculum (blueprint 02)');
  const publishedAt = daysAgo(60, now);

  const result: CurriculumFixture = {
    programIds: {},
    unitIds: {},
    topics: [],
    topicByKey: {},
    topicsBySubjectGrade: {},
  };
  let unitCount = 0;
  let objectiveCount = 0;
  let prerequisiteCount = 0;

  for (const [programIndex, spec] of CURRICULUM.entries()) {
    const subjectId = fixture.subjectIds[spec.subjectKey];
    const gradeId = fixture.gradeIds[spec.gradeKey] ?? null;
    if (!subjectId) continue;

    const programId = await upsertProgram(
      spec,
      { schoolId: fixture.schoolId, subjectId, gradeId, authorId },
      publishedAt,
    );
    await prisma.curriculumProgram.update({
      where: { id: programId },
      data: { sortOrder: programIndex },
    });
    result.programIds[spec.key] = programId;

    const programTopics: SeededTopic[] = [];
    let order = 0;

    for (const [unitIndex, unitSpec] of spec.units.entries()) {
      const unit = await prisma.unit.upsert({
        where: { programId_key: { programId, key: unitSpec.key } },
        update: {
          name: unitSpec.name,
          description: unitSpec.description,
          sortOrder: unitIndex,
          status: ContentStatus.PUBLISHED,
          archivedAt: null,
        },
        create: {
          schoolId: fixture.schoolId,
          programId,
          subjectId,
          key: unitSpec.key,
          name: unitSpec.name,
          description: unitSpec.description,
          sortOrder: unitIndex,
          status: ContentStatus.PUBLISHED,
          createdById: authorId,
        },
        select: { id: true },
      });
      result.unitIds[`${spec.key}:${unitSpec.key}`] = unit.id;
      unitCount += 1;
      for (const topicSpec of unitSpec.topics) {
        const topic = await prisma.topic.upsert({
          where: { unitId_key: { unitId: unit.id, key: topicSpec.key } },
          update: {
            name: topicSpec.name,
            description: topicSpec.description,
            difficultyBand: topicSpec.band,
            estimatedMinutes: topicSpec.minutes,
            sortOrder: order,
            status: ContentStatus.PUBLISHED,
            publishedAt,
            archivedAt: null,
          },
          create: {
            schoolId: fixture.schoolId,
            unitId: unit.id,
            subjectId,
            gradeId,
            key: topicSpec.key,
            name: topicSpec.name,
            description: topicSpec.description,
            difficultyBand: topicSpec.band,
            estimatedMinutes: topicSpec.minutes,
            masteryThreshold: MASTERY_THRESHOLD,
            sortOrder: order,
            status: ContentStatus.PUBLISHED,
            publishedAt,
            createdById: authorId,
          },
          select: { id: true },
        });

        const objectives = await upsertObjectives(topicSpec, {
          schoolId: fixture.schoolId,
          topicId: topic.id,
        });
        objectiveCount += objectives.length;

        const seeded: SeededTopic = {
          id: topic.id,
          key: topicSpec.key,
          name: topicSpec.name,
          description: topicSpec.description,
          minutes: topicSpec.minutes,
          band: topicSpec.band,
          masteryThreshold: MASTERY_THRESHOLD,
          subjectKey: spec.subjectKey,
          subjectId,
          gradeKey: spec.gradeKey,
          gradeId,
          programKey: spec.key,
          unitKey: unitSpec.key,
          unitId: unit.id,
          order,
          objectives,
        };
        result.topics.push(seeded);
        result.topicByKey[`${spec.key}:${topicSpec.key}`] = seeded;
        programTopics.push(seeded);
        order += 1;
      }
    }

    result.topicsBySubjectGrade[`${spec.subjectKey}:${spec.gradeKey}`] = programTopics;
    prerequisiteCount += await linkPrerequisites(programTopics);
  }

  log(
    `${Object.keys(result.programIds).length} programs, ${unitCount} units, ` +
      `${result.topics.length} topics, ${objectiveCount} objectives, ` +
      `${prerequisiteCount} prerequisite links`,
  );
  return result;
}
