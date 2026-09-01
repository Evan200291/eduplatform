// ─────────────────────────────────────────────────────────────────────────────
// Assessment attempts — the delivery path
// Blueprint 03: the learner sees one item at a time, the band steps up on success
// and down on failure, and the placement is decided from the evidence rather than
// from a self-declared level.
//
// Two rules are load-bearing here and are enforced in this file, not on the route:
//   1. An answer key never leaves the server. `presentQuestion` strips it, and the
//      marking result is only returned when the assessment opts into immediate
//      feedback.
//   2. A response is pinned to the exact `ActivityVersion` it was answered
//      against (blueprint 12), so editing the question later cannot change a mark
//      that has already been awarded.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { AttemptStatus } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import {
  assertAttemptOpen,
  attemptScope,
  effectiveMaxAttempts,
  percentOf,
  readAssessmentEngineSettings,
  requireAssessment,
  requireAttempt,
  resolveAttemptStudent,
  shortId,
  assertAttemptAllowed,
} from './assessment.helpers';
import {
  findSnapshotQuestion,
  markResponse,
  parseActivitySnapshot,
  presentQuestion,
} from './assessment.marking';
import {
  loadItems,
  loadPublishedVersion,
  loadResponseFacts,
  recomputeAttemptTotals,
  rollupByActivity,
  selectNextItem,
  walkCurrentBand,
} from './assessment.scoring';
import { recordAttemptEvidence } from './assessment.evaluation.service';
import type {
  AttemptListQuery,
  ResponseListQuery,
  SubmitResponseInput,
} from './assessment.validation';

const ATTEMPT_LIST_SELECT = {
  id: true,
  assessmentId: true,
  studentId: true,
  attemptNumber: true,
  status: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  expiresAt: true,
  scorePercent: true,
  itemsPresented: true,
  itemsCorrect: true,
  timeSpentSeconds: true,
  highestBandPassed: true,
  outcomeSummary: true,
  isPractice: true,
  assessment: {
    select: { id: true, title: true, key: true, kind: true, subjectId: true, topicId: true },
  },
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
} satisfies Prisma.AssessmentAttemptSelect;

/**
 * The learner never sees `outcomeSummary` — the schema calls it teacher-facing, and
 * blueprint 06 keeps placement language out of the learner's view entirely.
 */
