import { afterEach, describe, expect, it } from 'vitest';
import { applyAgeMode, isYoungLearner } from './age-mode';

describe('applyAgeMode', () => {
  afterEach(() => {
    delete document.documentElement.dataset.ageMode;
    delete document.documentElement.dataset.kid;
  });

  it('turns the kid layer on for early years and primary', () => {
    applyAgeMode('EARLY_YEARS');
    expect(document.documentElement.dataset.ageMode).toBe('EARLY_YEARS');
    expect(document.documentElement.hasAttribute('data-kid')).toBe(true);

    applyAgeMode('PRIMARY');
    expect(document.documentElement.hasAttribute('data-kid')).toBe(true);
  });

  it('leaves it off for everyone else, and removes it when the mode changes', () => {
    applyAgeMode('PRIMARY');
    applyAgeMode('LOWER_SECONDARY');
    expect(document.documentElement.hasAttribute('data-kid')).toBe(false);

    applyAgeMode('ADULT');
    expect(document.documentElement.hasAttribute('data-kid')).toBe(false);
  });

  it('agrees with isYoungLearner', () => {
    expect(isYoungLearner('EARLY_YEARS')).toBe(true);
    expect(isYoungLearner('PRIMARY')).toBe(true);
    expect(isYoungLearner('LOWER_SECONDARY')).toBe(false);
  });
});
