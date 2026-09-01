// ─────────────────────────────────────────────────────────────────────────────
// Seed — assessment definitions
// Blueprint 03: screening assesses "across controlled difficulty bands" and ends
// in a placement, not a grade. Blueprint 12: an attempt must be able to say which
// definition produced it, so every attempt later in the seed points at a row
// written here.
//
// Five kinds, one purpose each, so the demo exercises the whole enum:
//
//   SCREENING        one per program, adaptive, drives placement
//   ONGOING_CHECK    one per unit, the low-stakes progress check
//   TOPIC_CHECK      one per topic, gates mastery at the topic threshold
//   REASSESSMENT     one per program, re-tests after intervention, no cap
//   TEACHER_ASSIGNED one per program, the end-of-unit test a teacher hands out
//
// Items are the topic's published quiz activity. Activities are shared between
// definitions on purpose: `AssessmentItem` is a join table, and re-using one
// quiz in both a topic check and a screening is how a real bank behaves.
// ─────────────────────────────────────────────────────────────────────────────

import { AssessmentKind, ContentStatus, DifficultyBand } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import type { ContentFixture, SeededActivity } from './content.seed';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import { daysAgo, log, step } from './helpers';
import type { SchoolFixture } from './school.seed';

export interface SeededAssessment {
  id: string;
  key: string;
  kind: AssessmentKind;
  title: string;
  subjectKey: string;
  subjectId: string;
  gradeKey: string;
  programKey: string;
  /** Null for the cross-topic kinds (screening, unit check, teacher test). */
  topicId: string | null;
  passThreshold: number;
  adaptiveEnabled: boolean;
  /** Activities presented, in item order. */
  activityIds: string[];
}

export interface AssessmentFixture {
  assessments: SeededAssessment[];
  byKey: Record<string, SeededAssessment>;
  screeningByProgram: Record<string, SeededAssessment>;
  unitCheckByUnitKey: Record<string, SeededAssessment>;
  topicCheckByTopicId: Record<string, SeededAssessment>;
  reassessmentByProgram: Record<string, SeededAssessment>;
  teacherTestByProgram: Record<string, SeededAssessment>;
}

/** The columns that differ between kinds, kept in one table so they are easy to compare. */
interface KindShape {
  adaptiveEnabled: boolean;
  startingBand: DifficultyBand;
  itemTarget: number | null;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  cooldownDays: number | null;
  driveRecommendations: boolean;
  shuffleItems: boolean;
  showFeedbackImmediately: boolean;
}

const SHAPES: Record<AssessmentKind, KindShape> = {
  // Steps up and down through the bands, so it starts in the middle one.
  [AssessmentKind.SCREENING]: {
    adaptiveEnabled: true,
    startingBand: DifficultyBand.DEVELOPING,
    itemTarget: 8,
    timeLimitMinutes: 25,
    maxAttempts: 2,
    cooldownDays: 30,
    driveRecommendations: true,
    shuffleItems: true,
    showFeedbackImmediately: false,
  },
  // Low stakes: unlimited tries, feedback straight away, no placement effect.
  [AssessmentKind.ONGOING_CHECK]: {
    adaptiveEnabled: false,
    startingBand: DifficultyBand.DEVELOPING,
    itemTarget: null,
    timeLimitMinutes: null,
    maxAttempts: null,
    cooldownDays: null,
    driveRecommendations: false,
    shuffleItems: true,
    showFeedbackImmediately: true,
  },
  [AssessmentKind.TOPIC_CHECK]: {
    adaptiveEnabled: false,
    startingBand: DifficultyBand.DEVELOPING,
    itemTarget: null,
    timeLimitMinutes: 15,
    maxAttempts: 3,
    cooldownDays: 1,
    driveRecommendations: true,
    shuffleItems: true,
    showFeedbackImmediately: true,
  },
  // After intervention. Never capped: the point is to let the student show growth.
  [AssessmentKind.REASSESSMENT]: {
    adaptiveEnabled: true,
    startingBand: DifficultyBand.FOUNDATION,
    itemTarget: 6,
    timeLimitMinutes: 20,
    maxAttempts: null,
    cooldownDays: 7,
    driveRecommendations: true,
    shuffleItems: true,
    showFeedbackImmediately: false,
  },
  // A teacher hands this out and reads the results, so order is fixed.
  [AssessmentKind.TEACHER_ASSIGNED]: {
    adaptiveEnabled: false,
    startingBand: DifficultyBand.DEVELOPING,
    itemTarget: null,
    timeLimitMinutes: 30,
    maxAttempts: 1,
    cooldownDays: null,
    driveRecommendations: false,
    shuffleItems: false,
    showFeedbackImmediately: false,
  },
};

