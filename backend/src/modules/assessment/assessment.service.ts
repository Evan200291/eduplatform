// ─────────────────────────────────────────────────────────────────────────────
// Assessment service — definitions and items
// Blueprint 03: a screening assessment presents items "across controlled
// difficulty bands" and ends in a placement. This file owns the definition side:
// what the assessment is, which activities it draws on, and its lifecycle.
//
// Siblings in this module:
//   assessment.attempts.service.ts    — starting, answering and submitting
//   assessment.evaluation.service.ts  — turning evidence into mastery inference
//   assessment.marking.ts             — pure marking against a version snapshot
//   assessment.helpers.ts             — tenant guards, band ladder, inference rules
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
import { requireActivity, requireTopic, uniqueKey } from '../content/content.helpers';
import { assertStatusTransition } from '../curriculum/curriculum.service';
import {
  assertItemsPublishable,
  readAssessmentEngineSettings,
  requireAssessment,
  shortId,
} from './assessment.helpers';
import type {
  addAssessmentItemSchema,
  AssessmentListQuery,
  createAssessmentSchema,
  setAssessmentItemsSchema,
  updateAssessmentItemSchema,
  updateAssessmentSchema,
} from './assessment.validation';

type CreateInput = z.infer<typeof createAssessmentSchema>;
type UpdateInput = z.infer<typeof updateAssessmentSchema>;
type AddItemInput = z.infer<typeof addAssessmentItemSchema>;
type UpdateItemInput = z.infer<typeof updateAssessmentItemSchema>;
type SetItemsInput = z.infer<typeof setAssessmentItemsSchema>['items'];

/** Item shape returned to an author: enough to review the band spread at a glance. */
const ITEM_INCLUDE = {
  activity: {
    select: {
      id: true,
      title: true,
      key: true,
      type: true,
      status: true,
      difficultyBand: true,
      pointsValue: true,
      screeningEligible: true,
      currentVersion: true,
      topicId: true,
      _count: { select: { questions: true } },
    },
  },
} satisfies Prisma.AssessmentItemInclude;

async function requireSubject(schoolId: string, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  if (!subject) throw notFound('Subject');
}

// ── Definitions ─────────────────────────────────────────────────────────────

export async function listAssessments(schoolId: string, query: AssessmentListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.AssessmentWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search } }, { key: { contains: query.search } }] }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.assessment.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        subject: { select: { id: true, name: true, key: true } },
        topic: { select: { id: true, name: true, key: true } },
        _count: { select: { items: true, attempts: true } },
      },
    }),
    prisma.assessment.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getAssessment(schoolId: string, id: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, schoolId },
    include: {
      subject: { select: { id: true, name: true, key: true } },
      topic: { select: { id: true, name: true, key: true, masteryThreshold: true } },
      items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: ITEM_INCLUDE },
      _count: { select: { attempts: true } },
    },
  });
  if (!assessment) throw notFound('Assessment');
  return assessment;
}

