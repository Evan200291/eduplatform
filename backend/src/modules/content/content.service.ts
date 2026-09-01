// ─────────────────────────────────────────────────────────────────────────────
// Content service — lessons and activities
// Blueprint 12 is the load-bearing rule here: "a student response references the
// exact content version that was presented." Publishing therefore writes an
// immutable `ActivityVersion` snapshot containing the questions, options and
// hints as they stood, and the assessment module records responses against that
// snapshot rather than against the mutable activity row.
//
// The second rule is that answer keys never leave the server for a learner.
// `getActivityForDelivery` selects through `DELIVERY_QUESTION_SELECT`, which has
// no `isCorrect`, no `matchKey`, no distractor feedback and no `correct*` column.
//
// Siblings in this module:
//   content.questions.service.ts  — question, option and hint authoring
//   content.governance.service.ts — ownership, publications, reports, moderation
//   content.helpers.ts            — tenant guards, snapshots, value conversion
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { ContentStatus } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import { slugify } from '../../core/auth/codes';
import type { ActorContext } from '../../core/context';
import { badRequest, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { assertStatusTransition, statusAuditAction } from '../curriculum/curriculum.service';
import {
  buildActivitySnapshot,
  filterTopicObjectives,
  requireActivity,
  requireLesson,
  requireMedia,
  requiresQuestions,
  requireTopic,
  shortId,
  toJsonInput,
  uniqueKey,
} from './content.helpers';
import type {
  ActivityListQuery,
  createActivitySchema,
  createLessonSchema,
  createLessonSectionSchema,
  LessonListQuery,
  publishActivitySchema,
  setActivityObjectivesSchema,
  updateActivitySchema,
  updateLessonSchema,
  updateLessonSectionSchema,
} from './content.validation';

type CreateLessonInput = z.infer<typeof createLessonSchema>;
type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
type CreateSectionInput = z.infer<typeof createLessonSectionSchema>;
type UpdateSectionInput = z.infer<typeof updateLessonSectionSchema>;
type CreateActivityInput = z.infer<typeof createActivitySchema>;
type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
type ObjectiveLinkInput = z.infer<typeof setActivityObjectivesSchema>['objectives'];
type PublishInput = z.infer<typeof publishActivitySchema>;

/** Columns a learner may see on a question. Answer keys are absent by design. */
const DELIVERY_QUESTION_SELECT = {
  id: true,
  type: true,
  prompt: true,
  config: true,
  promptMediaId: true,
  difficultyBand: true,
  pointsValue: true,
  sortOrder: true,
  timeLimitSeconds: true,
  objectiveId: true,
  options: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, sortOrder: true, mediaId: true },
  },
  hints: {
    orderBy: [{ sortOrder: 'asc' }],
    select: { id: true, body: true, sortOrder: true, pointsCost: true },
  },
} satisfies Prisma.QuestionSelect;


// ── Lessons ─────────────────────────────────────────────────────────────────

export async function listLessons(schoolId: string, query: LessonListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.LessonWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.unitId ? { topic: { unitId: query.unitId } } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.difficultyBand ? { difficultyBand: query.difficultyBand } : {}),
    ...(query.ageMode ? { ageMode: query.ageMode } : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search } },
            { key: { contains: query.search } },
            { summary: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.lesson.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        topic: { select: { id: true, name: true, key: true, unitId: true } },
        subject: { select: { id: true, name: true, key: true, colorHex: true } },
        _count: { select: { sections: true, activities: true } },
      },
    }),
    prisma.lesson.count({ where }),
  ]);

  return { items, totalItems };
}