function forAudience<T extends { outcomeSummary: string | null }>(row: T, isStaff: boolean): T {
  return isStaff ? row : { ...row, outcomeSummary: null };
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listAttempts(
  actor: AuthenticatedActor,
  schoolId: string,
  query: AttemptListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const scope = attemptScope(actor);
  const isStaff = scope.restrictToStudentId === undefined;

  const where: Prisma.AssessmentAttemptWhereInput = {
    schoolId,
    ...(scope.restrictToStudentId ? { studentId: scope.restrictToStudentId } : {}),
    ...(query.assessmentId ? { assessmentId: query.assessmentId } : {}),
    ...(query.studentId && isStaff ? { studentId: query.studentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { assessment: { kind: query.kind } } : {}),
    ...(query.includePractice ? {} : { isPractice: false }),
    ...(query.completedFrom || query.completedTo
      ? {
          completedAt: {
            ...(query.completedFrom ? { gte: query.completedFrom } : {}),
            ...(query.completedTo ? { lte: query.completedTo } : {}),
          },
        }
      : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.assessmentAttempt.findMany({
      where,
      skip,
      take,
      orderBy: [{ startedAt: 'desc' }],
      select: ATTEMPT_LIST_SELECT,
    }),
    prisma.assessmentAttempt.count({ where }),
  ]);

  return { items: rows.map((row) => forAudience(row, isStaff)), totalItems };
}

export async function getAttempt(actor: AuthenticatedActor, schoolId: string, id: string) {
  const scope = attemptScope(actor);
  const isStaff = scope.restrictToStudentId === undefined;
  const attempt = await requireAttempt(schoolId, id, scope.restrictToStudentId);

  const [items, facts] = await Promise.all([
    loadItems(attempt.assessmentId),
    loadResponseFacts(attempt.id),
  ]);
  const answered = new Set(facts.map((fact) => fact.activityId));

  return {
    ...forAudience(attempt, isStaff),
    progress: {
      itemsTotal: attempt.assessment.itemTarget ?? items.length,
      itemsAnswered: answered.size,
      questionsAnswered: facts.length,
      currentBand: walkCurrentBand(attempt.assessment, rollupByActivity(facts)),
    },
  };
}

// ── Starting ────────────────────────────────────────────────────────────────

export async function startAttempt(
  context: ActorContext,
  schoolId: string,
  assessmentId: string,
  input: { studentId?: string; isPractice: boolean; deviceInfo?: string },
) {
  const assessment = await requireAssessment(schoolId, assessmentId);
  if (assessment.status !== 'PUBLISHED') {
    throw conflict('That assessment is not published yet.');
  }
  if (assessment.archivedAt) {
    throw conflict('That assessment has been archived.');
  }

  const studentId = await resolveAttemptStudent(context.actor, schoolId, input.studentId);

  const [student, engineSettings] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { ageMode: true } }),
    readAssessmentEngineSettings(schoolId),
  ]);
  const maxAttempts = effectiveMaxAttempts(
    assessment.maxAttempts,
    student?.ageMode ?? null,
    engineSettings.attemptLimitByAgeMode,
  );
  const attemptNumber = await assertAttemptAllowed(assessment, studentId, input.isPractice, maxAttempts);

  const items = await loadItems(assessmentId);
  if (items.length === 0) {
    throw conflict('That assessment has no items to present.');
  }

  const now = new Date();
  const expiresAt = assessment.timeLimitMinutes
    ? new Date(now.getTime() + assessment.timeLimitMinutes * 60_000)
    : null;

  // A single-item assessment can be pinned to its version on the attempt row. A
  // multi-item one cannot, because each item carries its own version — there the
  // pinning lives on every response instead.
  const singleItem = items.length === 1 ? items[0] : undefined;
  const pinnedVersion = singleItem ? await loadPublishedVersion(singleItem.activityId) : null;

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      schoolId,
      assessmentId,
      studentId,
      activityVersionId: pinnedVersion?.id ?? null,
      attemptNumber,
      status: AttemptStatus.IN_PROGRESS,
      startedAt: now,
      expiresAt,
      isPractice: input.isPractice,
      deviceInfo: input.deviceInfo ?? null,
    },
    select: ATTEMPT_LIST_SELECT,
  });

  recordAudit(context, {
    action: 'assessment.attempt.start',
    targetType: 'AssessmentAttempt',
    targetId: attempt.id,
    schoolId,
    summary: `Started attempt ${attemptNumber} on "${assessment.title}".`,
    afterData: { studentId, isPractice: input.isPractice, itemsAvailable: items.length },
  });

  return attempt;
}

// ── Delivery ────────────────────────────────────────────────────────────────

/**
 * Returns the next item, already stripped of its answer key. The adaptive position
 * is replayed from the stored responses rather than held in a cursor column, so a
 * refresh or a resumed session lands on the same item.
 */
