import { describe, expect, it } from 'vitest';
import {
  CONTENT_STATUS_MOVE_LABEL,
  CONTENT_STATUS_TONE,
  CONTENT_STATUS_TRANSITIONS,
  nextContentStatuses,
} from './content-lifecycle';
import type { ContentStatus } from './content.types';

/**
 * The content lifecycle, mirrored from the backend's `STATUS_TRANSITIONS`.
 *
 * The blueprint is explicit that only authorised, approved content may be
 * published and that a published change becomes a revision rather than a silent
 * rewrite. The frontend copy exists so the UI offers only legal moves; if it
 * drifts from the server, an author is shown a button that will be refused.
 */

const ALL: ContentStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'REVISED',
  'ARCHIVED',
];

describe('content status transitions', () => {
  it('never lets a draft skip review and go straight to published', () => {
    expect(nextContentStatuses('DRAFT')).not.toContain('PUBLISHED');
    expect(nextContentStatuses('IN_REVIEW')).not.toContain('PUBLISHED');
  });

  it('only approved and revised content can be published', () => {
    const canPublish = ALL.filter((status) => nextContentStatuses(status).includes('PUBLISHED'));
    expect(canPublish.sort()).toEqual(['APPROVED', 'REVISED']);
  });

  it('published content revises rather than dropping back to draft', () => {
    const fromPublished = nextContentStatuses('PUBLISHED');
    expect(fromPublished).toContain('REVISED');
    expect(fromPublished).not.toContain('DRAFT');
  });

  it('everything except archived can be archived, and archived can only be reopened', () => {
    for (const status of ALL) {
      if (status === 'ARCHIVED') continue;
      expect(nextContentStatuses(status)).toContain('ARCHIVED');
    }
    expect(nextContentStatuses('ARCHIVED')).toEqual(['DRAFT']);
  });

  it('offers no move that loops back to the current state', () => {
    for (const status of ALL) {
      expect(nextContentStatuses(status)).not.toContain(status);
    }
  });

  it('every status has a label and a tone, so no move renders untitled', () => {
    for (const status of ALL) {
      expect(CONTENT_STATUS_MOVE_LABEL[status]).toBeTruthy();
      expect(CONTENT_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it('names only real statuses as destinations', () => {
    for (const destinations of Object.values(CONTENT_STATUS_TRANSITIONS)) {
      for (const destination of destinations) {
        expect(ALL).toContain(destination);
      }
    }
  });
});