/** The full lesson as the authoring UI and the learner reader both need it. */
export async function getLesson(schoolId: string, id: string) {
  const lesson = await prisma.lesson.findFirst({
    where: { id, schoolId },
    include: {
      topic: { select: { id: true, name: true, key: true, masteryThreshold: true } },
      subject: { select: { id: true, name: true, key: true, colorHex: true } },
      sections: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      activities: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        select: {
          id: true,
          title: true,
          key: true,
          type: true,
          status: true,
          difficultyBand: true,
          estimatedMinutes: true,
          pointsValue: true,
          sortOrder: true,
          currentVersion: true,
        },
      },
      publications: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!lesson) throw notFound('Lesson');
  return lesson;
}

export async function createLesson(
  context: ActorContext,
  schoolId: string,
  input: CreateLessonInput,
) {
  const topic = await requireTopic(schoolId, input.topicId);
  if (input.heroMediaId) await requireMedia(schoolId, input.heroMediaId);

  const key = await uniqueKey(input.key ?? slugify(input.title), async (value) => {
    const existing = await prisma.lesson.findFirst({
      where: { topicId: topic.id, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  const lesson = await prisma.lesson.create({
    data: {
      schoolId,
      subjectId: topic.subjectId,
      topicId: topic.id,
      title: input.title,
      key,
      summary: input.summary,
      body: input.body,
      ownership: input.ownership,
      difficultyBand: input.difficultyBand,
      estimatedMinutes: input.estimatedMinutes,
      ageMode: input.ageMode,
      sortOrder: input.sortOrder,
      requiresAudio: input.requiresAudio,
      heroMediaId: input.heroMediaId,
      createdById: shortId(context.actor.userId),
      updatedById: shortId(context.actor.userId),
      ...(input.sections && input.sections.length > 0
        ? {
            sections: {
              create: input.sections.map((section, index) => ({
                heading: section.heading,
                body: section.body,
                kind: section.kind,
                sortOrder: section.sortOrder || index,
                mediaId: section.mediaId,
              })),
            },
          }
        : {}),
    },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });

  recordAudit(context, {
    action: 'lesson.create',
    targetType: 'Lesson',
    targetId: lesson.id,
    schoolId,
    summary: `Created lesson "${lesson.title}".`,
    afterData: lesson,
  });

  return lesson;
}

export async function updateLesson(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateLessonInput,
) {
  const existing = await prisma.lesson.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound('Lesson');
  if (input.heroMediaId) await requireMedia(schoolId, input.heroMediaId);

  const key =
    input.key && input.key !== existing.key
      ? await uniqueKey(input.key, async (value) => {
          const clash = await prisma.lesson.findFirst({
            where: { topicId: existing.topicId, key: value, id: { not: id } },
            select: { id: true },
          });
          return clash === null;
        })
      : undefined;

  // Blueprint 05: editing published content moves it to REVISED rather than
  // silently changing what learners are already working through.
  const revising = existing.status === ContentStatus.PUBLISHED;

  const lesson = await prisma.lesson.update({
    where: { id },
    data: {
      ...(key ? { key } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.ownership !== undefined ? { ownership: input.ownership } : {}),
      ...(input.difficultyBand !== undefined ? { difficultyBand: input.difficultyBand } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
      ...(input.ageMode !== undefined ? { ageMode: input.ageMode } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.requiresAudio !== undefined ? { requiresAudio: input.requiresAudio } : {}),
      ...(input.heroMediaId !== undefined ? { heroMediaId: input.heroMediaId } : {}),
      ...(revising ? { status: ContentStatus.REVISED, version: existing.version + 1 } : {}),
      updatedById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'lesson.update',
    targetType: 'Lesson',
    targetId: lesson.id,
    schoolId,
    summary: revising
      ? `Revised published lesson "${lesson.title}" to version ${lesson.version}.`
      : `Updated lesson "${lesson.title}".`,
    beforeData: existing,
    afterData: lesson,
  });

  return lesson;
}

export async function setLessonStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const existing = await prisma.lesson.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound('Lesson');
  assertStatusTransition(existing.status, status);

  const now = new Date();
  const lesson = await prisma.$transaction(async (tx) => {
    const updated = await tx.lesson.update({
      where: { id },
      data: {
        status,
        publishedAt: status === ContentStatus.PUBLISHED ? now : existing.publishedAt,
        archivedAt: status === ContentStatus.ARCHIVED ? now : null,
        updatedById: shortId(context.actor.userId),
      },
    });

    // Blueprint 05: publication is an explicit, reviewable, reversible event.
    if (status === ContentStatus.PUBLISHED) {
      await tx.contentPublication.updateMany({
        where: { lessonId: id, retiredAt: null },
        data: { retiredAt: now },
      });
      await tx.contentPublication.create({
        data: {
          schoolId,
          lessonId: id,
          version: updated.version,
          status: ContentStatus.PUBLISHED,
          changeSummary: reason?.slice(0, 500),
          publishedById: shortId(context.actor.userId),
          reviewedById: shortId(context.actor.userId),
          publishedAt: now,
        },
      });
    }

    if (status === ContentStatus.ARCHIVED) {
      await tx.contentPublication.updateMany({
        where: { lessonId: id, retiredAt: null },
        data: { retiredAt: now },
      });
    }

    return updated;
  });

  recordAudit(context, {
    action: statusAuditAction(status),
    targetType: 'Lesson',
    targetId: lesson.id,
    schoolId,
    summary: `Lesson "${lesson.title}" moved from ${existing.status} to ${status}.`,
    reason,
    beforeData: { status: existing.status },
    afterData: { status: lesson.status },
  });

  return lesson;
}

// ── Lesson sections ─────────────────────────────────────────────────────────

export async function addLessonSection(
  context: ActorContext,
  schoolId: string,
  lessonId: string,
  input: CreateSectionInput,
) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, schoolId },
    select: { id: true, title: true },
  });
  if (!lesson) throw notFound('Lesson');
  if (input.mediaId) await requireMedia(schoolId, input.mediaId);

  const section = await prisma.lessonSection.create({
    data: {
      lessonId,
      heading: input.heading,
      body: input.body,
      kind: input.kind,
      sortOrder: input.sortOrder,
      mediaId: input.mediaId,
    },
  });

  recordAudit(context, {
    action: 'lesson.update',
    targetType: 'LessonSection',
    targetId: section.id,
    schoolId,
    summary: `Added section "${section.heading}" to lesson "${lesson.title}".`,
    afterData: section,
  });

  return section;
}

export async function updateLessonSection(
  context: ActorContext,
  schoolId: string,
  lessonId: string,
  sectionId: string,
  input: UpdateSectionInput,
) {
  const existing = await prisma.lessonSection.findFirst({
    where: { id: sectionId, lessonId, lesson: { schoolId } },
  });
  if (!existing) throw notFound('Lesson section');
  if (input.mediaId) await requireMedia(schoolId, input.mediaId);

  const section = await prisma.lessonSection.update({
    where: { id: sectionId },
    data: {
      ...(input.heading !== undefined ? { heading: input.heading } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
    },
  });

  recordAudit(context, {
    action: 'lesson.update',
    targetType: 'LessonSection',
    targetId: section.id,
    schoolId,
    summary: `Updated lesson section "${section.heading}".`,
    beforeData: existing,
    afterData: section,
  });

  return section;
}

export async function deleteLessonSection(
  context: ActorContext,
  schoolId: string,
  lessonId: string,
  sectionId: string,
) {
  const existing = await prisma.lessonSection.findFirst({
    where: { id: sectionId, lessonId, lesson: { schoolId } },
  });
  if (!existing) throw notFound('Lesson section');

  await prisma.lessonSection.delete({ where: { id: sectionId } });

  recordAudit(context, {
    action: 'lesson.update',
    targetType: 'LessonSection',
    targetId: sectionId,
    schoolId,
    summary: `Removed lesson section "${existing.heading}".`,
    beforeData: existing,
  });

  return { deleted: true };
}

/** Drag-and-drop reordering of sections in one request. */
export async function reorderLessonSections(
  context: ActorContext,
  schoolId: string,
  lessonId: string,
  items: { id: string; sortOrder: number }[],
) {
  const owned = await prisma.lessonSection.findMany({
    where: { lessonId, lesson: { schoolId }, id: { in: items.map((item) => item.id) } },
    select: { id: true },
  });
  const allowed = new Set(owned.map((row) => row.id));
  const updates = items.filter((item) => allowed.has(item.id));
  if (updates.length === 0) throw badRequest('None of those sections belong to this lesson.');

  await prisma.$transaction(
    updates.map((item) =>
      prisma.lessonSection.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } }),
    ),
  );

  recordAudit(context, {
    action: 'lesson.update',
    targetType: 'Lesson',
    targetId: lessonId,
    schoolId,
    summary: `Reordered ${updates.length} lesson section(s).`,
  });

  return { updated: updates.length };
}

// ── Activities ──────────────────────────────────────────────────────────────

export async function listActivities(schoolId: string, query: ActivityListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.ActivityWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.lessonId ? { lessonId: query.lessonId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.difficultyBand ? { difficultyBand: query.difficultyBand } : {}),
    ...(query.ageMode ? { ageMode: query.ageMode } : {}),
    ...(query.screeningEligible ? { screeningEligible: true } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search } }, { key: { contains: query.search } }] }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.activity.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      include: {
        topic: { select: { id: true, name: true, key: true } },
        subject: { select: { id: true, name: true, key: true, colorHex: true } },
        lesson: { select: { id: true, title: true } },
        _count: { select: { questions: true, versions: true, objectiveLinks: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return { items, totalItems };
}

/** The authoring view: questions *with* their answer keys. Staff permissions only. */
export async function getActivity(schoolId: string, id: string) {
  const activity = await prisma.activity.findFirst({
    where: { id, schoolId },
    include: {
      topic: { select: { id: true, name: true, key: true, masteryThreshold: true } },
      subject: { select: { id: true, name: true, key: true, colorHex: true } },
      lesson: { select: { id: true, title: true } },
      objectiveLinks: {
        include: { objective: { select: { id: true, code: true, statement: true } } },
      },
      questions: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          options: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          hints: { orderBy: { sortOrder: 'asc' } },
        },
      },
      versions: {
        orderBy: { version: 'desc' },
        take: 20,
        select: {
          id: true,
          version: true,
          status: true,
          changeSummary: true,
          invalidatesPriorEvidence: true,
          publishedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!activity) throw notFound('Activity');
  return activity;
}

/**
 * The learner-facing payload. Blueprint 12: a response must reference the exact
 * version presented, so the version id travels with the activity and the client
 * echoes it back on submission.
 */
export async function getActivityForDelivery(schoolId: string, id: string) {
  const activity = await prisma.activity.findFirst({
    where: { id, schoolId, archivedAt: null },
    select: {
      id: true,
      title: true,
      type: true,
      instructions: true,
      config: true,
      status: true,
      currentVersion: true,
      difficultyBand: true,
      estimatedMinutes: true,
      pointsValue: true,
      maxAttempts: true,
      passThreshold: true,
      thumbnailMediaId: true,
      topicId: true,
      subjectId: true,
      lessonId: true,
      questions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: DELIVERY_QUESTION_SELECT },
    },
  });

  if (!activity) throw notFound('Activity');
  if (activity.status !== ContentStatus.PUBLISHED) {
    throw badRequest('That activity is not published yet.');
  }

  const version = await prisma.activityVersion.findFirst({
    where: { activityId: id, status: ContentStatus.PUBLISHED },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, publishedAt: true },
  });

  return { ...activity, version };
}

export async function listActivityVersions(schoolId: string, id: string) {
  await requireActivity(schoolId, id);
  return prisma.activityVersion.findMany({
    where: { activityId: id },
    orderBy: { version: 'desc' },
    take: 100,
  });
}

export async function createActivity(
  context: ActorContext,
  schoolId: string,
  input: CreateActivityInput,
) {
  const topic = await requireTopic(schoolId, input.topicId);
  if (input.lessonId) await requireLesson(schoolId, input.lessonId);
  if (input.thumbnailMediaId) await requireMedia(schoolId, input.thumbnailMediaId);
  const objectives = input.objectives ? await filterTopicObjectives(topic.id, input.objectives) : [];

  const key = await uniqueKey(input.key ?? slugify(input.title), async (value) => {
    const existing = await prisma.activity.findFirst({
      where: { topicId: topic.id, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  const activity = await prisma.activity.create({
    data: {
      schoolId,
      subjectId: topic.subjectId,
      topicId: topic.id,
      lessonId: input.lessonId,
      title: input.title,
      key,
      type: input.type,
      instructions: input.instructions,
      config: toJsonInput(input.config),
      ownership: input.ownership,
      difficultyBand: input.difficultyBand,
      estimatedMinutes: input.estimatedMinutes,
      pointsValue: input.pointsValue,
      maxAttempts: input.maxAttempts,
      passThreshold: input.passThreshold,
      ageMode: input.ageMode,
      sortOrder: input.sortOrder,
      screeningEligible: input.screeningEligible,
      thumbnailMediaId: input.thumbnailMediaId,
      createdById: shortId(context.actor.userId),
      updatedById: shortId(context.actor.userId),
      ...(objectives.length > 0
        ? {
            objectiveLinks: {
              create: objectives.map((link) => ({
                objectiveId: link.objectiveId,
                weight: link.weight,
              })),
            },
          }
        : {}),
    },
    include: { objectiveLinks: true },
  });

  recordAudit(context, {
    action: 'activity.create',
    targetType: 'Activity',
    targetId: activity.id,
    schoolId,
    summary: `Created ${activity.type} activity "${activity.title}".`,
    afterData: activity,
  });

  return activity;
}

export async function updateActivity(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateActivityInput,
) {
  const existing = await prisma.activity.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound('Activity');
  if (input.lessonId) await requireLesson(schoolId, input.lessonId);
  if (input.thumbnailMediaId) await requireMedia(schoolId, input.thumbnailMediaId);

  const key =
    input.key && input.key !== existing.key
      ? await uniqueKey(input.key, async (value) => {
          const clash = await prisma.activity.findFirst({
            where: { topicId: existing.topicId, key: value, id: { not: id } },
            select: { id: true },
          });
          return clash === null;
        })
      : undefined;

  const revising = existing.status === ContentStatus.PUBLISHED;

  const activity = await prisma.activity.update({
    where: { id },
    data: {
      ...(key ? { key } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.config !== undefined ? { config: toJsonInput(input.config) } : {}),
      ...(input.ownership !== undefined ? { ownership: input.ownership } : {}),
      ...(input.difficultyBand !== undefined ? { difficultyBand: input.difficultyBand } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
      ...(input.pointsValue !== undefined ? { pointsValue: input.pointsValue } : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.passThreshold !== undefined ? { passThreshold: input.passThreshold } : {}),
      ...(input.ageMode !== undefined ? { ageMode: input.ageMode } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.screeningEligible !== undefined ? { screeningEligible: input.screeningEligible } : {}),
      ...(input.thumbnailMediaId !== undefined ? { thumbnailMediaId: input.thumbnailMediaId } : {}),
      ...(input.lessonId !== undefined ? { lessonId: input.lessonId } : {}),
      ...(revising ? { status: ContentStatus.REVISED } : {}),
      updatedById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Activity',
    targetId: activity.id,
    schoolId,
    summary: revising
      ? `Revised published activity "${activity.title}"; republish to make it live.`
      : `Updated activity "${activity.title}".`,
    beforeData: existing,
    afterData: activity,
  });

  return activity;
}

export async function setActivityStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const existing = await prisma.activity.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound('Activity');
  assertStatusTransition(existing.status, status);

  // Publishing needs a change summary and an evidence decision, so it has its
  // own endpoint. This route deliberately refuses the shortcut.
  if (status === ContentStatus.PUBLISHED) {
    throw badRequest('Use POST /activities/:id/publish to publish an activity.');
  }

  const now = new Date();
  const activity = await prisma.$transaction(async (tx) => {
    const updated = await tx.activity.update({
      where: { id },
      data: {
        status,
        archivedAt: status === ContentStatus.ARCHIVED ? now : null,
        updatedById: shortId(context.actor.userId),
      },
    });

    if (status === ContentStatus.ARCHIVED) {
      await tx.contentPublication.updateMany({
        where: { activityId: id, retiredAt: null },
        data: { retiredAt: now },
      });
    }

    return updated;
  });

  recordAudit(context, {
    action: statusAuditAction(status),
    targetType: 'Activity',
    targetId: activity.id,
    schoolId,
    summary: `Activity "${activity.title}" moved from ${existing.status} to ${status}.`,
    reason,
  });

  return activity;
}

/**
 * Publishes an activity by snapshotting it. The snapshot is what the assessment
 * module marks against, so a later edit to the live activity can never change
 * how an already-submitted response was scored.
 */
export async function publishActivity(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: PublishInput,
) {
  const activity = await prisma.activity.findFirst({
    where: { id, schoolId },
    include: {
      questions: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          options: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
          hints: { orderBy: { sortOrder: 'asc' } },
        },
      },
      objectiveLinks: { select: { objectiveId: true, weight: true } },
    },
  });
  if (!activity) throw notFound('Activity');

  if (activity.status !== ContentStatus.APPROVED && activity.status !== ContentStatus.REVISED) {
    throw badRequest('Only approved or revised activities can be published.');
  }
  if (requiresQuestions(activity.type) && activity.questions.length === 0) {
    throw badRequest('Add at least one question before publishing this activity.');
  }

  const latest = await prisma.activityVersion.findFirst({
    where: { activityId: id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const version = await tx.activityVersion.create({
      data: {
        activityId: id,
        version: nextVersion,
        status: ContentStatus.PUBLISHED,
        snapshot: buildActivitySnapshot(activity),
        changeSummary: input.changeSummary,
        invalidatesPriorEvidence: input.invalidatesPriorEvidence,
        publishedAt: now,
        createdById: shortId(context.actor.userId),
      },
    });

    await tx.contentPublication.updateMany({
      where: { activityId: id, retiredAt: null },
      data: { retiredAt: now },
    });

    await tx.contentPublication.create({
      data: {
        schoolId,
        activityId: id,
        version: nextVersion,
        status: ContentStatus.PUBLISHED,
        changeSummary: input.changeSummary,
        reviewNotes: input.reviewNotes,
        reviewedById: shortId(context.actor.userId),
        publishedById: shortId(context.actor.userId),
        publishedAt: now,
      },
    });

    const updated = await tx.activity.update({
      where: { id },
      data: {
        status: ContentStatus.PUBLISHED,
        currentVersion: nextVersion,
        publishedAt: activity.publishedAt ?? now,
        archivedAt: null,
        updatedById: shortId(context.actor.userId),
      },
    });

    return { activity: updated, version };
  });

  recordAudit(context, {
    action: 'content.publish',
    targetType: 'Activity',
    targetId: id,
    schoolId,
    summary: `Published activity "${activity.title}" as version ${nextVersion}.`,
    reason: input.changeSummary,
    afterData: {
      version: nextVersion,
      invalidatesPriorEvidence: input.invalidatesPriorEvidence,
    },
  });

  return {
    activity: result.activity,
    version: {
      id: result.version.id,
      version: result.version.version,
      publishedAt: result.version.publishedAt,
    },
  };
}

export async function setActivityObjectives(
  context: ActorContext,
  schoolId: string,
  id: string,
  objectives: ObjectiveLinkInput,
) {
  const activity = await requireActivity(schoolId, id);
  const allowed = await filterTopicObjectives(activity.topicId, objectives);

  await prisma.$transaction(async (tx) => {
    await tx.activityObjective.deleteMany({ where: { activityId: id } });
    if (allowed.length > 0) {
      await tx.activityObjective.createMany({
        data: allowed.map((link) => ({
          activityId: id,
          objectiveId: link.objectiveId,
          weight: link.weight,
        })),
      });
    }
  });

  recordAudit(context, {
    action: 'activity.update',
    targetType: 'Activity',
    targetId: id,
    schoolId,
    summary: `Linked activity "${activity.title}" to ${allowed.length} objective(s).`,
    afterData: allowed,
  });

  return prisma.activityObjective.findMany({
    where: { activityId: id },
    include: { objective: { select: { id: true, code: true, statement: true } } },
  });
}
