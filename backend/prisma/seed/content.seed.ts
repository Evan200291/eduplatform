// ─────────────────────────────────────────────────────────────────────────────
// Seed — lessons and activities
// Blueprint 03 "Lessons and activities": every topic opens with a lesson made of
// ordered sections, then offers practice, a quiz and one further activity form.
// Cycling that third activity through the remaining `ActivityType` values means
// the demo exercises every form the blueprint lists, not only multiple choice.
//
// Blueprint 12: a student response must reference the exact content version that
// was presented, so each activity is published with an `ActivityVersion` snapshot
// and later modules attach their responses to that version id.
// ─────────────────────────────────────────────────────────────────────────────

import { ActivityType, ContentOwnership, ContentStatus, Prisma } from '@prisma/client';

import { buildActivitySnapshot } from '../../src/modules/content/content.helpers';
import { prisma } from '../../src/core/prisma';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import { hashInt, log, step } from './helpers';
import type { MediaFixture } from './media.seed';
import type { SchoolFixture } from './school.seed';

export interface SeededActivity {
  id: string;
  key: string;
  title: string;
  type: ActivityType;
  status: ContentStatus;
  topicId: string;
  subjectId: string;
  /** Published snapshot the demo responses point at. */
  versionId: string;
  version: number;
  pointsValue: number;
  estimatedMinutes: number;
  passThreshold: number;
  screeningEligible: boolean;
  objectiveIds: string[];
  /** Null while the activity is still a draft or in review. */
  publishedAt: Date | null;
}

export interface SeededLesson {
  id: string;
  topicId: string;
  title: string;
  estimatedMinutes: number;
  publishedAt: Date;
}

export interface ContentFixture {
  lessons: SeededLesson[];
  /** Lesson by topic id. Every topic has exactly one. */
  lessonByTopic: Record<string, SeededLesson>;
  activities: SeededActivity[];
  /** Published activities by topic id, in presentation order. */
  activitiesByTopic: Record<string, SeededActivity[]>;
}

/** The third activity of each topic rotates through these forms. */
const VARIED_TYPES: readonly ActivityType[] = [
  ActivityType.MULTIPLE_CHOICE,
  ActivityType.NUMERIC_RESPONSE,
  ActivityType.TRUE_FALSE,
  ActivityType.MATCHING,
  ActivityType.SORTING,
  ActivityType.MINI_GAME,
  ActivityType.TEACHER_TASK,
  ActivityType.EXPLANATION,
  ActivityType.WORKED_EXAMPLE,
];
/** Type-specific settings. The player reads these; the seed keeps them minimal. */
function configFor(type: ActivityType, topic: SeededTopic): Prisma.InputJsonValue {
  switch (type) {
    case ActivityType.PRACTICE_SEQUENCE:
      return { itemCount: 8, shuffle: true, allowHints: true, stopAfterConsecutiveWrong: 3 };
    case ActivityType.QUIZ:
      return { itemCount: 6, shuffle: true, allowHints: false, showFeedback: 'after-submit' };
    case ActivityType.MATCHING:
      return {
        pairs: [
          { left: topic.name, right: topic.objectives[0]?.code ?? 'objective' },
          { left: 'Worked example', right: 'Method' },
          { left: 'Practice', right: 'Fluency' },
        ],
      };
    case ActivityType.SORTING:
      return { buckets: ['Always true', 'Sometimes true', 'Never true'], itemCount: 6 };
    case ActivityType.MINI_GAME:
      return { game: 'number-race', rounds: 5, secondsPerRound: 20, livesAllowed: 3 };
    case ActivityType.TEACHER_TASK:
      return { submission: 'teacher-observed', evidence: 'photo-or-note', groupWork: true };
    case ActivityType.NUMERIC_RESPONSE:
      return { tolerance: 0, units: null, itemCount: 5 };
    case ActivityType.TRUE_FALSE:
      return { itemCount: 6, statementsPerScreen: 2 };
    case ActivityType.MULTIPLE_CHOICE:
      return { itemCount: 5, optionsPerItem: 4, shuffleOptions: true };
    case ActivityType.EXPLANATION:
    case ActivityType.WORKED_EXAMPLE:
      return { pages: 3, allowSkip: false };
    default:
      return {};
  }
}

