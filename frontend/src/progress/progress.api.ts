import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type { MasteryRecord } from '@/assessment/assessment.types';
import type {
  ProgressListQuery,
  ProgressRecord,
  ProgressSummary,
  TeacherJudgment,
  TeacherNote,
} from './progress.types';

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

/**
 * A teacher judgment replacing the system's inference on one mastery row.
 * `clearOverride` hands the row back to the evidence engine; the note is still
 * required, so handing back is explained too.
 */
export function overrideMastery(
  masteryId: string,
  input: { level: string; note: string; clearOverride?: boolean },
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

export function createTeacherAssessment(input: {
  studentId: string;
  subjectId?: string;
  topicId?: string;
  level: string;
  comment?: string;
  countsAsEvidence?: boolean;
}): Promise<TeacherJudgment> {
  return apiPost<TeacherJudgment>('/teacher-assessments', input);
}

export function fetchTeacherAssessments(query?: {
  studentId?: string;
  subjectId?: string;
  topicId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<TeacherJudgment>> {
  return apiGetPaged<TeacherJudgment>('/teacher-assessments', query);
}

export function updateTeacherAssessment(
  id: string,
  input: { level?: string; comment?: string; countsAsEvidence?: boolean },
): Promise<TeacherJudgment> {
  return apiPatch<TeacherJudgment>(`/teacher-assessments/${encodeURIComponent(id)}`, input);
}
