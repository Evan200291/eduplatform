import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/academic` — grades, terms, subjects, classes. */

export interface Grade {
  id: string;
  name: string;
  level: number;
}

export interface AcademicTerm {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export interface Subject {
  id: string;
  name: string;
  key: string;
  colorHex: string | null;
  iconKey: string | null;
}

export interface SchoolClass {
  id: string;
  name: string;
  code: string;
  gradeId: string | null;
  studentCount?: number;
}

/** The student's own home-screen class list — a plain array, not paginated. */
export interface EnrolledClass {
  id: string;
  name: string;
  code: string;
  joinedAt: string;
  grade: { id: string; name: string; level: number } | null;
  classSubjects: { subject: Subject }[];
  teachers: { user: { id: string; displayName: string } }[];
}

/**
 * One row of a class roster — a *membership*, not a user.
 *
 * `id` is the membership's own id; the learner is under `user`. Getting this
 * wrong is not a cosmetic bug: a caller that reads `entry.id` as the student id
 * links to, or tries to remove, the wrong entity entirely.
 *
 * Mirrors `listRoster` in `backend/src/modules/academic/academic.service.ts`.
 */
export interface ClassRosterEntry {
  id: string;
  joinedAt: string;
  leftAt: string | null;
  isActive: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    nickname: string | null;
    studentCode: string | null;
    status: string;
    primaryRole: string;
    avatarMediaId: string | null;
  };
}

export interface ClassListQuery extends ListQuery {
  gradeId?: string;
  termId?: string;
}
