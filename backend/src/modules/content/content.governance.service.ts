// ─────────────────────────────────────────────────────────────────────────────
// Content service — governance
// Blueprint 05 "Ownership labels" and safety controls, plus blueprint 10's legal
// position: who owns a piece of content, when it was published, who flagged it
// and what was decided. Everything here is evidence rather than presentation, so
// each write leaves an audit row and a reviewable record.
//
// A learner may raise a report and read their own; only `content.report.review`
// holders may list the school's reports or resolve one.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentStatus, ModerationDecision, type Prisma } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import {
  assertOwnershipTargetExists,
  requireActivity,
  requireLesson,
  resolveReportTargetType,
  shortId,
} from './content.helpers';
import type {
  ContentReportListQuery,
  createContentReportSchema,
  createModerationReviewSchema,
  ModerationReviewListQuery,
  OwnershipListQuery,
  PublicationListQuery,
  resolveContentReportSchema,
  setOwnershipSchema,
} from './content.validation';

type SetOwnershipInput = z.infer<typeof setOwnershipSchema>;
type CreateReportInput = z.infer<typeof createContentReportSchema>;
type ResolveReportInput = z.infer<typeof resolveContentReportSchema>;
type CreateReviewInput = z.infer<typeof createModerationReviewSchema>;

// ── Ownership records (blueprint 05 / 10) ───────────────────────────────────

