import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/assignments` — homework, tasks, missions' cousin. */

export type AssignmentKind = 'LESSON' | 'ACTIVITY' | 'QUIZ' | 'ASSESSMENT' | 'MISSION' | 'HOMEWORK' | 'TASK';
export type AssignmentState = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'OVERDUE' | 'EXCUSED';
/** Mirrors the Prisma `LateBehavior` enum. */
export type LateBehavior = 'BLOCK_AFTER_DUE' | 'ALLOW_LATE_FLAGGED' | 'ALLOW_LATE_SILENT' | 'ALLOW_UNTIL_GRACE_END';

export interface Assignment {
  id: string;
  title: string;
  instructions: string | null;
  kind: AssignmentKind;
  availableFrom: string | null;
  dueAt: string | null;
  pointsValue: number;
  lateBehavior: LateBehavior;
  graceHours: number | null;
  allowResubmission: boolean;
  maxAttempts: number | null;
  subjectId: string | null;
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  assessmentId: string | null;
  isPublished: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface AssignmentAttempt {
  id: string;
  assignmentId: string;
  studentId: string;
  state: AssignmentState;
  attemptNumber: number;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  isLate: boolean;
  scorePercent: number | null;
  pointsAwarded: number | null;
  timeSpentSeconds: number;
  assessmentAttemptId: string | null;
  excusedById: string | null;
  excusedAt: string | null;
  excusedReason: string | null;
  teacherFeedback: string | null;
  feedbackById: string | null;
  feedbackAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: { id: string; firstName: string; lastName: string; displayName: string };
  assignment: {
    id: string;
    title: string;
    kind: AssignmentKind;
    dueAt: string | null;
    pointsValue: number;
    lateBehavior: LateBehavior;
    graceHours: number | null;
    allowResubmission: boolean;
    maxAttempts: number | null;
    subjectId: string | null;
    topicId: string | null;
    lessonId: string | null;
    activityId: string | null;
    assessmentId: string | null;
    /** Not in the server's attempt select yet (`ATTEMPT_SELECT`); shown once it is. */
    estimatedMinutes?: number | null;
  };
}

export interface MyWork {
  byState: Record<AssignmentState, number>;
  outstanding: number;
  overdue: number;
  awaitingFeedback: number;
  upcoming: AssignmentAttempt[];
}

export interface AssignmentListQuery extends ListQuery {
  mine?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  classId?: string;
}
