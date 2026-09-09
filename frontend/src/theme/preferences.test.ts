import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPreferences } from './preferences';

/**
 * Per-user accessibility preferences.
 *
 * These outrank the school's branding by design — a school chooses its colours,
 * not whether a photosensitive child has to watch things move — so the thing
 * worth testing is that each preference actually lands on `<html>`, where the
 * CSS outside `@layer` can act on it.
 *
 * `usePreferences` reads storage and touches the document at module scope, so
 * these tests drive `applyPreferences` directly rather than importing the store
 * and fighting its initialisation.
 */

describe('applyPreferences', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.motion;
    delete document.documentElement.dataset.contrast;
    delete document.documentElement.dataset.font;
  });

  it('writes the text scale as a CSS custom property', () => {
    applyPreferences({ textScale: 1.3, motion: 'system', highContrast: false, dyslexiaFont: false });
    expect(document.documentElement.style.getPropertyValue('--midas-user-text-scale')).toBe('1.3');
  });

  it('records the motion choice, including an explicit "full"', () => {
    applyPreferences({ textScale: 1, motion: 'reduced', highContrast: false, dyslexiaFont: false });
    expect(document.documentElement.dataset.motion).toBe('reduced');

    // "full" is a deliberate choice that must beat the OS hint, so it is stamped
    // rather than left absent.
    applyPreferences({ textScale: 1, motion: 'full', highContrast: false, dyslexiaFont: false });
    expect(document.documentElement.dataset.motion).toBe('full');
  });

  it('always stamps contrast and font, so a cleared preference is not sticky', () => {
    applyPreferences({ textScale: 1, motion: 'system', highContrast: true, dyslexiaFont: true });
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(document.documentElement.dataset.font).toBe('dyslexia');

    applyPreferences({ textScale: 1, motion: 'system', highContrast: false, dyslexiaFont: false });
    expect(document.documentElement.dataset.contrast).toBe('normal');
    expect(document.documentElement.dataset.font).toBe('default');
  });

  it('applies every preference in one pass', () => {
    applyPreferences({ textScale: 1.5, motion: 'reduced', highContrast: true, dyslexiaFont: true });
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--midas-user-text-scale')).toBe('1.5');
    expect(root.dataset.motion).toBe('reduced');
    expect(root.dataset.contrast).toBe('high');
    expect(root.dataset.font).toBe('dyslexia');
  });
});

describe('storage failures', () => {
  const original = window.localStorage;

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
  });

  it('a throwing localStorage does not stop preferences reaching the document', () => {
    // Private browsing and blocked site data both throw on access. Losing the
    // saved value is acceptable; failing to render is not.
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error('blocked');
        }),
        setItem: vi.fn(() => {
          throw new Error('blocked');
        }),
      },
    });

    expect(() =>
      applyPreferences({ textScale: 1, motion: 'system', highContrast: false, dyslexiaFont: false }),
    ).not.toThrow();
  });
});
