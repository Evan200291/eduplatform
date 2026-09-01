// ─────────────────────────────────────────────────────────────────────────────
// Teacher override and evaluation history
// Blueprint 04: "The teacher remains the decision maker." A marked response can be
// corrected — a short-text answer the marker did not recognise, a question that
// turned out to be ambiguous — and the correction is attributable and reasoned.
//
// An override never edits the response in place and walks away: the attempt's
// totals are recomputed with the same arithmetic a fresh submission uses, and the
// inference drawn from that attempt is regenerated, so the mastery picture matches
// the evidence as it now stands.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { AttemptStatus, EvidenceSource } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { attemptScope, percentOf, shortId } from './assessment.helpers';
import { recomputeAttemptTotals } from './assessment.scoring';
import { recordAttemptEvidence } from './assessment.evaluation.service';
import type { EvaluationListQuery } from './assessment.validation';

const RESPONSE_CONTEXT = {
  id: true,
  attemptId: true,
  questionId: true,
  activityId: true,
  isCorrect: true,
  pointsAwarded: true,
  pointsPossible: true,
  teacherOverridden: true,
  attempt: {
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      assessmentId: true,
      status: true,
      isPractice: true,
      attemptNumber: true,
      assessment: {
        select: {
          id: true,
          title: true,
          kind: true,
          subjectId: true,
          topicId: true,
          passThreshold: true,
          adaptiveEnabled: true,
          startingBand: true,
          driveRecommendations: true,
        },
      },
    },
  },
} satisfies Prisma.StudentResponseSelect;

export interface OverrideInput {
  isCorrect: boolean;
  pointsAwarded?: number;
  note: string;
}

/**
 * Re-marks one response by hand. `pointsAwarded` is optional: omitting it awards
 * full marks on a correct override and none on an incorrect one, which is what a
 * teacher means most of the time.
 */
export async function overrideResponse(
  context: ActorContext,
  schoolId: string,
  responseId: string,
  input: OverrideInput,
) {
  const response = await prisma.studentResponse.findFirst({
    where: { id: responseId, schoolId: shortId(schoolId) },
    select: RESPONSE_CONTEXT,
  });
  if (!response) throw notFound('Student response');

  const pointsPossible = Number(response.pointsPossible);
  const pointsAwarded =
    input.pointsAwarded ?? (input.isCorrect ? pointsPossible : 0);

  const before = {
    isCorrect: response.isCorrect,
    pointsAwarded: Number(response.pointsAwarded),
  };

  const now = new Date();
  await prisma.studentResponse.update({
    where: { id: response.id },
    data: {
      isCorrect: input.isCorrect,
      pointsAwarded: Math.min(pointsAwarded, pointsPossible),
      teacherOverridden: true,
      teacherOverrideNote: input.note.slice(0, 500),
      overriddenById: shortId(context.actor.userId),
      overriddenAt: now,
    },
  });

  const attempt = response.attempt;
  const totals = await recomputeAttemptTotals(
    attempt.id,
    attempt.assessment,
    attempt.assessmentId,
  );

  // Only a finished, graded attempt carries inference. Re-marking an answer inside
  // an attempt still in progress simply corrects the evidence; the evaluation is
  // written when the learner submits.
  if (attempt.status === AttemptStatus.COMPLETED && !attempt.isPractice) {
    await recordAttemptEvidence(
      context,
      {
        id: attempt.id,
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        assessmentId: attempt.assessmentId,
        isPractice: attempt.isPractice,
        assessment: {
          id: attempt.assessment.id,
          kind: attempt.assessment.kind,
          subjectId: attempt.assessment.subjectId,
          topicId: attempt.assessment.topicId,
          passThreshold: attempt.assessment.passThreshold,
          driveRecommendations: attempt.assessment.driveRecommendations,
        },
      },
      totals,
    );
  }

  recordAudit(context, {
    action: 'assessment.response.override',
    targetType: 'StudentResponse',
    targetId: response.id,
    schoolId,
    summary:
      `Re-marked a response on attempt ${attempt.attemptNumber} of "${attempt.assessment.title}" ` +
      `as ${input.isCorrect ? 'correct' : 'incorrect'}.`,
    reason: input.note,
    beforeData: before,
    afterData: { isCorrect: input.isCorrect, pointsAwarded, attemptPercent: totals.scorePercent },
  });

  return {
    responseId: response.id,
    isCorrect: input.isCorrect,
    pointsAwarded: Math.min(pointsAwarded, pointsPossible),
    pointsPossible,
    attempt: {
      id: attempt.id,
      scorePercent: totals.scorePercent,
      itemsCorrect: totals.itemsCorrect,
      itemsPresented: totals.itemsPresented,
      highestBandPassed: totals.highestBandPassed,
    },
  };
}

