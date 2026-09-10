import { apiDelete, apiDeleteReturning, apiGet, apiGetPaged, apiPatch, apiPost, apiPut, apiUpload } from '@/api';
import { env } from '@/lib/env';
import type { Paginated } from '@/api/types';
import type {
  ActivityDelivery,
  ActivityListQuery,
  ActivityStaffDetail,
  ActivitySummary,
  ContentReportListQuery,
  ContentReportRow,
  ContentOwnership,
  ContentTargetType,
  CreateContentReportInput,
  LessonDetail,
  LessonListQuery,
  AnswerOptionInput,
  AnswerOptionRow,
  HintInput,
  HintRow,
  LessonSection,
  LessonSectionInput,
  LessonSummary,
  MediaAsset,
  MediaListQuery,
  MediaRecord,
  MediaUsage,
  ModerationDecision,
  ModerationReviewListQuery,
  ModerationReviewRow,
  OwnershipListQuery,
  OwnershipRecord,
  PublicationListQuery,
  PublicationRecord,
  SetOwnershipInput,
  UpdateMediaInput,
  QuestionInput,
  QuestionRow,
  ResolveContentReportInput,
} from './content.types';

/**
 * Content endpoints — lessons, activities, media.
 *
 * `fetchActivityDelivery` is the one a student calls to actually take an
 * activity: `/activities/:id/deliver` strips every answer key server-side, so
 * there is no client-side trust boundary to get wrong. `fetchActivityStaff`
 * returns the full authoring view (with keys) and requires `activity.write`.
 */

export function fetchLessons(query?: LessonListQuery): Promise<Paginated<LessonSummary>> {
  return apiGetPaged<LessonSummary>('/lessons', query);
}

export function fetchLesson(lessonId: string): Promise<LessonDetail> {
  return apiGet<LessonDetail>(`/lessons/${encodeURIComponent(lessonId)}`);
}

export function createLesson(input: Record<string, unknown>): Promise<LessonDetail> {
  return apiPost<LessonDetail>('/lessons', input);
}

export function updateLesson(lessonId: string, input: Record<string, unknown>): Promise<LessonDetail> {
  return apiPatch<LessonDetail>(`/lessons/${encodeURIComponent(lessonId)}`, input);
}

export function setLessonStatus(lessonId: string, status: string): Promise<LessonDetail> {
  return apiPost<LessonDetail>(`/lessons/${encodeURIComponent(lessonId)}/status`, { status });
}

export function fetchActivities(query?: ActivityListQuery): Promise<Paginated<ActivitySummary>> {
  return apiGetPaged<ActivitySummary>('/activities', query);
}

/** Staff-only: includes answer keys. Requires `activity.write`. */
export function fetchActivityStaff(activityId: string): Promise<ActivityStaffDetail> {
  return apiGet<ActivityStaffDetail>(`/activities/${encodeURIComponent(activityId)}`);
}

/** The student-safe delivery payload. Throws if the activity is not published. */
export function fetchActivityDelivery(activityId: string): Promise<ActivityDelivery> {
  return apiGet<ActivityDelivery>(`/activities/${encodeURIComponent(activityId)}/deliver`);
}

export function createActivity(input: Record<string, unknown>): Promise<ActivityStaffDetail> {
  return apiPost<ActivityStaffDetail>('/activities', input);
}

export function updateActivity(
  activityId: string,
  input: Record<string, unknown>,
): Promise<ActivityStaffDetail> {
  return apiPatch<ActivityStaffDetail>(`/activities/${encodeURIComponent(activityId)}`, input);
}

export function setActivityStatus(activityId: string, status: string): Promise<ActivityStaffDetail> {
  return apiPost<ActivityStaffDetail>(`/activities/${encodeURIComponent(activityId)}/status`, {
    status,
  });
}

export function publishActivity(activityId: string): Promise<ActivityStaffDetail> {
  return apiPost<ActivityStaffDetail>(`/activities/${encodeURIComponent(activityId)}/publish`);
}

/**
 * Multipart upload (`POST /media`, `media.upload`).
 *
 * `isPublic` matters: branding assets are served without an auth check so the
 * login screen can show a school's logo before anyone has signed in, while
 * everything else defaults to private. Alt text is required by the media model
 * rather than optional — a logo nobody can see still has to say what it is.
 */
export function uploadMedia(
  file: File,
  meta: {
    altText?: string;
    caption?: string;
    transcript?: string;
    isPublic?: boolean;
    ownership?: ContentOwnership;
  },
  onProgress?: (percent: number) => void,
): Promise<MediaAsset> {
  const form = new FormData();
  form.append('file', file);
  if (meta.altText) form.append('altText', meta.altText);
  if (meta.caption) form.append('caption', meta.caption);
  if (meta.transcript) form.append('transcript', meta.transcript);
  if (meta.ownership) form.append('ownership', meta.ownership);
  form.append('isPublic', meta.isPublic ? 'true' : 'false');
  return apiUpload<MediaAsset>('/media', form, onProgress);
}

