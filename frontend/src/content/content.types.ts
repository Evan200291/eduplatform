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
  objectiveLinks?: ActivityObjectiveLink[];
}

// ── Governance: content reports and moderation (blueprint §05 safety) ────────

/** Mirrors `ModerationDecision` in `04-enums-operations.prisma`. */
export type ModerationDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'REMOVED';

/** Mirrors `ContentReportReason`. */
export type ContentReportReason =
  | 'FACTUAL_ERROR'
  | 'INAPPROPRIATE_CONTENT'
  | 'BROKEN_ACTIVITY'
  | 'WRONG_ANSWER_KEY'
  | 'AGE_UNSUITABLE'
  | 'COPYRIGHT_CONCERN'
  | 'OTHER';

/** Mirrors `CONTENT_TARGET_TYPES` in `content.validation.ts`. */
export type ContentTargetType =
  | 'CURRICULUM_PROGRAM'
  | 'UNIT'
  | 'TOPIC'
  | 'LESSON'
  | 'ACTIVITY'
  | 'MEDIA';

export interface ContentReportRow {
  id: string;
  schoolId: string;
  reporterId: string;
  reporter: { id: string; displayName: string; primaryRole: string } | null;
  lessonId: string | null;
  lesson: { id: string; title: string } | null;
  activityId: string | null;
  activity: { id: string; title: string; type: ActivityType } | null;
  targetType: string | null;
  targetId: string | null;
  reason: ContentReportReason;
  details: string | null;
  decision: ModerationDecision;
  resolutionNotes: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { reviews: number };
}

