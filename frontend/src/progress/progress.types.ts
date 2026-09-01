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

export interface TeacherNote {
  id: string;
  studentId: string;
  authorId: string;
  body: string;
  visibility: 'PRIVATE_TEACHER' | 'AUTHORIZED_STAFF' | 'SCHOOL_RECORD' | 'PARENT_VISIBLE';
  isSensitive: boolean;
  createdAt: string;
  author: { id: string; displayName: string };
}
