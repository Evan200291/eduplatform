import { apiDeleteReturning, apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CompleteItemResult,
  LearningPath,
  PathItem,
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

// ── Restructuring a path ────────────────────────────────────────────────────

/**
 * PRD v2.5: teachers may adjust authorised learners' paths. Pacing edits
 * existed; restructuring did not — a step could not be added, dropped or moved
 * without regenerating the whole path and losing the teacher's adjustments.
 *
 * Removal takes a reason because the server keeps the step as history ("what
 * was planned, and why it was dropped") rather than deleting it. Axios sends a
 * DELETE body through `data`, which is why the reason rides in the config.
 */

export function addPathItem(
  pathId: string,
  input: {
    topicId?: string;
    lessonId?: string;
    activityId?: string;
    assessmentId?: string;
    sortOrder?: number;
    isRequired?: boolean;
    dueAt?: string;
    reason?: string;
  },
): Promise<PathItem> {
  return apiPost<PathItem>(`/learning-paths/${encodeURIComponent(pathId)}/items`, input);
}

export function removePathItem(pathId: string, itemId: string, reason: string): Promise<PathItem> {
  return apiDeleteReturning<PathItem>(
    `/learning-paths/${encodeURIComponent(pathId)}/items/${encodeURIComponent(itemId)}`,
    { data: { reason } },
  );
}

/** Whole-list reorder — every step with its new position. */
export function reorderPathItems(
  pathId: string,
  items: { id: string; sortOrder: number }[],
): Promise<PathItem[]> {
  return apiPut<PathItem[]>(`/learning-paths/${encodeURIComponent(pathId)}/items/reorder`, { items });
}

/** Re-checks prerequisites and unlocks any step whose requirements are now secure. */
export function refreshPathUnlocks(pathId: string): Promise<LearningPath> {
  return apiPost<LearningPath>(`/learning-paths/${encodeURIComponent(pathId)}/refresh-unlocks`);
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
