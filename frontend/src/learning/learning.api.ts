import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CompleteItemResult,
  LearningPath,
  RecommendationListQuery,
  RecommendationRecord,
} from './learning.types';

/**
 * Learning-path endpoints.
 *
 * Students hold `learningpath.read` only — starting/completing a step and
 * reading `/active` are all still "read" from the permission's point of view,
 * since the state transition is server-computed, not client-authored.
 * Everything else (generate, approve, item CRUD) is `learningpath.write` /
 * `.approve` and backs the teacher's approval queue.
 */

export function fetchLearningPaths(query?: {
  studentId?: string;
  subjectId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<LearningPath>> {
  return apiGetPaged<LearningPath>('/learning-paths', query);
}

/** "What is this student working on in this subject right now" — null if none. */
export function fetchActivePath(subjectId: string, studentId?: string): Promise<LearningPath | null> {
  return apiGet<LearningPath | null>('/learning-paths/active', {
    params: { subjectId, ...(studentId ? { studentId } : {}) },
  });
}

export function fetchLearningPath(pathId: string): Promise<LearningPath> {
  return apiGet<LearningPath>(`/learning-paths/${encodeURIComponent(pathId)}`);
}

export function startPathItem(pathId: string, itemId: string): Promise<{ item: LearningPath['items'][number] }> {
  return apiPost(`/learning-paths/${encodeURIComponent(pathId)}/items/${encodeURIComponent(itemId)}/start`);
}

export function completePathItem(pathId: string, itemId: string): Promise<CompleteItemResult> {
  return apiPost<CompleteItemResult>(
    `/learning-paths/${encodeURIComponent(pathId)}/items/${encodeURIComponent(itemId)}/complete`,
  );
}

export function generateLearningPath(input: Record<string, unknown>): Promise<LearningPath> {
  return apiPost<LearningPath>('/learning-paths/generate', input);
}

export function approveLearningPath(pathId: string, note?: string): Promise<LearningPath> {
  return apiPost<LearningPath>(`/learning-paths/${encodeURIComponent(pathId)}/approve`, { note });
}

export function updateLearningPath(pathId: string, input: Record<string, unknown>): Promise<LearningPath> {
  return apiPatch<LearningPath>(`/learning-paths/${encodeURIComponent(pathId)}`, input);
}

export function archiveLearningPath(pathId: string): Promise<LearningPath> {
  return apiPost<LearningPath>(`/learning-paths/${encodeURIComponent(pathId)}/archive`);
}

/** Adjusts one step's pacing — its due date, whether it's required — without regenerating the path. */
export function updatePathItem(
  pathId: string,
  itemId: string,
  input: { dueAt?: string | null; isRequired?: boolean; sortOrder?: number; reason?: string },
): Promise<LearningPath['items'][number]> {
  return apiPatch<LearningPath['items'][number]>(
    `/learning-paths/${encodeURIComponent(pathId)}/items/${encodeURIComponent(itemId)}`,
    input,
  );
}

// ── Recommendations (teacher approval queue) ─────────────────────────────────

export function fetchRecommendations(
  query?: RecommendationListQuery,
): Promise<Paginated<RecommendationRecord>> {
  return apiGetPaged<RecommendationRecord>('/recommendations', query);
}

export function decideRecommendation(
  recommendationId: string,
  input: {
    decision: 'APPROVE' | 'MODIFY' | 'REJECT' | 'DEFER';
    note?: string;
    appliedChange?: unknown;
    deferUntil?: string;
    applyToPath?: boolean;
  },
): Promise<RecommendationRecord> {
  return apiPost<RecommendationRecord>(
    `/recommendations/${encodeURIComponent(recommendationId)}/decide`,
    input,
  );
}