/** Markdown lesson body. Built from the topic so the demo reads like real content. */
function lessonBody(topic: SeededTopic): string {
  const objectives = topic.objectives.map((o) => `- **${o.code}** ${o.statement}`).join('\n');
  return [
    `## What we are learning`,
    '',
    topic.description,
    '',
    '### Objectives',
    '',
    objectives,
    '',
    '### How this lesson runs',
    '',
    `Work through the sections in order. Expect about ${topic.minutes} minutes, then try the`,
    'practice activity. The quiz is there when you feel ready.',
    '',
  ].join('\n');
}
interface SectionSpec {
  heading: string;
  body: string;
  kind: ActivityType;
}

/** Three sections per lesson: teach, model, then check understanding. */
function sectionsFor(topic: SeededTopic): SectionSpec[] {
  const first = topic.objectives[0];
  const second = topic.objectives[1] ?? first;
  return [
    {
      heading: 'Introduction',
      body: `${topic.description}\n\nWe will start with what you already know, then build on it.`,
      kind: ActivityType.EXPLANATION,
    },
    {
      heading: 'Worked example',
      body:
        `Watch how this is done step by step.\n\n> ${first?.statement ?? topic.name}\n\n` +
        'Each step is written out so you can copy the method before trying it alone.',
      kind: ActivityType.WORKED_EXAMPLE,
    },
    {
      heading: 'Check what you know',
      body:
        `Answer these in your head, then say them out loud.\n\n> ${second?.statement ?? topic.name}\n\n` +
        'If any part felt hard, read the worked example again before the practice activity.',
      kind: ActivityType.EXPLANATION,
    },
  ];
}

async function upsertLesson(
  topic: SeededTopic,
  context: { schoolId: string; authorId: string; heroMediaId: string | null; publishedAt: Date },
): Promise<SeededLesson> {
  const title = `${topic.name} — lesson`;
  const summary = topic.description.slice(0, 600);
  const columns = {
    title,
    summary,
    body: lessonBody(topic),
    status: ContentStatus.PUBLISHED,
    difficultyBand: topic.band,
    estimatedMinutes: topic.minutes,
    sortOrder: topic.order,
    heroMediaId: context.heroMediaId,
    publishedAt: context.publishedAt,
    archivedAt: null,
    updatedById: context.authorId,
  };

  const lesson = await prisma.lesson.upsert({
    where: { topicId_key: { topicId: topic.id, key: 'lesson' } },
    update: columns,
    create: {
      ...columns,
      schoolId: context.schoolId,
      subjectId: topic.subjectId,
      topicId: topic.id,
      key: 'lesson',
      ownership: ContentOwnership.MIDAS_ORIGINAL,
      createdById: context.authorId,
    },
    select: { id: true },
  });

  await upsertSections(lesson.id, topic);
  return {
    id: lesson.id,
    topicId: topic.id,
    title,
    estimatedMinutes: topic.minutes,
    publishedAt: context.publishedAt,
  };
}
/**
 * Sections have no natural unique key — a lesson may legitimately repeat a
 * heading — so they are matched on position within the lesson.
 */
async function upsertSections(lessonId: string, topic: SeededTopic): Promise<void> {
  for (const [index, spec] of sectionsFor(topic).entries()) {
    const existing = await prisma.lessonSection.findFirst({
      where: { lessonId, sortOrder: index },
      select: { id: true },
    });

    if (existing) {
      await prisma.lessonSection.update({
        where: { id: existing.id },
        data: { heading: spec.heading, body: spec.body, kind: spec.kind },
      });
      continue;
    }

    await prisma.lessonSection.create({
      data: { lessonId, heading: spec.heading, body: spec.body, kind: spec.kind, sortOrder: index },
    });
  }
}
interface ActivitySpec {
  key: string;
  title: string;
  type: ActivityType;
  instructions: string;
  points: number;
  minutes: number;
  passThreshold: number;
  screeningEligible: boolean;
  /** DRAFT and IN_REVIEW rows give the moderation queue something to show. */
  status: ContentStatus;
  objectiveIds: string[];
}

