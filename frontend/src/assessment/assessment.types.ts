import type { ListQuery } from '@/api/types';
import type { ContentStatus, DeliveryQuestion, DifficultyBand } from '@/content/content.types';

/** Mirrors `backend/src/modules/assessment` — screening/topic assessments and attempts. */

export type AssessmentKind = 'SCREENING' | 'ONGOING_CHECK' | 'TOPIC_CHECK' | 'REASSESSMENT' | 'TEACHER_ASSIGNED';
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';
export type MasteryLevel = 'NOT_ASSESSED' | 'EMERGING' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';
export type EvidenceSource = 'SYSTEM_ASSESSMENT' | 'PRACTICE_ACTIVITY' | 'ASSIGNMENT_COMPLETION' | 'TEACHER_JUDGMENT';
export type EvidenceConfidence = 'INSUFFICIENT' | 'LOW' | 'MODERATE' | 'HIGH';

export interface AssessmentDefinition {
  id: string;
  subjectId: string;
  topicId: string | null;
  kind: AssessmentKind;
  status: ContentStatus;
  title: string;
  key: string;
  description: string | null;
  itemTarget: number | null;
  timeLimitMinutes: number | null;
  adaptiveEnabled: boolean;
  startingBand: DifficultyBand;
  passThreshold: number;
  maxAttempts: number | null;
  cooldownDays: number | null;
  driveRecommendations: boolean;
  shuffleItems: boolean;
  showFeedbackImmediately: boolean;
  subject: { id: string; name: string; key: string };
  topic: { id: string; name: string; key: string } | null;
  _count: { items: number; attempts: number };
}

export interface AssessmentItem {
  id: string;
  assessmentId: string;
  activityId: string;
  sortOrder: number;
  difficultyBand: DifficultyBand;
  weight: number;
  isAdaptiveEntry: boolean;
  activity: { id: string; title: string; key: string; type: string; status: ContentStatus; difficultyBand: DifficultyBand };
}

export interface AssessmentDetail extends AssessmentDefinition {
  items: AssessmentItem[];
}

export interface CreateAssessmentInput {
  subjectId: string;
  topicId?: string;
  kind: AssessmentKind;
  title: string;
  key?: string;
  description?: string;
  itemTarget?: number;
  timeLimitMinutes?: number;
  adaptiveEnabled?: boolean;
  startingBand?: DifficultyBand;
  passThreshold?: number;
  maxAttempts?: number;
  cooldownDays?: number;
  driveRecommendations?: boolean;
  shuffleItems?: boolean;
  showFeedbackImmediately?: boolean;
}

export interface AssessmentAttempt {
  id: string;
  assessmentId: string;
  studentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  scorePercent: number | null;
  itemsPresented: number;
  itemsCorrect: number;
  timeSpentSeconds: number;
  isPractice: boolean;
  assessment: { id: string; title: string; key: string; kind: AssessmentKind; subjectId: string; topicId: string | null };
}

export type NextItemResult =
  | { done: true; itemsAnswered: number; itemsTotal: number; currentBand: DifficultyBand }
  | {
      done: false;
      itemsAnswered: number;
      itemsTotal: number;
      currentBand: DifficultyBand;
      item: {
        itemId: string;
        activityId: string;
        activityVersionId: string;
        version: number;
        difficultyBand: DifficultyBand;
        title: string;
        type: string;
        instructions: string | null;
        config: unknown;
        estimatedMinutes: number | null;
        ageMode: string | null;
        questions: DeliveryQuestion[];
      };
    };

export interface ResponseInput {
  optionIds?: string[];
  booleanValue?: boolean;
  numericValue?: number;
  textValue?: string;
  pairs?: { optionId: string; matchKey: string }[];
  orderedOptionIds?: string[];
  skipped?: boolean;
}

export interface SubmitResponseInput {
  questionId: string;
  response: ResponseInput;
  hintsUsed?: number;
  attemptsUsed?: number;
  timeSpentSeconds?: number;
}

export interface SubmitResponseResult {
  recorded: true;
  questionId: string;
  isCorrect?: boolean;
  pointsAwarded?: number;
  pointsPossible?: number;
  feedback?: string;
}

export interface SubmitAttemptResult {
  attemptId: string;
  status: 'COMPLETED';
  scorePercent: number;
  scoreRaw: number;
  scoreMax: number;
  itemsPresented: number;
  itemsCorrect: number;
  questionsAnswered: number;
  passed: boolean;
  skippedAsDuplicate: number;
}

export interface MasteryRecord {
  id: string;
  subjectId: string;
  topicId: string;
  objectiveId: string | null;
  level: MasteryLevel;
  band: DifficultyBand;
  scorePercent: number;
  evidenceSource: EvidenceSource;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  teacherOverride: boolean;
  overrideNote: string | null;
  firstEvidenceAt: string | null;
  lastEvidenceAt: string | null;
  masteredAt: string | null;
  reviewDueAt: string | null;
  topic: { id: string; name: string; key: string; masteryThreshold: number };
  objective: { id: string; code: string; statement: string } | null;
}

export interface StudentMastery {
  studentId: string;
  topics: MasteryRecord[];
  objectives: MasteryRecord[];
  summary: {
    totalTracked: number;
    teacherOverridden: number;
    fromSystemEvidence: number;
    dueForReview: number;
    averagePercent: number;
  };
}

export interface AttemptListQuery extends ListQuery {
  studentId?: string;
  assessmentId?: string;
  status?: AttemptStatus;
}