export async function getNextItem(actor: AuthenticatedActor, schoolId: string, attemptId: string) {
  const scope = attemptScope(actor);
  const attempt = await requireAttempt(schoolId, attemptId, scope.restrictToStudentId);
  assertAttemptOpen(attempt);

  const [items, facts] = await Promise.all([
    loadItems(attempt.assessmentId),
    loadResponseFacts(attempt.id),
  ]);

  const answered = new Set(facts.map((fact) => fact.activityId));
  const band = walkCurrentBand(attempt.assessment, rollupByActivity(facts));

  const target = attempt.assessment.itemTarget ?? items.length;
  if (answered.size >= Math.min(target, items.length)) {
    return { done: true as const, itemsAnswered: answered.size, itemsTotal: target, currentBand: band };
  }

  const next = selectNextItem(items, answered, band, {
    adaptiveEnabled: attempt.assessment.adaptiveEnabled,
    shuffleItems: attempt.assessment.shuffleItems,
    seed: `${attempt.id}:${attempt.studentId}`,
    isFirstItem: answered.size === 0,
  });

  if (!next) {
    return { done: true as const, itemsAnswered: answered.size, itemsTotal: target, currentBand: band };
  }

  const version = await loadPublishedVersion(next.activityId);
  const snapshot = parseActivitySnapshot(version.snapshot);

  const questions = [...snapshot.questions]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((question) => presentQuestion(question));

  return {
    done: false as const,
    itemsAnswered: answered.size,
    itemsTotal: target,
    currentBand: band,
    item: {
      itemId: next.itemId,
      activityId: next.activityId,
      activityVersionId: version.id,
      version: version.version,
      difficultyBand: next.difficultyBand,
      title: snapshot.title,
      type: snapshot.type,
      instructions: snapshot.instructions,
      config: snapshot.config,
      estimatedMinutes: snapshot.estimatedMinutes,
      ageMode: snapshot.ageMode,
      questions,
    },
  };
}

// ── Answering ───────────────────────────────────────────────────────────────

interface MarkedRow {
  questionId: string;
  activityId: string;
  activityVersionId: string;
  isCorrect: boolean;
  pointsAwarded: number;
  pointsPossible: number;
  difficultyBand: Prisma.StudentResponseCreateManyInput['difficultyBand'];
  feedback: string | null;
}

/**
 * Marks one answer and stores it. Blueprint 12: "immutable once marked" — a second
 * answer to the same question in the same attempt is refused rather than silently
 * replacing the evidence. A retry is a new attempt, which is what `maxAttempts` and
 * `cooldownDays` govern.
 */
export async function recordResponse(
  context: ActorContext,
  schoolId: string,
  attemptId: string,
  input: SubmitResponseInput,
) {
  const scope = attemptScope(context.actor);
  const attempt = await requireAttempt(schoolId, attemptId, scope.restrictToStudentId);
  assertAttemptOpen(attempt);

  const marked = await markOne(attempt, input);

  await prisma.studentResponse.create({
    data: {
      attemptId: attempt.id,
      schoolId: shortId(schoolId),
      studentId: shortId(attempt.studentId),
      questionId: marked.questionId,
      activityId: marked.activityId,
      activityVersionId: marked.activityVersionId,
      response: input.response,
      isCorrect: marked.isCorrect,
      pointsAwarded: marked.pointsAwarded,
      pointsPossible: marked.pointsPossible,
      hintsUsed: input.hintsUsed,
      attemptsUsed: input.attemptsUsed,
      timeSpentSeconds: input.timeSpentSeconds,
      difficultyBand: marked.difficultyBand,
    },
    select: { id: true },
  });

  await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { timeSpentSeconds: { increment: input.timeSpentSeconds } },
  });

  // Blueprint 06: feedback is immediate only where the assessment says so. A
  // screening run withholds it, so the learner is not told "you got that wrong"
  // item after item while their level is being established.
  if (!attempt.assessment.showFeedbackImmediately) {
    return { recorded: true as const, questionId: marked.questionId };
  }

  return {
    recorded: true as const,
    questionId: marked.questionId,
    isCorrect: marked.isCorrect,
    pointsAwarded: marked.pointsAwarded,
    pointsPossible: marked.pointsPossible,
    feedback: marked.feedback,
  };
}

/**
 * Resolves the question to its assessment item, loads the published version and
 * marks against that snapshot. Shared by the single-answer and batched-submit
 * paths so both mark identically.
 */