/** Direct URL to stream a media asset's bytes — use as an `<img src>` / `<audio src>`. */
export function mediaFileUrl(mediaId: string, disposition: 'inline' | 'attachment' = 'inline'): string {
  return `${env.apiBaseUrl}/media/${encodeURIComponent(mediaId)}/file?disposition=${disposition}`;
}

/** Same, but for the unauthenticated public media route (branding assets). */
export function publicMediaFileUrl(mediaId: string): string {
  return `${env.apiBaseUrl}/public/media/${encodeURIComponent(mediaId)}`;
}

// ── Governance: content reports and moderation ──────────────────────────────

/**
 * Reported content and what was decided about it.
 *
 * Access is asymmetric by design and enforced server-side: anyone signed in may
 * raise a report, but only `content.report.review` lists the school's reports.
 * A learner calling `fetchContentReports` silently receives only their own —
 * there is no client flag to get wrong. `mine` is the reviewer's own filter.
 */

export function fetchContentReports(
  query?: ContentReportListQuery,
): Promise<Paginated<ContentReportRow>> {
  return apiGetPaged<ContentReportRow>('/content-reports', query);
}

export function fetchContentReport(reportId: string): Promise<ContentReportRow> {
  return apiGet<ContentReportRow>(`/content-reports/${encodeURIComponent(reportId)}`);
}

/** Raise a report. Held by learners too, so keep the caller's copy age-appropriate. */
export function createContentReport(input: CreateContentReportInput): Promise<ContentReportRow> {
  return apiPost<ContentReportRow>('/content-reports', input);
}

/** Record the reviewer's decision and close the report. */
export function resolveContentReport(
  reportId: string,
  input: ResolveContentReportInput,
): Promise<ContentReportRow> {
  return apiPost<ContentReportRow>(
    `/content-reports/${encodeURIComponent(reportId)}/resolve`,
    input,
  );
}

export function fetchModerationReviews(
  query?: ModerationReviewListQuery,
): Promise<Paginated<ModerationReviewRow>> {
  return apiGetPaged<ModerationReviewRow>('/content-moderation-reviews', query);
}

/** A review with no report behind it — a proactive sweep rather than a response. */
export function createModerationReview(input: {
  targetType: ContentTargetType;
  targetId: string;
  reportId?: string;
  decision: ModerationDecision;
  notes?: string;
  escalatedToId?: string;
}): Promise<ModerationReviewRow> {
  return apiPost<ModerationReviewRow>('/content-moderation-reviews', input);
}

// ── Authoring: questions, answer options and hints ──────────────────────────

/**
 * The authoring half of an activity. All of it requires `activity.write`, and
 * all of it returns answer keys — these are the staff endpoints, never the ones
 * a learner touches (`fetchActivityDelivery` strips keys server-side).
 *
 * The server enforces an answer-key rule per question type: a multiple-choice
 * question needs two options and a correct one, a matching question needs a
 * `matchKey` on every option, and so on. `questionAnswerKeyIssues` in
 * `content-authoring.ts` mirrors those rules so the author is told before the
 * request rather than by a rejection.
 */

export function fetchActivityQuestions(activityId: string): Promise<QuestionRow[]> {
  return apiGet<QuestionRow[]>(`/activities/${encodeURIComponent(activityId)}/questions`);
}

export function createQuestion(activityId: string, input: QuestionInput): Promise<QuestionRow> {
  return apiPost<QuestionRow>(`/activities/${encodeURIComponent(activityId)}/questions`, input);
}

export function updateQuestion(
  activityId: string,
  questionId: string,
  input: Partial<QuestionInput>,
): Promise<QuestionRow> {
  return apiPatch<QuestionRow>(
    `/activities/${encodeURIComponent(activityId)}/questions/${encodeURIComponent(questionId)}`,
    input,
  );
}

export function deleteQuestion(activityId: string, questionId: string): Promise<QuestionRow> {
  return apiDeleteReturning<QuestionRow>(
    `/activities/${encodeURIComponent(activityId)}/questions/${encodeURIComponent(questionId)}`,
  );
}

/** Whole-list reorder: send every question with its new position, not a delta. */
export function reorderQuestions(
  activityId: string,
  items: { id: string; sortOrder: number }[],
): Promise<QuestionRow[]> {
  return apiPost<QuestionRow[]>(
    `/activities/${encodeURIComponent(activityId)}/questions/reorder`,
    { items },
  );
}

export function addAnswerOption(questionId: string, input: AnswerOptionInput): Promise<AnswerOptionRow> {
  return apiPost<AnswerOptionRow>(`/questions/${encodeURIComponent(questionId)}/options`, input);
}

