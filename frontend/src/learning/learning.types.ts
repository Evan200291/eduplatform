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

export interface RecommendationRecord {
  id: string;
  studentId: string;
  subjectId: string;
  proposedPath: unknown;
  status: 'PENDING' | 'APPROVED' | 'MODIFIED' | 'REJECTED' | 'DEFERRED';
  createdAt: string;
  student: { id: string; firstName: string; lastName: string; displayName: string };
  subject: { id: string; name: string; key: string };
}

export interface RecommendationListQuery extends ListQuery {
  pendingOnly?: boolean;
  studentId?: string;
}