async function markOne(
  attempt: Awaited<ReturnType<typeof requireAttempt>>,
  input: SubmitResponseInput,
): Promise<MarkedRow> {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, activity: { schoolId: attempt.schoolId } },
    select: { id: true, activityId: true },
  });
  if (!question) throw notFound('Question');

  const item = await prisma.assessmentItem.findFirst({
    where: { assessmentId: attempt.assessmentId, activityId: question.activityId },
    select: { id: true, difficultyBand: true },
  });
  if (!item) {
    throw badRequest('That question is not part of this assessment.');
  }

  const existing = await prisma.studentResponse.findFirst({
    where: { attemptId: attempt.id, questionId: question.id },
    select: { id: true },
  });
  if (existing) {
    throw conflict('You have already answered that question in this attempt.', {
      details: { questionId: question.id },
    });
  }

  const version = await loadPublishedVersion(question.activityId);
  const snapshot = parseActivitySnapshot(version.snapshot);
  const snapshotQuestion = findSnapshotQuestion(snapshot, question.id);
  const result = markResponse(snapshotQuestion, input.response, input.hintsUsed);

  return {
    questionId: question.id,
    activityId: question.activityId,
    activityVersionId: version.id,
    isCorrect: result.isCorrect,
    pointsAwarded: result.pointsAwarded,
    pointsPossible: result.pointsPossible,
    difficultyBand: item.difficultyBand,
    feedback: result.feedback,
  };
}

// ── Finishing ───────────────────────────────────────────────────────────────

/**
 * Submits the attempt. Any responses sent with the submission are marked first;
 * questions already answered are skipped rather than rejected, so a client that
 * resends a batch after a dropped connection does not lose the whole submission.
 */
export async function submitAttempt(
  context: ActorContext,
  schoolId: string,
  attemptId: string,
  input: { responses?: SubmitResponseInput[]; timeSpentSeconds?: number },
) {
  const scope = attemptScope(context.actor);
  const isStaff = scope.restrictToStudentId === undefined;
  const attempt = await requireAttempt(schoolId, attemptId, scope.restrictToStudentId);
  assertAttemptOpen(attempt);

  let skipped = 0;
  for (const response of input.responses ?? []) {
    const already = await prisma.studentResponse.findFirst({
      where: { attemptId: attempt.id, questionId: response.questionId },
      select: { id: true },
    });
    if (already) {
      skipped += 1;
      continue;
    }
    const marked = await markOne(attempt, response);
    await prisma.studentResponse.create({
      data: {
        attemptId: attempt.id,
        schoolId: shortId(schoolId),
        studentId: shortId(attempt.studentId),
        questionId: marked.questionId,
        activityId: marked.activityId,
        activityVersionId: marked.activityVersionId,
        response: response.response,
        isCorrect: marked.isCorrect,
        pointsAwarded: marked.pointsAwarded,
        pointsPossible: marked.pointsPossible,
        hintsUsed: response.hintsUsed,
        attemptsUsed: response.attemptsUsed,
        timeSpentSeconds: response.timeSpentSeconds,
        difficultyBand: marked.difficultyBand,
      },
      select: { id: true },
    });
  }

  const now = new Date();
  const totals = await recomputeAttemptTotals(attempt.id, attempt.assessment, attempt.assessmentId, {
    status: AttemptStatus.COMPLETED,
    submittedAt: now,
    completedAt: now,
    ...(input.timeSpentSeconds ? { timeSpentSeconds: { increment: input.timeSpentSeconds } } : {}),
  });

  const evidence = await recordAttemptEvidence(
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

  recordAudit(context, {
    action: 'assessment.attempt.submit',
    targetType: 'AssessmentAttempt',
    targetId: attempt.id,
    schoolId,
    summary: `Submitted attempt ${attempt.attemptNumber} on "${attempt.assessment.title}" — ${totals.scorePercent}%.`,
    afterData: {
      scorePercent: totals.scorePercent,
      highestBandPassed: totals.highestBandPassed,
      evaluations: evidence.evaluations,
      recommendations: evidence.recommendations,
    },
  });

  const passThreshold = attempt.assessment.passThreshold;

  return {
    attemptId: attempt.id,
    status: AttemptStatus.COMPLETED,
    scorePercent: totals.scorePercent,
    scoreRaw: totals.scoreRaw,
    scoreMax: totals.scoreMax,
    itemsPresented: totals.itemsPresented,
    itemsCorrect: totals.itemsCorrect,
    questionsAnswered: totals.questionsAnswered,
    passed: totals.scorePercent >= passThreshold,
    skippedAsDuplicate: skipped,
    // Placement language and per-band detail are for staff. Blueprint 06 keeps the
    // learner's view to effort and progress, not a level label.
    highestBandPassed: isStaff ? totals.highestBandPassed : null,
    bands: isStaff ? totals.bands : undefined,
    evidence: isStaff ? evidence : undefined,
  };
}

export async function abandonAttempt(
  context: ActorContext,
  schoolId: string,
  attemptId: string,
  input: { reason?: string },
) {
  const scope = attemptScope(context.actor);
  const attempt = await requireAttempt(schoolId, attemptId, scope.restrictToStudentId);
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw conflict('That attempt is already closed.', { details: { status: attempt.status } });
  }

  const expired = attempt.expiresAt !== null && attempt.expiresAt.getTime() <= Date.now();

  const updated = await prisma.assessmentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: expired ? AttemptStatus.EXPIRED : AttemptStatus.ABANDONED,
      completedAt: new Date(),
    },
    select: ATTEMPT_LIST_SELECT,
  });

  recordAudit(context, {
    action: 'assessment.attempt.submit',
    targetType: 'AssessmentAttempt',
    targetId: attempt.id,
    schoolId,
    summary: `Closed attempt ${attempt.attemptNumber} as ${updated.status}.`,
    reason: input.reason ?? null,
    beforeData: { status: attempt.status },
    afterData: { status: updated.status },
  });

  // Blueprint 12: an abandoned attempt leaves its responses in place as evidence
  // but draws no inference from them, so no evaluation or mastery row is written.
  return forAudience(updated, scope.restrictToStudentId === undefined);
}

