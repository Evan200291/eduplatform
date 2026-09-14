import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  AcademicTerm,
  ClassListQuery,
  ClassRosterEntry,
  ClassTeacherEntry,
  EnrolledClass,
  Grade,
  SchoolClass,
  Subject,
} from './academic.types';

/** How a school is organised — grades, terms, subjects, classes. */

export function fetchGrades(): Promise<Paginated<Grade>> {
  return apiGetPaged<Grade>('/grades');
}
/** Every grade in one page (the server caps a page at 200), for lookups such as CSV import. */
export function fetchAllGrades(): Promise<Paginated<Grade>> {
  return apiGetPaged<Grade>('/grades', { pageSize: 200 });
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
export function fetchAllSubjects(): Promise<Paginated<Subject>> {
  return apiGetPaged<Subject>('/subjects', { pageSize: 200 });
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

// ── Editing what was previously create-only ─────────────────────────────────

/**
 * Grades and subjects could be created and never changed or retired. Both
 * archive rather than delete: a grade with learning history behind it must stay
 * referenceable, so `archive` takes a reason and the row survives.
 */

export function updateGrade(gradeId: string, input: Record<string, unknown>): Promise<Grade> {
  return apiPatch<Grade>(`/grades/${encodeURIComponent(gradeId)}`, input);
}

export function archiveGrade(gradeId: string, reason: string): Promise<Grade> {
  return apiPost<Grade>(`/grades/${encodeURIComponent(gradeId)}/archive`, { reason });
}

export function updateSubject(subjectId: string, input: Record<string, unknown>): Promise<Subject> {
  return apiPatch<Subject>(`/subjects/${encodeURIComponent(subjectId)}`, input);
}

export function archiveSubject(subjectId: string, reason: string): Promise<Subject> {
  return apiPost<Subject>(`/subjects/${encodeURIComponent(subjectId)}/archive`, { reason });
}

export function updateTerm(
  termId: string,
  input: { name?: string; startsAt?: string; endsAt?: string; isCurrent?: boolean },
): Promise<AcademicTerm> {
  return apiPatch<AcademicTerm>(`/terms/${encodeURIComponent(termId)}`, input);
}

export function archiveClass(classId: string, reason: string): Promise<SchoolClass> {
  return apiPost<SchoolClass>(`/classes/${encodeURIComponent(classId)}/archive`, { reason });
}

// ── Staffing a class ────────────────────────────────────────────────────────

/**
 * Who teaches this class, and which subjects it covers.
 *
 * Both were unreachable, which meant a class could be created and never
 * staffed — the teacher portal's whole scope model rests on `ClassTeacher`
 * rows, so a class with none is invisible to the people meant to teach it.
 */

export function fetchClassTeachers(classId: string): Promise<ClassTeacherEntry[]> {
  return apiGet<ClassTeacherEntry[]>(`/classes/${encodeURIComponent(classId)}/teachers`);
}

export function assignClassTeacher(
  classId: string,
  input: { userId: string; subjectId?: string; isLead?: boolean },
): Promise<ClassTeacherEntry> {
  return apiPost<ClassTeacherEntry>(`/classes/${encodeURIComponent(classId)}/teachers`, input);
}

export function removeClassTeacher(classId: string, teacherId: string): Promise<void> {
  return apiDelete(
    `/classes/${encodeURIComponent(classId)}/teachers/${encodeURIComponent(teacherId)}`,
  );
}

/** Replaces the whole subject list for a class — send every subject, not a delta. */
export function setClassSubjects(classId: string, subjectIds: string[]): Promise<unknown> {
  return apiPut(`/classes/${encodeURIComponent(classId)}/subjects`, { subjectIds });
}

export function updateClassSubject(
  classId: string,
  input: { subjectId: string; weeklyMinutes?: number },
): Promise<unknown> {
  return apiPatch(`/classes/${encodeURIComponent(classId)}/subjects`, input);
}