export async function listOwnershipRecords(schoolId: string, query: OwnershipListQuery) {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.ContentOwnershipRecordWhereInput = {
    schoolId,
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.ownership ? { ownership: query.ownership } : {}),
    ...(query.search
      ? {
          OR: [
            { licenseHolder: { contains: query.search } },
            { licenseReference: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.contentOwnershipRecord.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
    prisma.contentOwnershipRecord.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * Records who owns a piece of content and on what terms. Upserted on the
 * `(targetType, targetId)` pair so the current position is always one row.
 */
export async function setOwnershipRecord(
  context: ActorContext,
  schoolId: string,
  input: SetOwnershipInput,
) {
  if (input.licenseEndsAt && input.licenseStartsAt && input.licenseEndsAt <= input.licenseStartsAt) {
    throw badRequest('The licence end date must be after its start date.');
  }
  await assertOwnershipTargetExists(schoolId, input.targetType, input.targetId);

  const data = {
    schoolId,
    targetType: input.targetType,
    targetId: input.targetId.slice(0, 32),
    ownership: input.ownership,
    licenseHolder: input.licenseHolder,
    licenseReference: input.licenseReference,
    licenseStartsAt: input.licenseStartsAt,
    licenseEndsAt: input.licenseEndsAt,
    canRedistribute: input.canRedistribute,
    notes: input.notes,
  };

  const record = await prisma.contentOwnershipRecord.upsert({
    where: { targetType_targetId: { targetType: data.targetType, targetId: data.targetId } },
    create: { ...data, createdById: shortId(context.actor.userId) },
    update: data,
  });

  recordAudit(context, {
    action: 'ownership.record',
    targetType: 'ContentOwnershipRecord',
    targetId: record.id,
    schoolId,
    summary: `Recorded ${record.ownership} ownership for ${record.targetType} ${record.targetId}.`,
    afterData: record,
  });

  return record;
}

// ── Publication history ─────────────────────────────────────────────────────

export async function listPublications(schoolId: string, query: PublicationListQuery) {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.ContentPublicationWhereInput = {
    schoolId,
    ...(query.lessonId ? { lessonId: query.lessonId } : {}),
    ...(query.activityId ? { activityId: query.activityId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.contentPublication.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        lesson: { select: { id: true, title: true } },
        activity: { select: { id: true, title: true, type: true } },
      },
    }),
    prisma.contentPublication.count({ where }),
  ]);

  return { items, totalItems };
}

// ── Content reports and moderation (blueprint 05 safety) ────────────────────

export async function listContentReports(
  schoolId: string,
  query: ContentReportListQuery,
  /** Set for a learner: they may only ever see the reports they raised. */
  restrictToReporterId?: string,
) {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.ContentReportWhereInput = {
    schoolId,
    ...(restrictToReporterId ? { reporterId: restrictToReporterId } : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    ...(query.reason ? { reason: query.reason } : {}),
    ...(query.lessonId ? { lessonId: query.lessonId } : {}),
    ...(query.activityId ? { activityId: query.activityId } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.contentReport.findMany({
      where,
      skip,
      take,
      orderBy: [{ decision: 'asc' }, { createdAt: 'desc' }],
      include: {
        reporter: { select: { id: true, displayName: true, primaryRole: true } },
        lesson: { select: { id: true, title: true } },
        activity: { select: { id: true, title: true, type: true } },
        _count: { select: { reviews: true } },
      },
    }),
    prisma.contentReport.count({ where }),
  ]);

  return { items, totalItems };
}

/** Anyone who can see content can report it — including a learner. */
export async function createContentReport(
  context: ActorContext,
  schoolId: string,
  input: CreateReportInput,
) {
  if (input.lessonId) await requireLesson(schoolId, input.lessonId);
  if (input.activityId) await requireActivity(schoolId, input.activityId);

  const report = await prisma.contentReport.create({
    data: {
      schoolId,
      reporterId: context.actor.userId,
      lessonId: input.lessonId,
      activityId: input.activityId,
      targetType: input.targetType,
      targetId: input.targetId?.slice(0, 32),
      reason: input.reason,
      details: input.details,
    },
  });

  recordAudit(context, {
    action: 'content.report.create',
    targetType: 'ContentReport',
    targetId: report.id,
    schoolId,
    summary: `Reported content: ${report.reason}.`,
    afterData: report,
  });

  return report;
}

export async function getContentReport(schoolId: string, id: string, restrictToReporterId?: string) {
  const report = await prisma.contentReport.findFirst({
    where: { id, schoolId, ...(restrictToReporterId ? { reporterId: restrictToReporterId } : {}) },
    include: {
      reporter: { select: { id: true, displayName: true, primaryRole: true } },
      lesson: { select: { id: true, title: true } },
      activity: { select: { id: true, title: true, type: true } },
      reviews: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!report) throw notFound('Content report');
  return report;
}

/**
 * Closes a report with a decision and writes the matching moderation review, so
 * blueprint 05's "every flag gets an owner and an outcome" is satisfied by data
 * rather than by convention.
 */
export async function resolveContentReport(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: ResolveReportInput,
) {
  const existing = await prisma.contentReport.findFirst({ where: { id, schoolId } });
  if (!existing) throw notFound('Content report');
  if (existing.decision !== ModerationDecision.PENDING && existing.decision !== ModerationDecision.ESCALATED) {
    throw conflict('That report has already been resolved.');
  }

  const now = new Date();
  const report = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentReport.update({
      where: { id },
      data: {
        decision: input.decision,
        resolutionNotes: input.resolutionNotes,
        resolvedById: shortId(context.actor.userId),
        resolvedAt: input.decision === ModerationDecision.ESCALATED ? null : now,
      },
    });

    await tx.contentModerationReview.create({
      data: {
        reportId: id,
        targetType: resolveReportTargetType(updated),
        targetId: (updated.activityId ?? updated.lessonId ?? updated.targetId ?? id).slice(0, 32),
        reviewerId: context.actor.userId,
        decision: input.decision,
        notes: input.resolutionNotes,
        escalatedToId: input.escalatedToId?.slice(0, 32),
        resolvedAt: input.decision === ModerationDecision.ESCALATED ? null : now,
      },
    });

    // A removal decision takes the content out of circulation immediately.
    if (input.decision === ModerationDecision.REMOVED) {
      if (updated.activityId) {
        await tx.activity.update({
          where: { id: updated.activityId },
          data: { status: ContentStatus.ARCHIVED, archivedAt: now },
        });
        await tx.contentPublication.updateMany({
          where: { activityId: updated.activityId, retiredAt: null },
          data: { retiredAt: now },
        });
      }
      if (updated.lessonId) {
        await tx.lesson.update({
          where: { id: updated.lessonId },
          data: { status: ContentStatus.ARCHIVED, archivedAt: now },
        });
        await tx.contentPublication.updateMany({
          where: { lessonId: updated.lessonId, retiredAt: null },
          data: { retiredAt: now },
        });
      }
    }

    return updated;
  });

  recordAudit(context, {
    action: 'content.report.resolve',
    targetType: 'ContentReport',
    targetId: report.id,
    schoolId,
    summary: `Resolved content report as ${report.decision}.`,
    reason: input.resolutionNotes,
    beforeData: { decision: existing.decision },
    afterData: { decision: report.decision },
  });

  return report;
}

export async function listModerationReviews(schoolId: string, query: ModerationReviewListQuery) {
  const { skip, take } = toSkipTake(query);
  // Reviews have no tenant column of their own; they are reached through the
  // report that owns them, or through a target inside this school.
  const where: Prisma.ContentModerationReviewWhereInput = {
    ...(query.reportId ? { reportId: query.reportId } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    OR: [{ report: { schoolId } }, { reviewer: { schoolId } }],
  };

  const [items, totalItems] = await Promise.all([
    prisma.contentModerationReview.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: { select: { id: true, displayName: true, primaryRole: true } },
        report: { select: { id: true, reason: true, decision: true } },
      },
    }),
    prisma.contentModerationReview.count({ where }),
  ]);

  return { items, totalItems };
}

export async function createModerationReview(
  context: ActorContext,
  schoolId: string,
  input: CreateReviewInput,
) {
  if (input.reportId) {
    const report = await prisma.contentReport.findFirst({
      where: { id: input.reportId, schoolId },
      select: { id: true },
    });
    if (!report) throw notFound('Content report');
  }
  await assertOwnershipTargetExists(schoolId, input.targetType, input.targetId);

  const review = await prisma.contentModerationReview.create({
    data: {
      reportId: input.reportId,
      targetType: input.targetType,
      targetId: input.targetId.slice(0, 32),
      reviewerId: context.actor.userId,
      decision: input.decision,
      notes: input.notes,
      escalatedToId: input.escalatedToId?.slice(0, 32),
      resolvedAt: input.decision === ModerationDecision.PENDING ? null : new Date(),
    },
  });

  recordAudit(context, {
    action: 'content.report.resolve',
    targetType: 'ContentModerationReview',
    targetId: review.id,
    schoolId,
    summary: `Recorded a ${review.decision} review on ${review.targetType} ${review.targetId}.`,
    afterData: review,
  });

  return review;
}
