import type { BadgeTone } from '@/components/ui';
import type { ContentStatus } from './content.types';

/**
 * Mirrors `STATUS_TRANSITIONS` in `backend/src/modules/curriculum/curriculum.service.ts`
 * — the same five-state lifecycle backs programs, units, topics, lessons and
 * activities. Kept here rather than re-derived per screen so every write
 * surface offers exactly the moves the backend will actually accept; the
 * backend still re-validates, this only stops a user from clicking a button
 * that was always going to 400.
 */
export const CONTENT_STATUS_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['APPROVED', 'DRAFT', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
  PUBLISHED: ['REVISED', 'ARCHIVED'],
  REVISED: ['IN_REVIEW', 'PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export const CONTENT_STATUS_MOVE_LABEL: Record<ContentStatus, string> = {
  DRAFT: 'Send back to draft',
  IN_REVIEW: 'Submit for review',
  APPROVED: 'Approve',
  PUBLISHED: 'Publish',
  REVISED: 'Start a revision',
  ARCHIVED: 'Archive',
};

export const CONTENT_STATUS_TONE: Record<ContentStatus, BadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'info',
  APPROVED: 'brand',
  PUBLISHED: 'success',
  REVISED: 'warning',
  ARCHIVED: 'danger',
};

export function nextContentStatuses(current: ContentStatus): ContentStatus[] {
  return CONTENT_STATUS_TRANSITIONS[current];
}
