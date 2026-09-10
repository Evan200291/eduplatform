import type { ListQuery } from '@/api/types';
import type { PathItemStatus } from '@/learning/learning.types';

/** Mirrors `backend/src/modules/progress` — engagement records, distinct from mastery. */

export interface ProgressRecord {
  id: string;
  studentId: string;
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  status: PathItemStatus;
  completionPercent: number;
  attemptCount: number;
  bestScorePercent: number | null;
  lastScorePercent: number | null;
  timeSpentSeconds: number;
  hintsUsed: number;
  firstStartedAt: string | null;
  lastActivityAt: string | null;
  completedAt: string | null;
  topic: { id: string; name: string; subjectId: string } | null;
  lesson: { id: string; title: string } | null;
  activity: { id: string; title: string; type: string; estimatedMinutes: number | null } | null;
}

export interface ProgressSummary {
  groupBy: 'TOPIC' | 'LESSON' | 'DAY';
  totals: {
    activitiesTouched: number;
    activitiesCompleted: number;
    attempts: number;
    timeSpentSeconds: number;
    hintsUsed: number;
    lastActivityAt: string | null;
  };
  groups: {
    key: string;
    label: string;
    activities: number;
    completed: number;
    attempts: number;
    timeSpentSeconds: number;
    hintsUsed: number;
    averageBestScorePercent: number | null;
  }[];
}

export interface ProgressListQuery extends ListQuery {
  studentId?: string;
  topicId?: string;
}

export type NoteKind = 'OBSERVATION' | 'INTERVENTION' | 'ASSESSMENT_JUDGMENT' | 'PARENT_COMMUNICATION' | 'ADMINISTRATIVE';
export type NoteVisibility = 'PRIVATE_TEACHER' | 'AUTHORIZED_STAFF' | 'SCHOOL_RECORD' | 'PARENT_VISIBLE';
export type NoteSensitivity = 'ROUTINE' | 'SENSITIVE' | 'SAFEGUARDING';

/** Mirrors `NOTE_SELECT` in `notes.service.ts`. */
export interface TeacherNote {
  id: string;
  studentId: string;
  authorId: string;
  kind: NoteKind;
  visibility: NoteVisibility;
  sensitivity: NoteSensitivity;
  title: string | null;
  body: string;
  followUpDueAt: string | null;
  followUpDoneAt: string | null;
  escalatedAt: string | null;
  escalatedToId: string | null;
  withdrawnAt: string | null;
  withdrawnById: string | null;
  withdrawReason: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; primaryRole: string };
}

export interface NoteInput {
  kind?: NoteKind;
  visibility?: NoteVisibility;
  sensitivity?: NoteSensitivity;
  title?: string;
  body?: string;
  followUpDueAt?: string;
  followUpDone?: boolean;
}

/** Mirrors `JUDGMENT_SELECT` in `progress.service.ts` — a teacher's recorded judgment. */
export interface TeacherJudgment {
  id: string;
  studentId: string;
  teacherId: string;
  subjectId: string | null;
  topicId: string | null;
  level: string;
  band: string | null;
  comment: string | null;
  countsAsEvidence: boolean;
  assessedAt: string;
  createdAt: string;
  teacher: { id: string; displayName: string };
  subject: { id: string; name: string } | null;
  topic: { id: string; name: string } | null;
}

/** `GET /progress/classes/:id` — one engagement row per learner in the class. */
export interface ClassProgress {
  classId: string;
  students: {
    student: { id: string; firstName: string; lastName: string; displayName: string };
    activitiesTouched: number;
    attempts: number;
    timeSpentSeconds: number;
    lastActivityAt: string | null;
    /** Count of topics at each mastery level, e.g. `{ PROFICIENT: 3 }`. */
    masteryByLevel: Partial<Record<string, number>>;
  }[];
}