export async function createAssessment(
  context: ActorContext,
  schoolId: string,
  input: CreateInput,
) {
  await requireSubject(schoolId, input.subjectId);
  if (input.topicId) {
    const topic = await requireTopic(schoolId, input.topicId);
    if (topic.subjectId !== input.subjectId) {
      throw badRequest('That topic belongs to a different subject.');
    }
  }

  const key = await uniqueKey(input.key ?? slugify(input.title), async (value) => {
    const existing = await prisma.assessment.findFirst({
      where: { schoolId, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  // Blueprint 03/06: an author who doesn't specify a shuffle preference gets the
  // school's configured default, which itself defaults to `true` — today's
  // hardcoded behavior for a school that has not touched the setting.
  const shuffleItems =
    input.shuffleItems ?? (await readAssessmentEngineSettings(schoolId)).defaultShuffleItems;

  const assessment = await prisma.assessment.create({
    data: {
      schoolId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      kind: input.kind,
      title: input.title,
      key,
      description: input.description,
      itemTarget: input.itemTarget,
      timeLimitMinutes: input.timeLimitMinutes,
      adaptiveEnabled: input.adaptiveEnabled,
      startingBand: input.startingBand,
      passThreshold: input.passThreshold,
      maxAttempts: input.maxAttempts,
      cooldownDays: input.cooldownDays,
      driveRecommendations: input.driveRecommendations,
      shuffleItems,
      showFeedbackImmediately: input.showFeedbackImmediately,
      createdById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'assessment.create',
    targetType: 'Assessment',
    targetId: assessment.id,
    schoolId,
    summary: `Created ${assessment.kind} assessment "${assessment.title}".`,
    afterData: assessment,
  });

  return assessment;
}

export async function updateAssessment(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateInput,
) {
  const before = await requireAssessment(schoolId, id);
  if (input.topicId) {
    const topic = await requireTopic(schoolId, input.topicId);
    if (topic.subjectId !== before.subjectId) {
      throw badRequest('That topic belongs to a different subject.');
    }
  }

  const after = await prisma.assessment.update({
    where: { id },
    data: {
      topicId: input.topicId,
      title: input.title,
      key: input.key,
      description: input.description,
      itemTarget: input.itemTarget,
      timeLimitMinutes: input.timeLimitMinutes,
      adaptiveEnabled: input.adaptiveEnabled,
      startingBand: input.startingBand,
      passThreshold: input.passThreshold,
      maxAttempts: input.maxAttempts,
      cooldownDays: input.cooldownDays,
      driveRecommendations: input.driveRecommendations,
      shuffleItems: input.shuffleItems,
      showFeedbackImmediately: input.showFeedbackImmediately,
    },
  });

  recordAudit(context, {
    action: 'assessment.update',
    targetType: 'Assessment',
    targetId: id,
    schoolId,
    summary: `Updated assessment "${after.title}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

/**
 * Moves the assessment along the blueprint 05 lifecycle. Publishing additionally
 * requires that every item points at published content, so a learner can never be
 * shown a draft mid-attempt.
 */
export async function setAssessmentStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const before = await requireAssessment(schoolId, id);
  assertStatusTransition(before.status, status);

  if (status === ContentStatus.PUBLISHED) {
    await assertItemsPublishable(id);
  }

  const after = await prisma.assessment.update({
    where: { id },
    data: {
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? new Date() : undefined,
      archivedAt: status === ContentStatus.ARCHIVED ? new Date() : null,
    },
  });

  recordAudit(context, {
    action: status === ContentStatus.PUBLISHED ? 'assessment.publish' : 'assessment.update',
    targetType: 'Assessment',
    targetId: id,
    schoolId,
    summary: `Set assessment "${after.title}" to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

/** The `POST /:id/publish` route, kept separate so it can carry its own grant. */
export function publishAssessment(
  context: ActorContext,
  schoolId: string,
  id: string,
  reason?: string,
) {
  return setAssessmentStatus(context, schoolId, id, ContentStatus.PUBLISHED, reason);
}

// ── Items ───────────────────────────────────────────────────────────────────

export async function listAssessmentItems(schoolId: string, id: string) {
  await requireAssessment(schoolId, id);
  return prisma.assessmentItem.findMany({
    where: { assessmentId: id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: ITEM_INCLUDE,
  });
}

/**
 * Blueprint 03: "only vetted items may appear in the screening assessment." A
 * SCREENING assessment therefore accepts an activity only when the author has
 * marked it `screeningEligible`; other kinds may draw on any activity.
 */
async function assertItemUsable(
  schoolId: string,
  assessment: { kind: string; subjectId: string },
  activityId: string,
): Promise<void> {
  await requireActivity(schoolId, activityId);
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, schoolId },
    select: { id: true, subjectId: true, screeningEligible: true, _count: { select: { questions: true } } },
  });
  if (!activity) throw notFound('Activity');

  if (activity.subjectId !== assessment.subjectId) {
    throw badRequest('That activity belongs to a different subject.');
  }
  if (activity._count.questions === 0) {
    throw badRequest('That activity has no questions, so it cannot be marked.');
  }
  if (assessment.kind === 'SCREENING' && !activity.screeningEligible) {
    throw badRequest('That activity is not marked as eligible for screening.');
  }
}

export async function addAssessmentItem(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: AddItemInput,
) {
  const assessment = await requireAssessment(schoolId, id);
  await assertItemUsable(schoolId, assessment, input.activityId);

  const existing = await prisma.assessmentItem.findFirst({
    where: { assessmentId: id, activityId: input.activityId },
    select: { id: true },
  });
  if (existing) throw badRequest('That activity is already in this assessment.');

  const item = await prisma.assessmentItem.create({
    data: {
      assessmentId: id,
      activityId: input.activityId,
      sortOrder: input.sortOrder,
      difficultyBand: input.difficultyBand,
      weight: input.weight,
      isAdaptiveEntry: input.isAdaptiveEntry,
    },
    include: ITEM_INCLUDE,
  });

  recordAudit(context, {
    action: 'assessment.update',
    targetType: 'AssessmentItem',
    targetId: item.id,
    schoolId,
    summary: `Added "${item.activity.title}" to assessment "${assessment.title}".`,
    afterData: { assessmentId: id, activityId: input.activityId, band: input.difficultyBand },
  });

  return item;
}

export async function updateAssessmentItem(
  context: ActorContext,
  schoolId: string,
  id: string,
  itemId: string,
  input: UpdateItemInput,
) {
  await requireAssessment(schoolId, id);
  const before = await prisma.assessmentItem.findFirst({
    where: { id: itemId, assessmentId: id },
    select: { id: true, sortOrder: true, difficultyBand: true, weight: true, isAdaptiveEntry: true },
  });
  if (!before) throw notFound('Assessment item');

  const after = await prisma.assessmentItem.update({
    where: { id: itemId },
    data: {
      sortOrder: input.sortOrder,
      difficultyBand: input.difficultyBand,
      weight: input.weight,
      isAdaptiveEntry: input.isAdaptiveEntry,
    },
    include: ITEM_INCLUDE,
  });

  recordAudit(context, {
    action: 'assessment.update',
    targetType: 'AssessmentItem',
    targetId: itemId,
    schoolId,
    summary: `Updated an item on assessment ${id}.`,
    beforeData: before,
    afterData: { sortOrder: after.sortOrder, difficultyBand: after.difficultyBand, weight: after.weight },
  });

  return after;
}

export async function removeAssessmentItem(
  context: ActorContext,
  schoolId: string,
  id: string,
  itemId: string,
) {
  await requireAssessment(schoolId, id);
  const item = await prisma.assessmentItem.findFirst({
    where: { id: itemId, assessmentId: id },
    select: { id: true, activityId: true },
  });
  if (!item) throw notFound('Assessment item');

  // Responses reference the question and the activity version, never the item, so
  // removing an item from the definition never erases collected evidence.
  await prisma.assessmentItem.delete({ where: { id: itemId } });

  recordAudit(context, {
    action: 'assessment.update',
    targetType: 'AssessmentItem',
    targetId: itemId,
    schoolId,
    summary: `Removed an item from assessment ${id}.`,
    beforeData: item,
  });

  return { id: itemId, removed: true };
}

/**
 * Replaces the whole item list, which is how the authoring screen saves. Done in a
 * transaction so a partial save cannot leave an assessment half-built.
 */
export async function setAssessmentItems(
  context: ActorContext,
  schoolId: string,
  id: string,
  items: SetItemsInput,
) {
  const assessment = await requireAssessment(schoolId, id);

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.activityId)) {
      throw badRequest('The same activity appears twice in the item list.');
    }
    seen.add(item.activityId);
    await assertItemUsable(schoolId, assessment, item.activityId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.assessmentItem.deleteMany({ where: { assessmentId: id } });
    if (items.length > 0) {
      await tx.assessmentItem.createMany({
        data: items.map((item) => ({
          assessmentId: id,
          activityId: item.activityId,
          sortOrder: item.sortOrder,
          difficultyBand: item.difficultyBand,
          weight: item.weight,
          isAdaptiveEntry: item.isAdaptiveEntry,
        })),
      });
    }
  });

  recordAudit(context, {
    action: 'assessment.update',
    targetType: 'Assessment',
    targetId: id,
    schoolId,
    summary: `Replaced the item list on assessment "${assessment.title}" with ${items.length} item(s).`,
    afterData: { itemCount: items.length },
  });

  return listAssessmentItems(schoolId, id);
}
