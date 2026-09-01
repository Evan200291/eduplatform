// ─────────────────────────────────────────────────────────────────────────────
// Recommendation planning (no database access)
// Blueprint 04: "The system proposes. The teacher decides." Every proposal here
// carries a plain-language rationale, an actionable proposal, and — where a
// decision was taken — who took it.
//
// Split out of `learning.plan.ts` to keep both files readable; the shared types
// live there and this file only builds `PlannedRecommendation` rows.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EvidenceConfidence,
  EvidenceSource,
  MasteryLevel,
  RecommendationOrigin,
  RecommendationStatus,
} from '@prisma/client';

import { notAfter } from './evaluation.plan';
import type { SeededTopicMastery } from './evaluation.plan';
import { daysAgo, daysAhead, hashInt, pick } from './helpers';
import type { PathInput, PlannedProposal, PlannedRecommendation } from './learning.plan';
import type { DemoStudent } from './people.seed';

/**
 * The seven recommendation shapes the demo needs. Between them they cover every
 * `RecommendationOrigin` and every `RecommendationStatus`, including the two the
 * background sweeps produce — AUTO_APPROVED past its deadline, and SUPERSEDED
 * after expiry — so `runRecommendationSweeps` has nothing left to fix on a fresh
 * seed and the teacher's queue still shows what each state looks like.
 *
 * `daysBack` dates the proposal; `priority` orders the queue.
 */
interface Recipe {
  origin: RecommendationOrigin;
  status: RecommendationStatus;
  priority: number;
  daysBack: number;
  confidence: EvidenceConfidence;
  evidenceSource: EvidenceSource;
  decided: boolean;
  decisionNote: string | null;
  /** Days from now; negative is in the past. */
  autoApproveInDays: number | null;
  expiresInDays: number | null;
  /** APPROVED writes the proposal through; MODIFIED narrows it first. */
  applied: 'none' | 'whole' | 'narrowed';
  attachAttempt: boolean;
  attachAssessment: boolean;
}

const RECIPES: readonly Recipe[] = [
  {
    origin: RecommendationOrigin.SCREENING_ASSESSMENT,
    status: RecommendationStatus.APPROVED,
    priority: 60,
    daysBack: 21,
    confidence: EvidenceConfidence.HIGH,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: true,
    decisionNote: 'Approved as proposed — the placement matches what I see in class.',
    autoApproveInDays: null,
    expiresInDays: null,
    applied: 'whole',
    attachAttempt: true,
    attachAssessment: false,
  },
  {
    origin: RecommendationOrigin.ONGOING_EVIDENCE,
    status: RecommendationStatus.PENDING_APPROVAL,
    priority: 80,
    daysBack: 2,
    confidence: EvidenceConfidence.MODERATE,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: false,
    decisionNote: null,
    autoApproveInDays: null,
    // Future expiry: a pending row seeded already-expired would be swept away
    // the first time the scheduler ran, leaving the approval queue empty.
    expiresInDays: 12,
    applied: 'none',
    attachAttempt: true,
    attachAssessment: false,
  },
  {
    origin: RecommendationOrigin.REASSESSMENT,
    status: RecommendationStatus.AUTO_APPROVED,
    priority: 45,
    daysBack: 9,
    confidence: EvidenceConfidence.MODERATE,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: true,
    decisionNote: 'Auto-approved after the review deadline passed.',
    autoApproveInDays: null,
    expiresInDays: null,
    applied: 'whole',
    attachAttempt: false,
    attachAssessment: true,
  },
  {
    origin: RecommendationOrigin.TEACHER_REQUEST,
    status: RecommendationStatus.MODIFIED,
    priority: 55,
    daysBack: 6,
    confidence: EvidenceConfidence.HIGH,
    evidenceSource: EvidenceSource.TEACHER_JUDGMENT,
    decided: true,
    decisionNote: 'Narrowed to one topic — the rest is already covered in Thursday’s lesson.',
    autoApproveInDays: null,
    expiresInDays: null,
    applied: 'narrowed',
    attachAttempt: false,
    attachAssessment: false,
  },
  {
    origin: RecommendationOrigin.SCHEDULED_REVIEW,
    status: RecommendationStatus.DEFERRED,
    priority: 30,
    daysBack: 4,
    confidence: EvidenceConfidence.LOW,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: true,
    decisionNote: 'Deferred until after the half-term break.',
    autoApproveInDays: 10,
    expiresInDays: null,
    applied: 'none',
    attachAttempt: false,
    attachAssessment: false,
  },
  {
    origin: RecommendationOrigin.ONGOING_EVIDENCE,
    status: RecommendationStatus.REJECTED,
    priority: 20,
    daysBack: 14,
    confidence: EvidenceConfidence.LOW,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: true,
    decisionNote: 'Rejected: one weak session, not a pattern. Leaving the plan as it is.',
    autoApproveInDays: null,
    expiresInDays: null,
    applied: 'none',
    attachAttempt: true,
    attachAssessment: false,
  },
  {
    origin: RecommendationOrigin.SCREENING_ASSESSMENT,
    status: RecommendationStatus.SUPERSEDED,
    priority: 15,
    daysBack: 40,
    confidence: EvidenceConfidence.LOW,
    evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
    decided: true,
    decisionNote: null,
    autoApproveInDays: null,
    expiresInDays: -26,
    applied: 'none',
    attachAttempt: false,
    attachAssessment: false,
  },
];

