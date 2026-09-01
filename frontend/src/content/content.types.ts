import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/content` — lessons, activities, questions, media. */

export type ContentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REVISED' | 'ARCHIVED';
export type ContentOwnership = 'MIDAS_ORIGINAL' | 'SCHOOL_OWNED' | 'SCHOOL_LICENSED' | 'THIRD_PARTY_LICENSED' | 'CO_CREATED';
export type DifficultyBand = 'FOUNDATION' | 'DEVELOPING' | 'SECURE' | 'CHALLENGE' | 'EXTENSION';
export type AgeMode = 'EARLY_YEARS' | 'PRIMARY' | 'LOWER_SECONDARY' | 'UPPER_SECONDARY' | 'ADULT';
export type ActivityType =
  | 'EXPLANATION'
  | 'WORKED_EXAMPLE'
  | 'MULTIPLE_CHOICE'
  | 'NUMERIC_RESPONSE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'SORTING'
  | 'PRACTICE_SEQUENCE'
  | 'MINI_GAME'
  | 'QUIZ'
  | 'TEACHER_TASK';
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMERIC' | 'SHORT_TEXT' | 'MATCHING' | 'SORTING';

export interface LessonSummary {
  id: string;
  schoolId: string;
  subjectId: string;
  topicId: string;
  title: string;
  key: string;
  summary: string | null;
  ownership: ContentOwnership;
  difficultyBand: DifficultyBand;
  estimatedMinutes: number | null;
  ageMode: AgeMode | null;
  sortOrder: number;
  status: ContentStatus;
  version: number;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { sections: number; activities: number };
}

export interface LessonSection {
  id: string;
  heading: string;
  body: string;
  kind: string;
  sortOrder: number;
  mediaId: string | null;
}

export interface LessonActivitySummary {
  id: string;
  title: string;
  key: string;
  type: ActivityType;
  status: ContentStatus;
  difficultyBand: DifficultyBand;
  estimatedMinutes: number | null;
  pointsValue: number;
  sortOrder: number;
  currentVersion: number;
}

export interface LessonDetail extends LessonSummary {
  body: string;
  requiresAudio: boolean;
  heroMediaId: string | null;
  topic: { id: string; name: string; key: string; masteryThreshold: number };
  subject: { id: string; name: string; key: string; colorHex: string | null };
  sections: LessonSection[];
  activities: LessonActivitySummary[];
}

export interface LessonListQuery extends ListQuery {
  topicId?: string;
  unitId?: string;
  subjectId?: string;
  status?: ContentStatus;
  difficultyBand?: DifficultyBand;
  ageMode?: AgeMode;
  includeArchived?: boolean;
}

export interface ActivitySummary {
  id: string;
  title: string;
  key: string;
  type: ActivityType;
  status: ContentStatus;
  difficultyBand: DifficultyBand;
  estimatedMinutes: number | null;
  pointsValue: number;
  topicId: string;
  subjectId: string;
  lessonId: string | null;
  currentVersion: number;
}

export interface ActivityListQuery extends ListQuery {
  topicId?: string;
  subjectId?: string;
  lessonId?: string;
  status?: ContentStatus;
  type?: ActivityType;
  includeArchived?: boolean;
}

export interface QuestionOption {
  id: string;
  label: string;
  sortOrder: number;
  mediaId: string | null;
}

export interface QuestionHint {
  id: string;
  body: string;
  sortOrder: number;
  pointsCost: number;
}

/** The delivery payload — answer keys stripped, so this is safe to send a student. */
export interface DeliveryQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  config: unknown;
  promptMediaId: string | null;
  difficultyBand: DifficultyBand;
  pointsValue: number;
  sortOrder: number;
  timeLimitSeconds: number | null;
  objectiveId: string | null;
  options: QuestionOption[];
  hints: QuestionHint[];
}

export interface ActivityDelivery {
  id: string;
  title: string;
  type: ActivityType;
  instructions: string | null;
  config: unknown;
  status: 'PUBLISHED';
  currentVersion: number;
  difficultyBand: DifficultyBand;
  estimatedMinutes: number | null;
  pointsValue: number;
  maxAttempts: number | null;
  passThreshold: number | null;
  thumbnailMediaId: string | null;
  topicId: string;
  subjectId: string;
  lessonId: string | null;
  questions: DeliveryQuestion[];
  version: { id: string; version: number; publishedAt: string } | null;
}

export interface MediaAsset {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
}

/** Full staff view of an activity, including answer keys — never send to a student. */
export interface ActivityStaffDetail extends ActivitySummary {
  instructions: string | null;
  config: unknown;
  maxAttempts: number | null;
  passThreshold: number | null;
  questions: (DeliveryQuestion & {
    options: (QuestionOption & { isCorrect?: boolean })[];
  })[];
}
