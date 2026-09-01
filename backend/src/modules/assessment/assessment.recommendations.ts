// ─────────────────────────────────────────────────────────────────────────────
// Recommendation proposals from assessment evidence
// Blueprint 04: "The system proposes. The teacher decides." Nothing in this file
// changes a learning path. It writes a *proposal* — the concrete change, plus the
// plain-language reason a teacher needs in order to agree or disagree with it.
//
// A school may opt out of the approval step (`recommendationApprovalRequired`) or
// set a deadline after which a pending proposal approves itself
// (`recommendationAutoApproveHours`). Both are per-school settings, never defaults
// baked into this code.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AssessmentKind,
  MasteryLevel,
  RecommendationOrigin,
  RecommendationStatus,
  EvidenceSource,
  type Prisma,
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { prisma } from '../../core/prisma';
import { confidenceFromEvidence, readAssessmentEngineSettings } from './assessment.helpers';
import type { AttemptTotals } from './assessment.scoring';

/** A proposal a teacher has not looked at in two weeks is stale, not urgent. */
const PROPOSAL_TTL_DAYS = 14;

export interface TopicOutcome {
  topicId: string;
  topicName: string;
  level: MasteryLevel;
  accuracyPercent: number;
}

interface ProposalAttempt {
  id: string;
  schoolId: string;
  studentId: string;
  assessmentId: string;
  assessment: {
    kind: string;
    subjectId: string;
    topicId: string | null;
    passThreshold: number;
  };
}

function originFor(kind: string): RecommendationOrigin {
  if (kind === AssessmentKind.SCREENING) return RecommendationOrigin.SCREENING_ASSESSMENT;
  if (kind === AssessmentKind.REASSESSMENT) return RecommendationOrigin.REASSESSMENT;
  return RecommendationOrigin.ONGOING_EVIDENCE;
}

const BELOW_PROFICIENT: MasteryLevel[] = [
  MasteryLevel.NOT_ASSESSED,
  MasteryLevel.EMERGING,
  MasteryLevel.DEVELOPING,
];

