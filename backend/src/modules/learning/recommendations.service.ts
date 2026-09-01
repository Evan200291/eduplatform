// ─────────────────────────────────────────────────────────────────────────────
// Recommendation queue and decisions
// Blueprint 04: "The system proposes. The teacher decides." This file owns the
// teacher's side of that sentence — the queue, the four decisions, and the act of
// writing an approved proposal into the learner's path.
//
// Proposals are created by the assessment module (assessment.recommendations.ts)
// from evidence. A teacher may also raise one by hand, which is recorded with
// origin TEACHER_REQUEST so the two are never confused later.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  EvidenceSource,
  PathItemStatus,
  RecommendationOrigin,
  RecommendationStatus,
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { logger } from '../../core/logger';
import { conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import {
  nextSortOrder,
  pathScope,
  requireStudent,
  requireSubject,
  resolveUnlockable,
} from './learning.helpers';
import type { DecideRecommendationInput, RecommendationListQuery } from './learning.validation';

const log = logger.child({ module: 'recommendations' });

const RECOMMENDATION_SELECT = {
  id: true,
  studentId: true,
  subjectId: true,
  topicId: true,
  pathId: true,
  assessmentId: true,
  attemptId: true,
  origin: true,
  status: true,
  rationale: true,
  proposal: true,
  appliedChange: true,
  priority: true,
  evidenceSource: true,
  confidence: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  autoApproveAt: true,
  expiresAt: true,
  createdAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  subject: { select: { id: true, name: true, key: true } },
  topic: { select: { id: true, name: true, key: true } },
} satisfies Prisma.RecommendationSelect;

const OPEN_STATUSES: RecommendationStatus[] = [
  RecommendationStatus.PENDING_APPROVAL,
  RecommendationStatus.DEFERRED,
];

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listRecommendations(
  actor: AuthenticatedActor,
  schoolId: string,
  query: RecommendationListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const scope = pathScope(actor);
  const staff = scope.restrictToStudentId === undefined;

  const where: Prisma.RecommendationWhereInput = {
    schoolId,
    ...(scope.restrictToStudentId ? { studentId: scope.restrictToStudentId } : {}),
    ...(query.studentId && staff ? { studentId: query.studentId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.pendingOnly ? { status: { in: OPEN_STATUSES } } : {}),
    ...(query.origin ? { origin: query.origin } : {}),
    ...(query.evidenceSource ? { evidenceSource: query.evidenceSource } : {}),
    ...(query.confidence ? { confidence: query.confidence } : {}),
    ...(query.minPriority !== undefined ? { priority: { gte: query.minPriority } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.recommendation.findMany({
      where,
      skip,
      take,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      select: RECOMMENDATION_SELECT,
    }),
    prisma.recommendation.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getRecommendation(
  actor: AuthenticatedActor,
  schoolId: string,
  id: string,
) {
  const scope = pathScope(actor);
  const recommendation = await prisma.recommendation.findFirst({
    where: { id, schoolId, ...(scope.restrictToStudentId ? { studentId: scope.restrictToStudentId } : {}) },
    select: RECOMMENDATION_SELECT,
  });
  if (!recommendation) throw notFound('Recommendation');
  return recommendation;
}

/** The teacher's queue with the counts a dashboard card needs. */
export async function getQueueSummary(schoolId: string) {
  const [pending, deferred, overdueAutoApprove, byPriority] = await Promise.all([
    prisma.recommendation.count({ where: { schoolId, status: RecommendationStatus.PENDING_APPROVAL } }),
    prisma.recommendation.count({ where: { schoolId, status: RecommendationStatus.DEFERRED } }),
    prisma.recommendation.count({
      where: {
        schoolId,
        status: RecommendationStatus.PENDING_APPROVAL,
        autoApproveAt: { lte: new Date() },
      },
    }),
    prisma.recommendation.groupBy({
      by: ['origin'],
      where: { schoolId, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
  ]);

  return {
    pending,
    deferred,
    dueForAutoApproval: overdueAutoApprove,
    byOrigin: byPriority.map((row) => ({ origin: row.origin, count: row._count._all })),
  };
}

// ── Deciding ────────────────────────────────────────────────────────────────

/**
 * Records the teacher's decision. APPROVE and MODIFY may write the proposal into
 * the learner's active path; REJECT and DEFER never touch it. Whichever it is, the
 * decision itself is the record — who, when, and why.
 */
export async function decideRecommendation(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: DecideRecommendationInput,
) {
  const existing = await prisma.recommendation.findFirst({
    where: { id, schoolId },
    select: { id: true, status: true, studentId: true, subjectId: true, proposal: true, origin: true },
  });
  if (!existing) throw notFound('Recommendation');
  if (!OPEN_STATUSES.includes(existing.status)) {
    throw conflict('That recommendation has already been decided.', {
      details: { status: existing.status },
    });
  }

  const now = new Date();
  const status = {
    APPROVE: RecommendationStatus.APPROVED,
    MODIFY: RecommendationStatus.MODIFIED,
    REJECT: RecommendationStatus.REJECTED,
    DEFER: RecommendationStatus.DEFERRED,
  }[input.decision];

  const updated = await prisma.recommendation.update({
    where: { id },
    data: {
      status,
      decidedById: context.actor.userId,
      decidedAt: now,
      decisionNote: input.note ?? null,
      appliedChange: (input.appliedChange as Prisma.InputJsonValue | undefined) ?? undefined,
      // A deferred proposal comes back rather than disappearing.
      autoApproveAt: input.decision === 'DEFER' ? (input.deferUntil ?? null) : null,
    },
    select: RECOMMENDATION_SELECT,
  });

  let applied: { pathId: string; stepsAdded: number; stepsSkipped: number } | null = null;
  const shouldApply =
    input.applyToPath && (input.decision === 'APPROVE' || input.decision === 'MODIFY');

  if (shouldApply && existing.subjectId) {
    applied = await applyProposalToPath(
      schoolId,
      existing.studentId,
      existing.subjectId,
      (input.appliedChange as Prisma.JsonValue | undefined) ?? existing.proposal,
    );
    if (applied) {
      await prisma.recommendation.update({
        where: { id },
        data: { pathId: applied.pathId },
      });
    }
  }

  recordAudit(context, {
    action: 'recommendation.decide',
    targetType: 'Recommendation',
    targetId: id,
    schoolId,
    summary: `${input.decision} on a ${existing.origin} recommendation.`,
    reason: input.note ?? null,
    beforeData: { status: existing.status },
    afterData: { status, applied },
  });

  return { ...updated, applied };
}

/**
 * Writes an approved proposal into the learner's active path: practice topics become
 * new steps, mastered topics are skipped rather than deleted so the record shows the
 * learner passed them rather than that they were never planned.
 *
 * Returns null when the learner has no active path — approving a proposal is not the
 * same as creating a plan, and silently inventing one would hide that from the
 * teacher.
 */
export async function applyProposalToPath(
  schoolId: string,
  studentId: string,
  subjectId: string,
  proposal: Prisma.JsonValue,
): Promise<{ pathId: string; stepsAdded: number; stepsSkipped: number } | null> {
  const path = await prisma.learningPath.findFirst({
    where: { schoolId, studentId, subjectId, isActive: true, archivedAt: null },
    select: { id: true },
  });
  if (!path) return null;

  const bag = typeof proposal === 'object' && proposal !== null ? (proposal as Record<string, unknown>) : {};
  const practise = topicIdsFrom(bag.practise);
  const advance = topicIdsFrom(bag.advance);

  const existing = await prisma.learningPathItem.findMany({
    where: { pathId: path.id, topicId: { in: [...practise, ...advance] } },
    select: { id: true, topicId: true, status: true, removedAt: true },
  });
  const byTopic = new Map(existing.map((row) => [row.topicId, row]));

  const missing = practise.filter((topicId) => !byTopic.has(topicId));
  const { available } = await resolveUnlockable(studentId, missing);

  let stepsAdded = 0;
  let order = await nextSortOrder(path.id);
  const now = new Date();

  for (const topicId of missing) {
    await prisma.learningPathItem.create({
      data: {
        pathId: path.id,
        topicId,
        sortOrder: order,
        status: available.has(topicId) ? PathItemStatus.AVAILABLE : PathItemStatus.LOCKED,
        isRequired: true,
        reason: 'Added from an approved recommendation.',
        unlockedAt: available.has(topicId) ? now : null,
      },
    });
    order += 1;
    stepsAdded += 1;
  }

  // A practice topic already on the path but locked is opened, since the teacher has
  // just agreed the learner should work on it.
  const relock = practise
    .map((topicId) => byTopic.get(topicId))
    .filter(
      (row): row is (typeof existing)[number] =>
        row !== undefined && row.removedAt === null && row.status === PathItemStatus.LOCKED,
    );
  if (relock.length > 0) {
    await prisma.learningPathItem.updateMany({
      where: { id: { in: relock.map((row) => row.id) } },
      data: { status: PathItemStatus.AVAILABLE, unlockedAt: now },
    });
  }

  const skippable = advance
    .map((topicId) => byTopic.get(topicId))
    .filter(
      (row): row is (typeof existing)[number] =>
        row !== undefined &&
        row.removedAt === null &&
        row.status !== PathItemStatus.COMPLETED &&
        row.status !== PathItemStatus.SKIPPED,
    );

  let stepsSkipped = 0;
  if (skippable.length > 0) {
    const result = await prisma.learningPathItem.updateMany({
      where: { id: { in: skippable.map((row) => row.id) } },
      data: {
        status: PathItemStatus.SKIPPED,
        reason: 'Skipped: evidence shows this topic is already secure.',
        completedAt: now,
      },
    });
    stepsSkipped = result.count;
  }

  return { pathId: path.id, stepsAdded, stepsSkipped };
}

function topicIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      ids.push(entry);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const topicId = (entry as Record<string, unknown>).topicId;
      if (typeof topicId === 'string' && topicId.length > 0) ids.push(topicId);
    }
  }
  return [...new Set(ids)];
}

// ── Teacher-raised proposals ────────────────────────────────────────────────

/**
 * A teacher raising a change themselves. Recorded as TEACHER_JUDGMENT evidence with
 * origin TEACHER_REQUEST so a later audit can tell a professional judgment apart
 * from a system inference.
 */
export async function createRecommendation(
  context: ActorContext,
  schoolId: string,
  input: {
    studentId: string;
    subjectId?: string;
    topicId?: string;
    rationale: string;
    proposal: Record<string, unknown>;
    priority: number;
  },
) {
  await requireStudent(schoolId, input.studentId);
  if (input.subjectId) await requireSubject(schoolId, input.subjectId);

  const recommendation = await prisma.recommendation.create({
    data: {
      schoolId,
      studentId: input.studentId,
      subjectId: input.subjectId ?? null,
      topicId: input.topicId ?? null,
      origin: RecommendationOrigin.TEACHER_REQUEST,
      status: RecommendationStatus.PENDING_APPROVAL,
      rationale: input.rationale,
      proposal: input.proposal as Prisma.InputJsonValue,
      priority: input.priority,
      evidenceSource: EvidenceSource.TEACHER_JUDGMENT,
    },
    select: RECOMMENDATION_SELECT,
  });

  recordAudit(context, {
    action: 'recommendation.create',
    targetType: 'Recommendation',
    targetId: recommendation.id,
    schoolId,
    summary: 'A teacher raised a learning-path recommendation.',
    afterData: { priority: input.priority },
  });

  return recommendation;
}

// ── Scheduled work ──────────────────────────────────────────────────────────

/**
 * Blueprint 04: a school may set a deadline after which an unreviewed proposal
 * approves itself, so a busy term does not silently stall every learner's path. The
 * result is AUTO_APPROVED rather than APPROVED — the distinction matters when someone
 * later asks who agreed to this.
 *
 * Runs on a schedule; returns how many proposals it moved.
 */
export async function autoApproveDueRecommendations(): Promise<number> {
  const now = new Date();

  const due = await prisma.recommendation.findMany({
    where: {
      status: RecommendationStatus.PENDING_APPROVAL,
      autoApproveAt: { not: null, lte: now },
    },
    take: 200,
    select: { id: true, schoolId: true, studentId: true, subjectId: true, proposal: true },
  });

  let moved = 0;
  for (const row of due) {
    try {
      await prisma.recommendation.update({
        where: { id: row.id },
        data: {
          status: RecommendationStatus.AUTO_APPROVED,
          decidedAt: now,
          decisionNote:
            'Auto-approved: no teacher decision was recorded before the school’s review deadline.',
        },
      });

      if (row.subjectId) {
        const applied = await applyProposalToPath(
          row.schoolId,
          row.studentId,
          row.subjectId,
          row.proposal,
        );
        if (applied) {
          await prisma.recommendation.update({
            where: { id: row.id },
            data: { pathId: applied.pathId },
          });
        }
      }

      recordAudit(null, {
        action: 'recommendation.decide',
        targetType: 'Recommendation',
        targetId: row.id,
        schoolId: row.schoolId,
        summary: 'Auto-approved after the review deadline passed.',
        afterData: { status: RecommendationStatus.AUTO_APPROVED },
      });

      moved += 1;
    } catch (error) {
      log.error({ err: error, recommendationId: row.id }, 'failed to auto-approve recommendation');
    }
  }

  // Proposals nobody acted on before they expired stop cluttering the queue.
  const expired = await prisma.recommendation.updateMany({
    where: {
      status: { in: OPEN_STATUSES },
      expiresAt: { not: null, lte: now },
      autoApproveAt: null,
    },
    data: { status: RecommendationStatus.SUPERSEDED, decidedAt: now },
  });

  return moved + expired.count;
}
