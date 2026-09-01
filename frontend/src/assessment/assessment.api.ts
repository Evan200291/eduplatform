import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type { ContentStatus } from '@/content/content.types';
import type {
  AssessmentAttempt,
  AssessmentDefinition,
  AssessmentDetail,
  AssessmentItem,
  AssessmentKind,
  AttemptListQuery,
  CreateAssessmentInput,
  NextItemResult,
  StudentMastery,
  SubmitAttemptResult,
  SubmitResponseInput,
  SubmitResponseResult,
} from './assessment.types';

/**
 * Assessment endpoints — definitions, the attempt delivery loop, and mastery.
 *
 * A learner holds `assessment.read`, `assessment.attempt.start` and
 * `assessment.attempt.read`, never `assessment.write` — which assessment is
 * "theirs" is resolved server-side from those grants, never from a query
 * param. Placement/band language is deliberately withheld from students: the
 * submit result never carries `highestBandPassed` for a non-staff caller.
 */

export function fetchAssessments(query?: {
  subjectId?: string;
  topicId?: string;
  kind?: AssessmentKind;
  status?: ContentStatus;
  includeArchived?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<AssessmentDefinition>> {
  return apiGetPaged<AssessmentDefinition>('/assessments', query);
}

export function fetchAssessment(assessmentId: string): Promise<AssessmentDetail> {
  return apiGet<AssessmentDetail>(`/assessments/${encodeURIComponent(assessmentId)}`);
}

/** Authoring: create a new assessment definition. Requires `assessment.write`. */
export function createAssessment(input: CreateAssessmentInput): Promise<AssessmentDefinition> {
  return apiPost<AssessmentDefinition>('/assessments', input);
}

export function updateAssessment(
  assessmentId: string,
  input: Partial<CreateAssessmentInput>,
): Promise<AssessmentDefinition> {
  return apiPatch<AssessmentDefinition>(`/assessments/${encodeURIComponent(assessmentId)}`, input);
}

/**
 * Lifecycle moves for an assessment definition. Unlike curriculum content
 * there is no generic `/status` endpoint — each move is its own route (see
 * `backend/src/modules/assessment/assessment.routes.ts`) and there is no way
 * back to DRAFT once submitted, so a target outside this map is a bug in the
 * caller, not something the backend would ever accept.
 */
const ASSESSMENT_MOVE_PATH: Partial<Record<ContentStatus, string>> = {
  IN_REVIEW: 'submit-for-review',
  APPROVED: 'approve',
  REVISED: 'revise',
  ARCHIVED: 'archive',
  PUBLISHED: 'publish',
};

export function moveAssessmentStatus(
  assessmentId: string,
  status: ContentStatus,
  reason?: string,
): Promise<AssessmentDefinition> {
  const segment = ASSESSMENT_MOVE_PATH[status];
  if (!segment) {
    return Promise.reject(new Error(`No route moves an assessment to ${status}.`));
  }
  return apiPost<AssessmentDefinition>(
    `/assessments/${encodeURIComponent(assessmentId)}/${segment}`,
    { reason },
  );
}

export function fetchAssessmentItems(assessmentId: string): Promise<AssessmentItem[]> {
  return apiGet<AssessmentItem[]>(`/assessments/${encodeURIComponent(assessmentId)}/items`);
}

export function addAssessmentItem(
  assessmentId: string,
  input: { activityId: string; sortOrder?: number; difficultyBand?: string; weight?: number; isAdaptiveEntry?: boolean },
): Promise<AssessmentItem> {
  return apiPost<AssessmentItem>(`/assessments/${encodeURIComponent(assessmentId)}/items`, input);
}

export function setAssessmentItems(
  assessmentId: string,
  items: Array<{ activityId: string; sortOrder?: number; difficultyBand?: string; weight?: number; isAdaptiveEntry?: boolean }>,
): Promise<AssessmentItem[]> {
  return apiPut<AssessmentItem[]>(`/assessments/${encodeURIComponent(assessmentId)}/items`, { items });
}

export function removeAssessmentItem(assessmentId: string, itemId: string): Promise<void> {
  return apiDelete(`/assessments/${encodeURIComponent(assessmentId)}/items/${encodeURIComponent(itemId)}`);
}

/** Starts a new attempt at an assessment (e.g. the screening check). */
export function startAttempt(
  assessmentId: string,
  input?: { isPractice?: boolean; deviceInfo?: string },
): Promise<AssessmentAttempt> {
  return apiPost<AssessmentAttempt>(
    `/assessments/${encodeURIComponent(assessmentId)}/attempts`,
    input ?? {},
  );
}

export function fetchAttempts(query?: AttemptListQuery): Promise<Paginated<AssessmentAttempt>> {
  return apiGetPaged<AssessmentAttempt>('/assessment-attempts', query);
}

export function fetchAttempt(attemptId: string): Promise<AssessmentAttempt> {
  return apiGet<AssessmentAttempt>(`/assessment-attempts/${encodeURIComponent(attemptId)}`);
}

/** The adaptive delivery loop: call this, show `item`, submit a response, call again. */
export function fetchNextItem(attemptId: string): Promise<NextItemResult> {
  return apiGet<NextItemResult>(`/assessment-attempts/${encodeURIComponent(attemptId)}/next-item`);
}

export function submitResponse(
  attemptId: string,
  input: SubmitResponseInput,
): Promise<SubmitResponseResult> {
  return apiPost<SubmitResponseResult>(
    `/assessment-attempts/${encodeURIComponent(attemptId)}/responses`,
    input,
  );
}

export function submitAttempt(
  attemptId: string,
  input?: { responses?: SubmitResponseInput[]; timeSpentSeconds?: number },
): Promise<SubmitAttemptResult> {
  return apiPost<SubmitAttemptResult>(
    `/assessment-attempts/${encodeURIComponent(attemptId)}/submit`,
    input ?? {},
  );
}

export function abandonAttempt(attemptId: string, reason?: string): Promise<AssessmentAttempt> {
  return apiPost<AssessmentAttempt>(`/assessment-attempts/${encodeURIComponent(attemptId)}/abandon`, {
    reason,
  });
}

/** The student's own current mastery picture, grouped into topics and objectives. */
export function fetchStudentMastery(studentId: string, subjectId?: string): Promise<StudentMastery> {
  return apiGet<StudentMastery>(`/topic-evaluations/students/${encodeURIComponent(studentId)}/mastery`, {
    params: subjectId ? { subjectId } : undefined,
  });
}
