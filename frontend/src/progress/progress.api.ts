import { apiGet, apiGetPaged, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type { MasteryRecord } from '@/assessment/assessment.types';
import type { ProgressListQuery, ProgressRecord, ProgressSummary, TeacherNote } from './progress.types';

/** Progress (completion/engagement) and mastery (understanding) — deliberately distinct. */

export function fetchProgress(query?: ProgressListQuery): Promise<Paginated<ProgressRecord>> {
  return apiGetPaged<ProgressRecord>('/progress', query);
}

export function fetchProgressSummary(query?: {
  studentId?: string;
  subjectId?: string;
  since?: string;
  until?: string;
  groupBy?: 'TOPIC' | 'LESSON' | 'DAY';
}): Promise<ProgressSummary> {
  return apiGet<ProgressSummary>('/progress/summary', { params: query });
}

export function fetchMasteryRecords(query?: { studentId?: string; subjectId?: string }): Promise<
  Paginated<MasteryRecord>
> {
  return apiGetPaged<MasteryRecord>('/mastery', query);
}

export function overrideMastery(
  masteryId: string,
  input: { level: string; note: string },
): Promise<MasteryRecord> {
  return apiPost<MasteryRecord>(`/mastery/${encodeURIComponent(masteryId)}/override`, input);
}

/** Teacher-authored notes on a student. Visibility rules are enforced server-side. */
export function fetchStudentNotes(studentId: string): Promise<Paginated<TeacherNote>> {
  return apiGetPaged<TeacherNote>('/notes', { studentId });
}

export function createStudentNote(input: {
  studentId: string;
  body: string;
  visibility: TeacherNote['visibility'];
}): Promise<TeacherNote> {
  return apiPost<TeacherNote>('/notes', input);
}

export function createTeacherAssessment(input: Record<string, unknown>): Promise<unknown> {
  return apiPost('/teacher-assessments', input);
}
