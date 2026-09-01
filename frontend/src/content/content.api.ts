import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import { env } from '@/lib/env';
import type { Paginated } from '@/api/types';
import type {
  ActivityDelivery,
  ActivityListQuery,
  ActivityStaffDetail,
  ActivitySummary,
  LessonDetail,
  LessonListQuery,
  LessonSummary,
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

/** Direct URL to stream a media asset's bytes — use as an `<img src>` / `<audio src>`. */
export function mediaFileUrl(mediaId: string, disposition: 'inline' | 'attachment' = 'inline'): string {
  return `${env.apiBaseUrl}/media/${encodeURIComponent(mediaId)}/file?disposition=${disposition}`;
}

/** Same, but for the unauthenticated public media route (branding assets). */
export function publicMediaFileUrl(mediaId: string): string {
  return `${env.apiBaseUrl}/public/media/${encodeURIComponent(mediaId)}`;
}
