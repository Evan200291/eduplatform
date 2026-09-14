import { describe, expect, it } from 'vitest';
import { idlePhase } from './idle';

describe('idlePhase', () => {
  const minute = 60_000;

  it('stays active well inside the limit', () => {
    expect(idlePhase(0, 10 * minute, 120 * minute)).toBe('active');
  });

  it('warns in the last minute', () => {
    expect(idlePhase(0, 119.5 * minute, 120 * minute)).toBe('warning');
  });

  it('expires at the limit', () => {
    expect(idlePhase(0, 120 * minute, 120 * minute)).toBe('expired');
  });

  it('never warns for more than half of a very short limit', () => {
    expect(idlePhase(0, 0.4 * minute, 1 * minute)).toBe('active');
  });
});
