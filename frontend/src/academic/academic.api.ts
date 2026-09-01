import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  AcademicTerm,
  ClassListQuery,
  ClassRosterEntry,
  EnrolledClass,
  Grade,
  SchoolClass,
  Subject,
} from './academic.types';

/** How a school is organised — grades, terms, subjects, classes. */

export function fetchGrades(): Promise<Paginated<Grade>> {
  return apiGetPaged<Grade>('/grades');
}
export function createGrade(input: Record<string, unknown>): Promise<Grade> {
  return apiPost<Grade>('/grades', input);
}

export function fetchTerms(): Promise<Paginated<AcademicTerm>> {
  return apiGetPaged<AcademicTerm>('/terms');
}
export function createTerm(input: Record<string, unknown>): Promise<AcademicTerm> {
  return apiPost<AcademicTerm>('/terms', input);
}

export function fetchSubjects(): Promise<Paginated<Subject>> {
  return apiGetPaged<Subject>('/subjects');
}
export function createSubject(input: Record<string, unknown>): Promise<Subject> {
  return apiPost<Subject>('/subjects', input);
}

export function fetchClasses(query?: ClassListQuery): Promise<Paginated<SchoolClass>> {
  return apiGetPaged<SchoolClass>('/classes', query);
}
export function fetchClass(classId: string): Promise<SchoolClass> {
  return apiGet<SchoolClass>(`/classes/${encodeURIComponent(classId)}`);
}
export function createClass(input: Record<string, unknown>): Promise<SchoolClass> {
  return apiPost<SchoolClass>('/classes', input);
}
export function updateClass(classId: string, input: Record<string, unknown>): Promise<SchoolClass> {
  return apiPatch<SchoolClass>(`/classes/${encodeURIComponent(classId)}`, input);
}

/** The signed-in teacher's own classes. */
export function fetchMyClasses(): Promise<Paginated<SchoolClass>> {
  return apiGetPaged<SchoolClass>('/classes/mine');
}

/** The signed-in student's own classes — a plain array, no pagination envelope. */
export function fetchEnrolledClasses(): Promise<EnrolledClass[]> {
  return apiGet<EnrolledClass[]>('/classes/enrolled');
}

export function fetchClassRoster(classId: string): Promise<ClassRosterEntry[]> {
  return apiGet<ClassRosterEntry[]>(`/classes/${encodeURIComponent(classId)}/students`);
}

/**
 * Roster changes. Both take a list because the backend is built for bulk edits
 * (blueprint 05) — enrolling a whole cohort is one call, not one per learner.
 * Both require `class.roster.write`, which is a school-admin permission: a
 * teacher can see their roster but not change who is on it.
 */
export function addStudentsToClass(classId: string, userIds: string[]): Promise<unknown> {
  return apiPost(`/classes/${encodeURIComponent(classId)}/students`, { userIds });
}

/**
 * `hard: false` (the default) is a soft removal that keeps the membership row,
 * so past work still attributes to the class it was done in.
 */
export function removeStudentsFromClass(
  classId: string,
  userIds: string[],
  hard = false,
): Promise<unknown> {
  return apiPost(`/classes/${encodeURIComponent(classId)}/students/remove`, { userIds, hard });
}