/** Practice, quiz, and one rotating form. Order here is presentation order. */
function activitySpecsFor(topic: SeededTopic, topicIndex: number): ActivitySpec[] {
  const objectiveIds = topic.objectives.map((objective) => objective.id);
  const firstObjective = objectiveIds.slice(0, 1);
  const lastObjective = objectiveIds.slice(-1);
  const variedType = VARIED_TYPES[topicIndex % VARIED_TYPES.length] as ActivityType;

  // Two topics out of every nine keep an unpublished third activity so the
  // content review queue in the admin panel is not empty on a fresh install.
  const variedStatus =
    topicIndex % 9 === 4
      ? ContentStatus.IN_REVIEW
      : topicIndex % 9 === 7
        ? ContentStatus.DRAFT
        : ContentStatus.PUBLISHED;

  return [
    {
      key: 'practice',
      title: `${topic.name} — practice`,
      type: ActivityType.PRACTICE_SEQUENCE,
      instructions: 'Work through the questions. Ask for a hint if you get stuck twice.',
      points: 10,
      minutes: Math.max(5, Math.round(topic.minutes / 2)),
      passThreshold: 70,
      screeningEligible: topic.order === 0,
      status: ContentStatus.PUBLISHED,
      objectiveIds: firstObjective,
    },
    {
      key: 'quiz',
      title: `${topic.name} — quiz`,
      type: ActivityType.QUIZ,
      instructions: 'Six questions, no hints. You can try again tomorrow.',
      points: 20,
      minutes: 10,
      passThreshold: topic.masteryThreshold,
      screeningEligible: false,
      status: ContentStatus.PUBLISHED,
      objectiveIds,
    },
    {
      key: 'extend',
      title: `${topic.name} — ${variedType.toLowerCase().replace(/_/g, ' ')}`,
      type: variedType,
      instructions: 'Try this once the practice feels comfortable.',
      points: 15,
      minutes: 12,
      passThreshold: 70,
      screeningEligible: false,
      status: variedStatus,
      objectiveIds: lastObjective,
    },
  ];
}
async function upsertActivity(
  spec: ActivitySpec,
  topic: SeededTopic,
  index: number,
  context: {
    schoolId: string;
    authorId: string;
    lessonId: string;
    thumbnailMediaId: string | null;
    publishedAt: Date;
  },
): Promise<SeededActivity> {
  const isPublished = spec.status === ContentStatus.PUBLISHED;
  const columns = {
    title: spec.title,
    type: spec.type,
    instructions: spec.instructions,
    config: configFor(spec.type, topic),
    status: spec.status,
    difficultyBand: topic.band,
    estimatedMinutes: spec.minutes,
    pointsValue: spec.points,
    passThreshold: spec.passThreshold,
    screeningEligible: spec.screeningEligible,
    sortOrder: index,
    lessonId: context.lessonId,
    thumbnailMediaId: context.thumbnailMediaId,
    publishedAt: isPublished ? context.publishedAt : null,
    archivedAt: null,
    updatedById: context.authorId,
  };

  const activity = await prisma.activity.upsert({
    where: { topicId_key: { topicId: topic.id, key: spec.key } },
    update: columns,
    create: {
      ...columns,
      schoolId: context.schoolId,
      subjectId: topic.subjectId,
      topicId: topic.id,
      key: spec.key,
      ownership: ContentOwnership.MIDAS_ORIGINAL,
      currentVersion: 1,
      createdById: context.authorId,
    },
    select: { id: true },
  });

  const versionId = await upsertVersion(activity.id, spec, topic, context);
  await linkObjectives(activity.id, spec.objectiveIds);

  return {
    id: activity.id,
    key: spec.key,
    title: spec.title,
    type: spec.type,
    status: spec.status,
    topicId: topic.id,
    subjectId: topic.subjectId,
    versionId,
    version: 1,
    pointsValue: spec.points,
    estimatedMinutes: spec.minutes,
    passThreshold: spec.passThreshold,
    screeningEligible: spec.screeningEligible,
    objectiveIds: spec.objectiveIds,
    publishedAt: columns.publishedAt,
  };
}
/**
 * Version 1 of every activity. The snapshot is what blueprint 12 requires: a
 * frozen record of what was presented, independent of later edits.
 */