// ── Responses on an attempt ─────────────────────────────────────────────────

/**
 * The evidence trail for one attempt. A learner may read their own answers back;
 * the answer key is not part of the row, so nothing has to be stripped here beyond
 * what the schema already excludes.
 */
export async function listAttemptResponses(
  actor: AuthenticatedActor,
  schoolId: string,
  attemptId: string,
  query: ResponseListQuery,
) {
  const scope = attemptScope(actor);
  const attempt = await requireAttempt(schoolId, attemptId, scope.restrictToStudentId);
  const { skip, take } = toSkipTake(query);

  const where: Prisma.StudentResponseWhereInput = {
    attemptId: attempt.id,
    ...(query.questionId ? { questionId: query.questionId } : {}),
    ...(query.activityId ? { activityId: query.activityId } : {}),
    ...(query.onlyIncorrect ? { isCorrect: false } : {}),
    ...(query.onlyOverridden ? { teacherOverridden: true } : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.studentResponse.findMany({
      where,
      skip,
      take,
      orderBy: [{ answeredAt: 'asc' }],
      select: {
        id: true,
        questionId: true,
        activityId: true,
        activityVersionId: true,
        response: true,
        isCorrect: true,
        pointsAwarded: true,
        pointsPossible: true,
        hintsUsed: true,
        attemptsUsed: true,
        timeSpentSeconds: true,
        difficultyBand: true,
        teacherOverridden: true,
        teacherOverrideNote: true,
        overriddenById: true,
        overriddenAt: true,
        answeredAt: true,
        question: { select: { id: true, prompt: true, type: true, sortOrder: true } },
      },
    }),
    prisma.studentResponse.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      pointsAwarded: Number(row.pointsAwarded),
      pointsPossible: Number(row.pointsPossible),
      scorePercent: percentOf(Number(row.pointsAwarded), Number(row.pointsPossible)),
    })),
    totalItems,
  };
}