export interface ModerationReviewRow {
  id: string;
  reportId: string | null;
  targetType: ContentTargetType;
  targetId: string;
  reviewerId: string | null;
  reviewer: { id: string; displayName: string } | null;
  decision: ModerationDecision;
  notes: string | null;
  escalatedToId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ContentReportListQuery extends ListQuery {
  decision?: ModerationDecision;
  reason?: ContentReportReason;
  lessonId?: string;
  activityId?: string;
  /** A reviewer narrowing the list to their own reports; learners are restricted server-side. */
  mine?: boolean;
}

export interface ModerationReviewListQuery extends ListQuery {
  targetType?: ContentTargetType;
  targetId?: string;
  decision?: ModerationDecision;
  reportId?: string;
}

export interface ResolveContentReportInput {
  decision: ModerationDecision;
  resolutionNotes?: string;
  /** Set when handing the case to platform safety staff. */
  escalatedToId?: string;
}

export interface CreateContentReportInput {
  lessonId?: string;
  activityId?: string;
  targetType?: ContentTargetType;
  targetId?: string;
  reason: ContentReportReason;
  details?: string;
}

// ── Authoring: questions, answer options and hints ──────────────────────────

export interface AnswerOptionRow {
  id: string;
  questionId: string;
  label: string;
  isCorrect: boolean;
  sortOrder: number;
  feedback: string | null;
  /** Pairs a MATCHING option with its partner; groups a SORTING bucket. */
  matchKey: string | null;
  mediaId: string | null;
}

export interface HintRow {
  id: string;
  questionId: string;
  body: string;
  sortOrder: number;
  /** Recorded, not punished — the blueprint tracks hint use rather than charging for it. */
  pointsCost: number;
}

export interface QuestionRow {
  id: string;
  activityId: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  difficultyBand: DifficultyBand;
  pointsValue: number;
  sortOrder: number;
  timeLimitSeconds: number | null;
  promptMediaId: string | null;
  objectiveId: string | null;
  objective: { id: string; code: string; statement: string } | null;
  correctNumeric: number | null;
  numericTolerance: number | null;
  correctBoolean: boolean | null;
  correctText: string[] | null;
  options: AnswerOptionRow[];
  hints: HintRow[];
}

export interface AnswerOptionInput {
  label: string;
  isCorrect?: boolean;
  sortOrder?: number;
  feedback?: string;
  matchKey?: string;
}

export interface HintInput {
  body: string;
  sortOrder?: number;
  pointsCost?: number;
}

export interface QuestionInput {
  type: QuestionType;
  prompt: string;
  explanation?: string;
  difficultyBand?: DifficultyBand;
  pointsValue?: number;
  sortOrder?: number;
  correctNumeric?: number | null;
  numericTolerance?: number | null;
  correctBoolean?: boolean | null;
  correctText?: string[] | null;
  options?: AnswerOptionInput[];
  hints?: HintInput[];
}

export interface LessonSectionInput {
  heading: string;
  body: string;
  /** EXPLANATION or WORKED_EXAMPLE in practice; the server accepts any activity type. */
  kind?: ActivityType;
  sortOrder?: number;
}

// ── Ownership and publication history (blueprint 05, 12) ─────────────────────


/** Mirrors `ContentOwnershipRecord` — one row per target, upserted. */
export interface OwnershipRecord {
  id: string;
  schoolId: string;
  targetType: ContentTargetType;
  targetId: string;
  ownership: ContentOwnership;
  licenseHolder: string | null;
  licenseReference: string | null;
  licenseStartsAt: string | null;
  licenseEndsAt: string | null;
  canRedistribute: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface OwnershipListQuery extends ListQuery {
  targetType?: ContentTargetType;
  ownership?: ContentOwnership;
}

export interface SetOwnershipInput {
  targetType: ContentTargetType;
  targetId: string;
  ownership: ContentOwnership;
  licenseHolder?: string;
  licenseReference?: string;
  licenseStartsAt?: string;
  licenseEndsAt?: string;
  canRedistribute: boolean;
  notes?: string;
}

/** Mirrors `ContentPublication` with its lesson/activity included. */
export interface PublicationRecord {
  id: string;
  lessonId: string | null;
  activityId: string | null;
  version: number;
  status: ContentStatus;
  changeSummary: string | null;
  reviewNotes: string | null;
  reviewedById: string | null;
  publishedById: string | null;
  effectiveFrom: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  lesson: { id: string; title: string } | null;
  activity: { id: string; title: string; type: ActivityType } | null;
}

export interface PublicationListQuery extends ListQuery {
  lessonId?: string;
  activityId?: string;
  status?: ContentStatus;
}

// ── Media library (blueprint 07 accessibility, 09 storage) ───────────────────

export type MediaKind = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'DOCUMENT' | 'ANIMATION' | 'ARCHIVE';

/** Mirrors `MEDIA_SELECT` in `media.service.ts`. */
export interface MediaRecord {
  id: string;
  schoolId: string | null;
  kind: MediaKind;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  altText: string | null;
  caption: string | null;
  transcript: string | null;
  ownership: ContentOwnership;
  licenseNote: string | null;
  attribution: string | null;
  moderationDecision: ModerationDecision;
  moderatedAt: string | null;
  moderatedById: string | null;
  isPublic: boolean;
  uploadedById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MediaListQuery extends ListQuery {
  kind?: MediaKind;
  moderationDecision?: ModerationDecision;
  ownership?: ContentOwnership;
  includeDeleted?: boolean;
  includePlatformLibrary?: boolean;
}

export interface MediaUsage {
  assetCount: number;
  recordedBytes: number;
  storedBytes: number;
  maxUploadBytes: number;
  byKind: { kind: MediaKind; assetCount: number; bytes: number }[];
}

export interface UpdateMediaInput {
  fileName?: string;
  altText?: string;
  caption?: string;
  transcript?: string;
  ownership?: ContentOwnership;
  licenseNote?: string;
  attribution?: string;
  isPublic?: boolean;
}

/** `GET /activities/:id/versions` — one row per saved version, newest first. */
export interface ActivityVersionRow {
  id: string;
  activityId: string;
  version: number;
  status: ContentStatus;
  changeSummary: string | null;
  invalidatesPriorEvidence: boolean;
  createdAt: string;
  publishedAt: string | null;
  createdById: string | null;
}

/** The objective links on the staff activity view (`objectiveLinks`). */
export interface ActivityObjectiveLink {
  objectiveId: string;
  weight: number;
  objective: { id: string; code: string; statement: string };
}
