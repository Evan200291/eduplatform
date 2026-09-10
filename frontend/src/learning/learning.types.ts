import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/learning` — learning paths and recommendations. */

export type PathMode = 'GRADE_BASED' | 'SUBJECT_BASED' | 'TOPIC_BASED' | 'HYBRID';
export type PathItemStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'REMOVED_BY_TEACHER';
export type RecommendationDecision = 'APPROVE' | 'MODIFY' | 'REJECT' | 'DEFER';

export interface PathItem {
  id: string;
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  assessmentId: string | null;
  sortOrder: number;
  status: PathItemStatus;
  isRequired: boolean;
  /**
   * Why this step is where it is — set when a step is locked behind
   * prerequisites, e.g. "Locked until 2 prerequisite topic(s) are secure."
   * The server has always returned it; the mirror simply never carried it.
   */
  reason: string | null;
  unlockedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  topic: { id: string; name: string; key: string; difficultyBand: string; estimatedMinutes: number | null } | null;
  lesson: { id: string; title: string; key: string } | null;
  activity: { id: string; title: string; key: string; type: string; pointsValue: number } | null;
  assessment: { id: string; title: string; key: string; kind: string } | null;
}

export interface LearningPath {
  id: string;
  studentId: string;
  subjectId: string;
  mode: PathMode;
  name: string;
  version: number;
  isActive: boolean;
  requiresApproval: boolean;
  approvedById: string | null;
  approvedAt: string | null;
  generatedAt: string;
  generatorNote: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  subject: { id: string; name: string; key: string };
  student: { id: string; firstName: string; lastName: string; displayName: string };
  items: PathItem[];
  summary: {
    stepsTotal: number;
    stepsRequired: number;
    stepsCompleted: number;
    completionPercent: number;
    nextStepId: string | null;
    isApproved: boolean;
  };
}

export interface CompleteItemResult {
  item: PathItem;
  unlockedNext: PathItem | null;
  pathCompleted: boolean;
}

export type RecommendationStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'MODIFIED'
  | 'REJECTED'
  | 'DEFERRED'
  | 'AUTO_APPROVED'
  | 'SUPERSEDED';

export type RecommendationOrigin =
  | 'SCREENING_ASSESSMENT'
  | 'ONGOING_EVIDENCE'
  | 'TEACHER_REQUEST'
  | 'REASSESSMENT'
  | 'SCHEDULED_REVIEW';

/** One topic inside a proposal. Teacher-raised proposals carry no accuracy. */
export interface ProposalTopic {
  topicId: string;
  topicName: string;
  accuracyPercent?: number;
}

/**
 * The server reads `practise` (add or open these steps) and `advance` (skip
 * these, already secure) when a proposal is applied to a path; `consolidate`
 * is informational.
 */
export interface RecommendationProposal {
  overallPercent?: number;
  suggestedStartingBand?: string | null;
  practise?: ProposalTopic[];
  consolidate?: ProposalTopic[];
  advance?: ProposalTopic[];
}

/** Mirrors `RECOMMENDATION_SELECT` in `recommendations.service.ts`. */
export interface RecommendationRecord {
  id: string;
  studentId: string;
  subjectId: string | null;
  topicId: string | null;
  pathId: string | null;
  origin: RecommendationOrigin;
  status: RecommendationStatus;
  rationale: string | null;
  proposal: RecommendationProposal | null;
  appliedChange: RecommendationProposal | null;
  priority: number;
  evidenceSource: string;
  confidence: string;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  autoApproveAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string; displayName: string };
  subject: { id: string; name: string; key: string } | null;
  topic: { id: string; name: string; key: string } | null;
}

export interface RecommendationSummary {
  pending: number;
  deferred: number;
  dueForAutoApproval: number;
  byOrigin: { origin: RecommendationOrigin; count: number }[];
}

export interface CreateRecommendationInput {
  studentId: string;
  subjectId?: string;
  topicId?: string;
  rationale: string;
  proposal: RecommendationProposal;
  priority?: number;
}

export interface RecommendationListQuery extends ListQuery {
  pendingOnly?: boolean;
  studentId?: string;
  status?: RecommendationStatus;
  origin?: RecommendationOrigin;
}