// ── Evaluation history ──────────────────────────────────────────────────────

/**
 * The inference trail. Superseded rows are hidden by default but never deleted:
 * blueprint 12 wants the history of what was believed and why, so a teacher can see
 * that a learner's position moved rather than only where it now sits.
 */
export async function listTopicEvaluations(
  actor: AuthenticatedActor,
  schoolId: string,
  query: EvaluationListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const scope = attemptScope(actor);
  const isStaff = scope.restrictToStudentId === undefined;

  const where: Prisma.TopicEvaluationWhereInput = {
    schoolId,
    ...(scope.restrictToStudentId ? { studentId: scope.restrictToStudentId } : {}),
    ...(query.studentId && isStaff ? { studentId: query.studentId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.subjectId ? { topic: { subjectId: query.subjectId } } : {}),
    ...(query.attemptId ? { attemptId: query.attemptId } : {}),
    ...(query.band ? { band: query.band } : {}),
    ...(query.masteryLevel ? { masteryLevel: query.masteryLevel } : {}),
    ...(query.evidenceSource ? { evidenceSource: query.evidenceSource } : {}),
    ...(query.confidence ? { confidence: query.confidence } : {}),
    ...(query.includeSuperseded ? {} : { supersededAt: null }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.topicEvaluation.findMany({
      where,
      skip,
      take,
      orderBy: [{ evaluatedAt: 'desc' }],
      select: {
        id: true,
        studentId: true,
        topicId: true,
        attemptId: true,
        band: true,
        masteryLevel: true,
        accuracyPercent: true,
        itemsConsidered: true,
        evidenceSource: true,
        confidence: true,
        notes: true,
        evaluatedAt: true,
        supersededAt: true,
        topic: { select: { id: true, name: true, key: true, subjectId: true, masteryThreshold: true } },
        student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
    }),
    prisma.topicEvaluation.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * The current mastery picture for one learner, topic rows and objective rows
 * together. Blueprint 12 attributes mastery to an objective, so the objective rows
 * are the useful ones for a teacher deciding what to reteach.
 */
export async function getStudentMastery(
  actor: AuthenticatedActor,
  schoolId: string,
  studentId: string,
  subjectId?: string,
) {
  const scope = attemptScope(actor);
  const targetId = scope.restrictToStudentId ?? studentId;

  const rows = await prisma.masteryRecord.findMany({
    where: {
      schoolId,
      studentId: targetId,
      ...(subjectId ? { subjectId } : {}),
    },
    orderBy: [{ lastEvidenceAt: 'desc' }],
    select: {
      id: true,
      subjectId: true,
      topicId: true,
      objectiveId: true,
      level: true,
      band: true,
      scorePercent: true,
      evidenceSource: true,
      confidence: true,
      evidenceCount: true,
      teacherOverride: true,
      overrideNote: true,
      firstEvidenceAt: true,
      lastEvidenceAt: true,
      masteredAt: true,
      reviewDueAt: true,
      topic: { select: { id: true, name: true, key: true, masteryThreshold: true } },
      objective: { select: { id: true, code: true, statement: true } },
    },
  });

  return {
    studentId: targetId,
    topics: rows.filter((row) => row.objectiveId === null),
    objectives: rows.filter((row) => row.objectiveId !== null),
    summary: {
      totalTracked: rows.length,
      teacherOverridden: rows.filter((row) => row.teacherOverride).length,
      fromSystemEvidence: rows.filter((row) => row.evidenceSource === EvidenceSource.SYSTEM_ASSESSMENT)
        .length,
      dueForReview: rows.filter(
        (row) => row.reviewDueAt !== null && row.reviewDueAt.getTime() <= Date.now(),
      ).length,
      averagePercent: rows.length
        ? percentOf(
            rows.reduce((total, row) => total + (row.scorePercent ?? 0), 0),
            rows.length * 100,
          )
        : 0,
    },
  };
}