export function updateAnswerOption(
  questionId: string,
  optionId: string,
  input: Partial<AnswerOptionInput>,
): Promise<AnswerOptionRow> {
  return apiPatch<AnswerOptionRow>(
    `/questions/${encodeURIComponent(questionId)}/options/${encodeURIComponent(optionId)}`,
    input,
  );
}

export function deleteAnswerOption(questionId: string, optionId: string): Promise<AnswerOptionRow> {
  return apiDeleteReturning<AnswerOptionRow>(
    `/questions/${encodeURIComponent(questionId)}/options/${encodeURIComponent(optionId)}`,
  );
}

export function addHint(questionId: string, input: HintInput): Promise<HintRow> {
  return apiPost<HintRow>(`/questions/${encodeURIComponent(questionId)}/hints`, input);
}

export function updateHint(
  questionId: string,
  hintId: string,
  input: Partial<HintInput>,
): Promise<HintRow> {
  return apiPatch<HintRow>(
    `/questions/${encodeURIComponent(questionId)}/hints/${encodeURIComponent(hintId)}`,
    input,
  );
}

export function deleteHint(questionId: string, hintId: string): Promise<HintRow> {
  return apiDeleteReturning<HintRow>(
    `/questions/${encodeURIComponent(questionId)}/hints/${encodeURIComponent(hintId)}`,
  );
}

// ── Authoring: lesson sections ──────────────────────────────────────────────

/**
 * A lesson's body is a list of sections, not one blob of text — so a worked
 * example can sit between two explanations and each part can be reordered
 * without retyping the rest. `fetchLesson` already returns them; these write.
 */

export function createLessonSection(
  lessonId: string,
  input: LessonSectionInput,
): Promise<LessonSection> {
  return apiPost<LessonSection>(`/lessons/${encodeURIComponent(lessonId)}/sections`, input);
}

export function updateLessonSection(
  lessonId: string,
  sectionId: string,
  input: Partial<LessonSectionInput>,
): Promise<LessonSection> {
  return apiPatch<LessonSection>(
    `/lessons/${encodeURIComponent(lessonId)}/sections/${encodeURIComponent(sectionId)}`,
    input,
  );
}

export function deleteLessonSection(lessonId: string, sectionId: string): Promise<LessonSection> {
  return apiDeleteReturning<LessonSection>(
    `/lessons/${encodeURIComponent(lessonId)}/sections/${encodeURIComponent(sectionId)}`,
  );
}

export function reorderLessonSections(
  lessonId: string,
  items: { id: string; sortOrder: number }[],
): Promise<LessonSection[]> {
  return apiPost<LessonSection[]>(`/lessons/${encodeURIComponent(lessonId)}/sections/reorder`, {
    items,
  });
}

// ── Ownership and licensing (blueprint 05) ───────────────────────────────────

export function fetchOwnershipRecords(query?: OwnershipListQuery): Promise<Paginated<OwnershipRecord>> {
  return apiGetPaged<OwnershipRecord>('/content-ownership', query);
}

/** Upsert on (targetType, targetId): recording a second time replaces the first. */
export function setOwnershipRecord(input: SetOwnershipInput): Promise<OwnershipRecord> {
  return apiPut<OwnershipRecord>('/content-ownership', input);
}

// ── Publication history (blueprint 12) ───────────────────────────────────────

export function fetchPublications(query?: PublicationListQuery): Promise<Paginated<PublicationRecord>> {
  return apiGetPaged<PublicationRecord>('/content-publications', query);
}

// ── Media library ────────────────────────────────────────────────────────────

export function fetchMedia(query?: MediaListQuery): Promise<Paginated<MediaRecord>> {
  return apiGetPaged<MediaRecord>('/media', query);
}

export function fetchMediaUsage(): Promise<MediaUsage> {
  return apiGet<MediaUsage>('/media/usage');
}

export function updateMedia(mediaId: string, input: UpdateMediaInput): Promise<MediaRecord> {
  return apiPatch<MediaRecord>(`/media/${encodeURIComponent(mediaId)}`, input);
}

export function moderateMedia(
  mediaId: string,
  input: { decision: ModerationDecision; notes?: string },
): Promise<MediaRecord> {
  return apiPost<MediaRecord>(`/media/${encodeURIComponent(mediaId)}/moderate`, input);
}

/** Soft delete: the file is kept and can be restored. */
export function deleteMedia(mediaId: string): Promise<void> {
  return apiDelete(`/media/${encodeURIComponent(mediaId)}`);
}

export function restoreMedia(mediaId: string): Promise<MediaRecord> {
  return apiPost<MediaRecord>(`/media/${encodeURIComponent(mediaId)}/restore`);
}