/** One definition plus its items. `key` is unique per school, so upsert is safe. */
interface DefinitionSpec {
  key: string;
  kind: AssessmentKind;
  title: string;
  description: string;
  passThreshold: number;
  topic: SeededTopic;
  /** Null for cross-topic kinds. */
  topicId: string | null;
  items: { activity: SeededActivity; band: DifficultyBand }[];
}

async function upsertDefinition(
  spec: DefinitionSpec,
  context: { schoolId: string; createdById: string; publishedAt: Date },
): Promise<SeededAssessment> {
  const shape = SHAPES[spec.kind];
  const columns = {
    subjectId: spec.topic.subjectId,
    topicId: spec.topicId,
    kind: spec.kind,
    title: spec.title,
    description: spec.description,
    status: ContentStatus.PUBLISHED,
    passThreshold: spec.passThreshold,
    publishedAt: context.publishedAt,
    archivedAt: null,
    ...shape,
  };

  const assessment = await prisma.assessment.upsert({
    where: { schoolId_key: { schoolId: context.schoolId, key: spec.key } },
    update: columns,
    create: { ...columns, schoolId: context.schoolId, key: spec.key, createdById: context.createdById },
    select: { id: true },
  });

  await upsertItems(assessment.id, spec);

  return {
    id: assessment.id,
    key: spec.key,
    kind: spec.kind,
    title: spec.title,
    subjectKey: spec.topic.subjectKey,
    subjectId: spec.topic.subjectId,
    gradeKey: spec.topic.gradeKey,
    programKey: spec.topic.programKey,
    topicId: spec.topicId,
    passThreshold: spec.passThreshold,
    adaptiveEnabled: shape.adaptiveEnabled,
    activityIds: spec.items.map(({ activity }) => activity.id),
  };
}

/**
 * Items have a real unique key, so they upsert. Activities dropped from the spec
 * are removed: a definition that still presented a retired activity would score
 * students against content the curriculum no longer contains.
 */
async function upsertItems(assessmentId: string, spec: DefinitionSpec): Promise<void> {
  const keep: string[] = [];

  for (const [sortOrder, { activity, band }] of spec.items.entries()) {
    // The first item in the list opens the adaptive walk through the bands.
    const isAdaptiveEntry = SHAPES[spec.kind].adaptiveEnabled && sortOrder === 0;
    const columns = { sortOrder, difficultyBand: band, weight: 100, isAdaptiveEntry };

    await prisma.assessmentItem.upsert({
      where: { assessmentId_activityId: { assessmentId, activityId: activity.id } },
      update: columns,
      create: { ...columns, assessmentId, activityId: activity.id },
      select: { id: true },
    });
    keep.push(activity.id);
  }

  await prisma.assessmentItem.deleteMany({
    where: keep.length > 0 ? { assessmentId, activityId: { notIn: keep } } : { assessmentId },
  });
}

/** Display names for assessment titles. Keys match the subject keys in school.seed.ts. */
const SUBJECT_LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  english: 'English',
  science: 'Science',
};

/** Published quiz for a topic, or null while the topic has no published quiz. */
function quizFor(content: ContentFixture, topic: SeededTopic): SeededActivity | null {
  return content.activitiesByTopic[topic.id]?.find((activity) => activity.key === 'quiz') ?? null;
}

function itemsFor(content: ContentFixture, topics: readonly SeededTopic[]): DefinitionSpec['items'] {
  return topics.flatMap((topic) => {
    const activity = quizFor(content, topic);
    return activity ? [{ activity, band: topic.band }] : [];
  });
}

/**
 * Every published activity in the unit, not just the quiz. A unit check is the
 * low-stakes progress check, so it draws on practice and extension work too —
 * which is also what puts matching and sorting responses into the demo data.
 */
function allItemsFor(content: ContentFixture, topics: readonly SeededTopic[]): DefinitionSpec['items'] {
  return topics.flatMap((topic) =>
    (content.activitiesByTopic[topic.id] ?? []).map((activity) => ({ activity, band: topic.band })),
  );
}

