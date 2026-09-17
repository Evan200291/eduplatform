import { describe, expect, it } from 'vitest';
import { nextActionPath } from './next-action-path';
import { paths } from '@/routes/paths';
import type { LearnerAction, LearnerActionKind } from './dashboard.types';

function action(kind: LearnerActionKind): LearnerAction {
  return { kind, label: 'x', reason: 'x', targetId: null, targetType: null };
}

describe('nextActionPath', () => {
  it('sends an unfinished screening to the screening page', () => {
    expect(nextActionPath(action('FINISH_SCREENING'))).toBe(paths.learn.screening);
  });

  it('sends every assignment-shaped action to My progress, where starting works', () => {
    for (const kind of ['FINISH_OVERDUE', 'RESUME_ACTIVITY', 'START_ASSIGNMENT'] as const) {
      expect(nextActionPath(action(kind))).toBe(paths.learn.progress);
    }
  });

  it('sends a mission action to Missions', () => {
    expect(nextActionPath(action('FINISH_MISSION'))).toBe(paths.learn.missions);
  });

  it('never returns undefined for any known kind', () => {
    const kinds: LearnerActionKind[] = [
      'FINISH_SCREENING',
      'FINISH_OVERDUE',
      'RESUME_ACTIVITY',
      'START_ASSIGNMENT',
      'CONTINUE_PATH',
      'FINISH_MISSION',
      'PRACTISE_TOPIC',
      'EXPLORE',
    ];
    for (const kind of kinds) {
      expect(typeof nextActionPath(action(kind))).toBe('string');
    }
  });
});