/** Statuses only the scheduler produces, so no teacher is credited with them. */
const SYSTEM_DECIDED: readonly RecommendationStatus[] = [
  RecommendationStatus.AUTO_APPROVED,
  RecommendationStatus.SUPERSEDED,
];

/** Plain-language reason, per origin. Blueprint 04: the teacher must be told why. */
function rationaleFor(
  recipe: Recipe,
  student: DemoStudent,
  subjectName: string,
  weakest: SeededTopicMastery | undefined,
  practiseCount: number,
): string {
  const topic = weakest ? `“${weakest.topicKey}”` : 'the opening topics';
  const score = weakest ? `${weakest.accuracyPercent}%` : 'no evidence yet';
  switch (recipe.origin) {
    case RecommendationOrigin.SCREENING_ASSESSMENT:
      return (
        `${student.firstName}’s ${subjectName} screening placed them at ${score} on ${topic}. ` +
        `Proposing ${practiseCount} topic(s) of practice before moving on.`
      );
    case RecommendationOrigin.ONGOING_EVIDENCE:
      return (
        `Recent ${subjectName} work shows ${score} on ${topic}, below the mastery threshold. ` +
        'Proposing a short practice block rather than a full reassessment.'
      );
    case RecommendationOrigin.REASSESSMENT:
      return (
        `${topic} was marked secure more than a month ago and is due a check. ` +
        'Proposing the reassessment for this subject.'
      );
    case RecommendationOrigin.TEACHER_REQUEST:
      return (
        `Raised by the class teacher after ${student.firstName} asked for more work on ${topic}. ` +
        'Recorded as a professional judgment, not an inference.'
      );
    case RecommendationOrigin.SCHEDULED_REVIEW:
      return (
        `Half-termly review of ${student.firstName}’s ${subjectName} plan. ` +
        `Nothing urgent: ${topic} is the weakest area at ${score}.`
      );
    default:
      return `Review of ${student.firstName}’s ${subjectName} plan.`;
  }
}

/**
 * Two recommendations per (student, subject) pair, drawn from `RECIPES` by
 * position. `pairIndex * 2 + n` walks all seven recipes because 2 and 7 are
 * coprime, so a 72-pair cohort lands roughly 20 rows on each one.
 */
export function recommendationsFor(input: PathInput, pathVersion: number): PlannedRecommendation[] {
  const ranked = [...input.mastery].sort(
    (left, right) =>
      left.accuracyPercent - right.accuracyPercent || left.topicKey.localeCompare(right.topicKey),
  );
  const weakest = ranked[0];
  const practise = (
    ranked.length > 0
      ? ranked.slice(0, 2).map((row) => row.topicId)
      : input.topics.slice(0, 2).map((topic) => topic.id)
  ).filter((id): id is string => Boolean(id));
  const advance = ranked
    .filter((row) => row.level === MasteryLevel.MASTERED)
    .map((row) => row.topicId);
  const screening = input.attempts.find((attempt) =>
    attempt.assessmentKey.startsWith('screening:'),
  );

  const rows: PlannedRecommendation[] = [];
  for (let slot = 0; slot < 2; slot += 1) {
    const recipe = RECIPES[(input.pairIndex * 2 + slot) % RECIPES.length];
    const createdAt = daysAgo(recipe.daysBack, input.now);
    const decidedAt = recipe.decided
      ? notAfter(daysAhead(1, createdAt), input.now)
      : null;
    const proposal: PlannedProposal = {
      practise,
      advance,
      note: recipe.decisionNote ?? 'Awaiting the teacher’s decision.',
    };
    const narrowed: PlannedProposal = {
      practise: practise.slice(0, 1),
      advance: [],
      note: 'Narrowed by the teacher to a single topic.',
    };

    rows.push({
      subjectId: input.subjectId,
      topicId: weakest?.topicId ?? input.topics[0]?.id ?? null,
      pathVersion,
      assessmentId: recipe.attachAssessment ? (input.reassessment?.id ?? null) : null,
      attemptId: recipe.attachAttempt ? (screening?.id ?? null) : null,
      origin: recipe.origin,
      status: recipe.status,
      rationale: rationaleFor(recipe, input.student, input.subjectName, weakest, practise.length),
      proposal,
      appliedChange:
        recipe.applied === 'whole' ? proposal : recipe.applied === 'narrowed' ? narrowed : null,
      // A little spread so the queue is not sorted by origin alone.
      priority: recipe.priority + hashInt(`rec-priority:${input.student.id}:${slot}`, 0, 9),
      evidenceSource: recipe.evidenceSource,
      confidence: recipe.confidence,
      decidedById:
        recipe.decided && !SYSTEM_DECIDED.includes(recipe.status)
          ? pick(input.teacherIds, `rec-decider:${input.student.id}:${input.subjectKey}:${slot}`)
          : null,
      decidedAt,
      decisionNote: recipe.decisionNote,
      autoApproveAt:
        recipe.autoApproveInDays === null ? null : daysAhead(recipe.autoApproveInDays, input.now),
      expiresAt: recipe.expiresInDays === null ? null : daysAhead(recipe.expiresInDays, input.now),
      createdAt,
    });
  }
  return rows;
}