/** Every definition for one program, in the order they appear to a teacher. */
function definitionsForProgram(
  programKey: string,
  topics: readonly SeededTopic[],
  content: ContentFixture,
): DefinitionSpec[] {
  const first = topics[0];
  if (!first) return [];

  const subject = SUBJECT_LABELS[first.subjectKey] ?? first.subjectKey;
  const label = `${subject} ${first.gradeKey.replace('year-', 'Year ')}`;
  const hardest = topics[topics.length - 1] ?? first;
  const specs: DefinitionSpec[] = [];

  specs.push({
    key: `screening:${programKey}`,
    kind: AssessmentKind.SCREENING,
    title: `${label} — placement screening`,
    description:
      'Adaptive start-of-year screening. Produces a placement and a suggested starting topic, never a grade.',
    passThreshold: 60,
    topic: first,
    topicId: null,
    items: itemsFor(content, topics),
  });

  // One low-stakes check per unit.
  for (const unitKey of [...new Set(topics.map((topic) => topic.unitKey))]) {
    const unitTopics = topics.filter((topic) => topic.unitKey === unitKey);
    const unitFirst = unitTopics[0];
    if (!unitFirst) continue;

    specs.push({
      key: `unit-check:${programKey}:${unitKey}`,
      kind: AssessmentKind.ONGOING_CHECK,
      title: `${label} — ${unitKey.replace(/-/g, ' ')} check`,
      description: 'Short progress check taken part-way through the unit. Results guide teaching, not reporting.',
      passThreshold: 70,
      topic: unitFirst,
      topicId: null,
      items: allItemsFor(content, unitTopics),
    });
  }

  for (const topic of topics) {
    specs.push({
      key: `topic-check:${programKey}:${topic.key}`,
      kind: AssessmentKind.TOPIC_CHECK,
      title: `${topic.name} — check`,
      description: `Confirms whether ${topic.name.toLowerCase()} is secure before the next topic unlocks.`,
      passThreshold: topic.masteryThreshold,
      topic,
      topicId: topic.id,
      items: itemsFor(content, [topic]),
    });
  }

  specs.push({
    key: `reassess:${programKey}`,
    kind: AssessmentKind.REASSESSMENT,
    title: `${label} — reassessment`,
    description: 'Taken after intervention. Starts at the foundation band so progress is visible from the first item.',
    passThreshold: 60,
    topic: hardest,
    topicId: null,
    items: itemsFor(content, topics),
  });

  specs.push({
    key: `teacher-test:${programKey}`,
    kind: AssessmentKind.TEACHER_ASSIGNED,
    title: `${label} — end of unit test`,
    description: 'Fixed order, one attempt, marked before the class sees any feedback.',
    passThreshold: 70,
    topic: first,
    topicId: null,
    items: itemsFor(content, topics),
  });

  return specs.filter((spec) => spec.items.length > 0);
}

export async function seedAssessments(
  fixture: SchoolFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  createdById: string,
  now: Date,
): Promise<AssessmentFixture> {
  step('Assessment definitions (blueprint 03, 12)');

  const result: AssessmentFixture = {
    assessments: [],
    byKey: {},
    screeningByProgram: {},
    unitCheckByUnitKey: {},
    topicCheckByTopicId: {},
    reassessmentByProgram: {},
    teacherTestByProgram: {},
  };

  const publishedAt = daysAgo(45, now);
  const programKeys = [...new Set(curriculum.topics.map((topic) => topic.programKey))];

  for (const programKey of programKeys) {
    const topics = curriculum.topics.filter((topic) => topic.programKey === programKey);

    for (const spec of definitionsForProgram(programKey, topics, content)) {
      const seeded = await upsertDefinition(spec, { schoolId: fixture.schoolId, createdById, publishedAt });
      result.assessments.push(seeded);
      result.byKey[seeded.key] = seeded;

      switch (seeded.kind) {
        case AssessmentKind.SCREENING:
          result.screeningByProgram[programKey] = seeded;
          break;
        case AssessmentKind.ONGOING_CHECK:
          result.unitCheckByUnitKey[seeded.key.replace('unit-check:', '')] = seeded;
          break;
        case AssessmentKind.TOPIC_CHECK:
          if (seeded.topicId) result.topicCheckByTopicId[seeded.topicId] = seeded;
          break;
        case AssessmentKind.REASSESSMENT:
          result.reassessmentByProgram[programKey] = seeded;
          break;
        default:
          result.teacherTestByProgram[programKey] = seeded;
      }
    }
  }

  const items = result.assessments.reduce((total, entry) => total + entry.activityIds.length, 0);
  const kinds = Object.values(AssessmentKind)
    .map((kind) => `${kind} ${result.assessments.filter((entry) => entry.kind === kind).length}`)
    .join(', ');
  log(`${result.assessments.length} assessments with ${items} items`);
  log(`by kind: ${kinds}`);

  return result;
}