async function upsertVersion(
  activityId: string,
  spec: ActivitySpec,
  topic: SeededTopic,
  context: { authorId: string; publishedAt: Date },
): Promise<string> {
  const isPublished = spec.status === ContentStatus.PUBLISHED;
  const snapshot = {
    key: spec.key,
    title: spec.title,
    type: spec.type,
    instructions: spec.instructions,
    config: configFor(spec.type, topic),
    topic: { key: topic.key, name: topic.name, band: topic.band },
    objectives: topic.objectives.map((objective) => ({
      code: objective.code,
      statement: objective.statement,
    })),
    pointsValue: spec.points,
    passThreshold: spec.passThreshold,
  } satisfies Prisma.InputJsonValue;

  const version = await prisma.activityVersion.upsert({
    where: { activityId_version: { activityId, version: 1 } },
    update: {
      status: spec.status,
      snapshot,
      publishedAt: isPublished ? context.publishedAt : null,
    },
    create: {
      activityId,
      version: 1,
      status: spec.status,
      snapshot,
      changeSummary: 'First published version, created by the seed.',
      publishedAt: isPublished ? context.publishedAt : null,
      createdById: context.authorId,
    },
    select: { id: true },
  });
  return version.id;
}

/**
 * Rebuilds every published activity's version snapshot from its real questions,
 * options and hints.
 *
 * `seedContent` runs before `seedQuestions` (an activity has to exist before a
 * question can reference it), so the snapshot `upsertVersion` writes at create
 * time necessarily predates the answer key. Call this once questions exist —
 * it reuses `buildActivitySnapshot`, the exact function the real publish route
 * calls, so the seeded snapshot shape can never drift from what marking
 * (`assessment.marking.ts`) expects.
 */
export async function resnapshotActivities(fixture: ContentFixture): Promise<void> {
  step('Re-snapshotting activities with their questions');
  let updated = 0;

  for (const activity of fixture.activities) {
    const full = await prisma.activity.findUnique({
      where: { id: activity.id },
      include: {
        questions: { include: { options: true, hints: true } },
        objectiveLinks: { select: { objectiveId: true, weight: true } },
      },
    });
    if (!full) continue;

    await prisma.activityVersion.update({
      where: { activityId_version: { activityId: activity.id, version: 1 } },
      data: { snapshot: buildActivitySnapshot(full) },
    });
    updated += 1;
  }

  log(`${updated} activity version snapshot(s) refreshed with their questions.`);
}

/** Blueprint 12: mastery is attributed through these links, weighted. */
async function linkObjectives(activityId: string, objectiveIds: string[]): Promise<void> {
  for (const objectiveId of objectiveIds) {
    const weight = objectiveIds.length === 1 ? 100 : Math.round(100 / objectiveIds.length);
    await prisma.activityObjective.upsert({
      where: { activityId_objectiveId: { activityId, objectiveId } },
      update: { weight },
      create: { activityId, objectiveId, weight },
    });
  }
}
export async function seedContent(
  fixture: SchoolFixture,
  curriculum: CurriculumFixture,
  media: MediaFixture,
  authorId: string,
  now: Date,
): Promise<ContentFixture> {
  step('Lessons and activities (blueprint 03, 12)');

  const result: ContentFixture = {
    lessons: [],
    lessonByTopic: {},
    activities: [],
    activitiesByTopic: {},
  };

  for (const [topicIndex, topic] of curriculum.topics.entries()) {
    // Published a little after the curriculum, and staggered, so the content
    // dashboard has a believable recent-activity list.
    const publishedAt = new Date(now.getTime() - hashInt(`pub:${topic.id}`, 3, 50) * 86_400_000);
    const bannerId = media.subjectBannerIds[topic.subjectKey] ?? null;

    const lesson = await upsertLesson(topic, {
      schoolId: fixture.schoolId,
      authorId,
      heroMediaId: bannerId,
      publishedAt,
    });
    result.lessons.push(lesson);
    result.lessonByTopic[topic.id] = lesson;

    const activities: SeededActivity[] = [];
    for (const [index, spec] of activitySpecsFor(topic, topicIndex).entries()) {
      const activity = await upsertActivity(spec, topic, index, {
        schoolId: fixture.schoolId,
        authorId,
        lessonId: lesson.id,
        thumbnailMediaId: bannerId,
        publishedAt,
      });
      result.activities.push(activity);
      if (activity.status === ContentStatus.PUBLISHED) activities.push(activity);
    }
    result.activitiesByTopic[topic.id] = activities;
  }

  const unpublished = result.activities.filter((a) => a.status !== ContentStatus.PUBLISHED).length;
  log(
    `${result.lessons.length} lessons with ${result.lessons.length * 3} sections, ` +
      `${result.activities.length} activities (${unpublished} left in draft or review)`,
  );
  return result;
}