function sentence(list: string[]): string {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1] ?? ''}`;
}

/**
 * Writes at most one recommendation per attempt. Earlier pending proposals for the
 * same learner and subject are marked SUPERSEDED first, so a teacher's queue holds
 * the current picture rather than one row per attempt the learner has ever made.
 */
export async function proposeFromEvidence(
  context: ActorContext | null,
  attempt: ProposalAttempt,
  totals: AttemptTotals,
  outcomes: readonly TopicOutcome[],
): Promise<number> {
  const practise = outcomes.filter((row) => BELOW_PROFICIENT.includes(row.level));
  const consolidate = outcomes.filter((row) => row.level === MasteryLevel.PROFICIENT);
  const advance = outcomes.filter((row) => row.level === MasteryLevel.MASTERED);

  // Nothing to say is a legitimate outcome. An empty proposal would only add noise
  // to the approval queue.
  if (practise.length === 0 && advance.length === 0) return 0;

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId: attempt.schoolId },
    select: { recommendationApprovalRequired: true, recommendationAutoApproveHours: true },
  });

  const approvalRequired = settings?.recommendationApprovalRequired ?? true;
  const autoApproveHours = settings?.recommendationAutoApproveHours ?? null;
  const engineSettings = await readAssessmentEngineSettings(attempt.schoolId);
  const now = new Date();

  const status = approvalRequired
    ? RecommendationStatus.PENDING_APPROVAL
    : RecommendationStatus.AUTO_APPROVED;

  const autoApproveAt =
    approvalRequired && autoApproveHours && autoApproveHours > 0
      ? new Date(now.getTime() + autoApproveHours * 3_600_000)
      : null;

  const proposal: Prisma.InputJsonValue = {
    kind: 'ADJUST_LEARNING_PATH',
    subjectId: attempt.assessment.subjectId,
    sourceAttemptId: attempt.id,
    /** Where the adaptive walk left the learner; the path should start here. */
    suggestedStartingBand: totals.highestBandPassed ?? null,
    overallPercent: totals.scorePercent,
    practise: practise.map((row) => ({
      topicId: row.topicId,
      topicName: row.topicName,
      accuracyPercent: row.accuracyPercent,
      action: 'ADD_PRACTICE',
    })),
    consolidate: consolidate.map((row) => ({
      topicId: row.topicId,
      topicName: row.topicName,
      accuracyPercent: row.accuracyPercent,
      action: 'KEEP_IN_PATH',
    })),
    advance: advance.map((row) => ({
      topicId: row.topicId,
      topicName: row.topicName,
      accuracyPercent: row.accuracyPercent,
      action: 'SKIP_AHEAD',
    })),
  };

  await prisma.recommendation.updateMany({
    where: {
      studentId: attempt.studentId,
      subjectId: attempt.assessment.subjectId,
      status: RecommendationStatus.PENDING_APPROVAL,
    },
    data: { status: RecommendationStatus.SUPERSEDED, decidedAt: now },
  });

  const created = await prisma.recommendation.create({
    data: {
      schoolId: attempt.schoolId,
      studentId: attempt.studentId,
      subjectId: attempt.assessment.subjectId,
      topicId: attempt.assessment.topicId,
      assessmentId: attempt.assessmentId,
      attemptId: attempt.id,
      origin: originFor(attempt.assessment.kind),
      status,
      rationale: buildRationale(attempt, totals, practise, advance),
      proposal,
      priority: priorityFrom(practise, attempt.assessment.passThreshold),
      evidenceSource: EvidenceSource.SYSTEM_ASSESSMENT,
      confidence: confidenceFromEvidence(totals.questionsAnswered, engineSettings.confidence),
      autoApproveAt,
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_DAYS * 86_400_000),
      decidedAt: approvalRequired ? null : now,
      decisionNote: approvalRequired
        ? null
        : 'Auto-approved: this school has turned off the approval step for recommendations.',
    },
    select: { id: true },
  });

  recordAudit(context, {
    action: 'recommendation.create',
    targetType: 'Recommendation',
    targetId: created.id,
    schoolId: attempt.schoolId,
    summary: `Proposed a learning-path change from attempt ${attempt.id} (${status}).`,
    afterData: { status, practise: practise.length, advance: advance.length },
  });

  return 1;
}

/**
 * The teacher-facing explanation. Deliberately plain: band names and percentages,
 * no scores the learner never saw and no jargon the parent could not read.
 */
function buildRationale(
  attempt: ProposalAttempt,
  totals: AttemptTotals,
  practise: readonly TopicOutcome[],
  advance: readonly TopicOutcome[],
): string {
  const parts: string[] = [];

  parts.push(
    `Overall the learner scored ${totals.scorePercent}% across ${totals.itemsPresented} item(s) ` +
      `and ${totals.questionsAnswered} question(s).`,
  );

  if (totals.highestBandPassed) {
    parts.push(`The highest band passed was ${totals.highestBandPassed}.`);
  } else {
    parts.push('No band was passed at the required threshold on this attempt.');
  }

  if (practise.length > 0) {
    const named = practise.map((row) => `${row.topicName} (${row.accuracyPercent}%)`);
    parts.push(
      `Evidence suggests more practice is needed on ${sentence(named)}, so practice steps for ` +
        'those topics are proposed before the learner moves on.',
    );
  }

  if (advance.length > 0) {
    const named = advance.map((row) => `${row.topicName} (${row.accuracyPercent}%)`);
    parts.push(
      `${sentence(named)} already ${advance.length === 1 ? 'looks' : 'look'} secure, so the ` +
        'proposal skips ahead rather than repeating work the learner can already do.',
    );
  }

  parts.push(
    `This is a proposal based on ${totals.questionsAnswered} question(s) of evidence from a single ` +
      'assessment. Please review it against what you have seen in class before approving.',
  );

  return parts.join(' ');
}

/**
 * Higher priority means further below the pass threshold. A learner who scored 20%
 * on a topic needs the teacher's attention before one who scored 65%.
 */
function priorityFrom(practise: readonly TopicOutcome[], passThreshold: number): number {
  if (practise.length === 0) return 10;
  const worst = practise.reduce(
    (lowest, row) => Math.min(lowest, row.accuracyPercent),
    100,
  );
  return Math.max(0, Math.min(100, passThreshold - worst));
}
