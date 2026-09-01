import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  Assignment,
  AssignmentAttempt,
  AssignmentListQuery,
  MyWork,
} from './assignments.types';

/** Assignment endpoints. `assignment.submit` is the learner grant; the rest is staff. */

export function fetchAssignments(query?: AssignmentListQuery): Promise<Paginated<Assignment>> {
  return apiGetPaged<Assignment>('/assignments', query);
}

/** The student's own homework figure for the dashboard — no query needed for self. */
export function fetchMyWork(): Promise<MyWork> {
  return apiGet<MyWork>('/assignments/my-work');
}

export function fetchAssignment(assignmentId: string): Promise<Assignment> {
  return apiGet<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}`);
}

export function startAssignment(assignmentId: string, studentId?: string): Promise<AssignmentAttempt> {
  return apiPost<AssignmentAttempt>(`/assignments/${encodeURIComponent(assignmentId)}/start`, {
    studentId,
  });
}

export function submitAssignment(
  assignmentId: string,
  input: {
    studentId?: string;
    scorePercent?: number;
    timeSpentSeconds?: number;
    assessmentAttemptId?: string;
    note?: string;
  },
): Promise<AssignmentAttempt> {
  return apiPost<AssignmentAttempt>(`/assignments/${encodeURIComponent(assignmentId)}/submit`, input);
}

export function createAssignment(input: Record<string, unknown>): Promise<Assignment> {
  return apiPost<Assignment>('/assignments', input);
}

export function updateAssignment(assignmentId: string, input: Record<string, unknown>): Promise<Assignment> {
  return apiPatch<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}`, input);
}

export function setAssignmentTargets(
  assignmentId: string,
  input: Record<string, unknown>,
): Promise<Assignment> {
  return apiPost<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}/targets`, input);
}

export function publishAssignment(assignmentId: string): Promise<Assignment> {
  return apiPost<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}/publish`);
}

export function archiveAssignment(assignmentId: string): Promise<Assignment> {
  return apiPost<Assignment>(`/assignments/${encodeURIComponent(assignmentId)}/archive`);
}

export function fetchAssignmentMonitor(assignmentId: string): Promise<{
  attempts: AssignmentAttempt[];
  byState: Record<string, number>;
}> {
  return apiGet(`/assignments/${encodeURIComponent(assignmentId)}/monitor`);
}

export function giveAttemptFeedback(attemptId: string, feedback: string): Promise<AssignmentAttempt> {
  return apiPost<AssignmentAttempt>(`/assignments/attempts/${encodeURIComponent(attemptId)}/feedback`, {
    feedback,
  });
}

export function excuseAttempt(attemptId: string, reason?: string): Promise<AssignmentAttempt> {
  return apiPost<AssignmentAttempt>(`/assignments/attempts/${encodeURIComponent(attemptId)}/excuse`, {
    reason,
  });
}

export function unexcuseAttempt(attemptId: string): Promise<AssignmentAttempt> {
  return apiPost<AssignmentAttempt>(`/assignments/attempts/${encodeURIComponent(attemptId)}/unexcuse`);
}
