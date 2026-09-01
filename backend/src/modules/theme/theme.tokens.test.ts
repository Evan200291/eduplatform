// ─────────────────────────────────────────────────────────────────────────────
// Token compiler tests
// The compiler is a pure function, so it can be checked exactly — and it is the piece
// of the theme system whose failures are silent. A wrong derived colour does not throw;
// it ships a button nobody can read.
//
// The assertion that earns its keep is the last one: every preset in theme.presets.ts
// is compiled and checked against the same blocking contrast pairs the publish path
// uses. A preset that fails that check would hand a school an unpublishable starting
// point, and the comment in theme.presets.ts claiming otherwise would be a lie.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { THEME_DEFAULTS, THEME_PRESETS, withDefaults } from './theme.presets';
import {
  applyOverlay,
  compileTokens,
  contrastRatio,
  contrastWarnings,
  isTokenTree,
  mix,
  readableOn,
  relativeLuminance,
  tokensToCss,
} from './theme.tokens';

const base = withDefaults(THEME_DEFAULTS, 'test-theme');

describe('colour maths', () => {
  it('puts black on white at the top of the WCAG range', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
  });

  it('gives an identical pair a ratio of 1', () => {
    expect(contrastRatio('#4F46E5', '#4F46E5')).toBe(1);
  });

  it('reads three-digit hex the same as six', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#FFFFFF'), 10);
  });

  it('mixes towards the second colour by weight', () => {
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#ffffff');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('picks a label colour that is actually legible', () => {
    expect(readableOn('#111827')).toBe('#FFFFFF');
    expect(readableOn('#FDE68A')).toBe('#111827');
  });
});

describe('compileTokens', () => {
  it('derives a full family from each brand colour', () => {
    const tokens = compileTokens(base);
    for (const name of ['primary', 'secondary', 'accent', 'success', 'warning', 'danger']) {
      expect(tokens.color[name]).toBeDefined();
      expect(tokens.color[`${name}-soft`]).toBeDefined();
      expect(tokens.color[`${name}-muted`]).toBeDefined();
      expect(tokens.color[`${name}-strong`]).toBeDefined();
      expect(tokens.color[`${name}-contrast`]).toBeDefined();
    }
  });

  it('never emits an unreadable label on the primary button', () => {
    // Two deliberately awkward brand colours: one very light, one very dark.
    for (const primary of ['#FEF08A', '#111827', '#4F46E5', '#16A34A']) {
      const tokens = compileTokens({ ...base, colorPrimary: primary });
      expect(contrastRatio(tokens.color['primary-contrast'], tokens.color.primary)).toBeGreaterThan(
        4.5,
      );
    }
  });

  it('scales type and touch targets up for early years', () => {
    const adult = compileTokens({ ...base, ageMode: AgeMode.ADULT });
    const early = compileTokens({ ...base, ageMode: AgeMode.EARLY_YEARS });

    const size = (value: string | number): number => Number.parseFloat(String(value));
    expect(size(early.typography['size-base'])).toBeGreaterThan(size(adult.typography['size-base']));
    expect(size(early.spacing['touch-target'])).toBeGreaterThanOrEqual(44);
    expect(size(adult.spacing['touch-target'])).toBeGreaterThanOrEqual(44);
    expect(early.typography['line-height-body']).toBeGreaterThan(
      Number(adult.typography['line-height-body']),
    );
  });

  it('zeroes every duration when a learner asked for less motion', () => {
    const tokens = compileTokens({ ...base, reduceMotion: true });
    expect(tokens.motion['duration-fast']).toBe('0ms');
    expect(tokens.motion['duration-base']).toBe('0ms');
    expect(tokens.motion['duration-slow']).toBe('0ms');
    expect(tokens.motion['celebration-scale']).toBe('1');
  });

  it('swaps shadows for borders in high contrast', () => {
    const tokens = compileTokens({ ...base, highContrast: true });
    expect(tokens.shadow.sm).toContain('0 0 0 1px');
    expect(tokens.shadow.md).not.toContain('rgba');
  });

  it('reports the token version so a client can tell old trees apart', () => {
    const tokens = compileTokens(base);
    expect(tokens.meta.tokenVersion).toBeGreaterThanOrEqual(1);
    expect(tokens.meta.themeKey).toBe('test-theme');
  });
});

describe('applyOverlay', () => {
  it('replaces a token inside a known group', () => {
    const tokens = applyOverlay(compileTokens(base), { color: { primary: '#123456' } });
    expect(tokens.color.primary).toBe('#123456');
    // The rest of the family is untouched: an overlay overrides, it does not recompile.
    expect(tokens.color['primary-contrast']).toBeDefined();
  });

  it('keeps unknown keys instead of dropping them', () => {
    const tokens = applyOverlay(compileTokens(base), {
      mascotOutline: '#FF00AA',
      chart: { series1: '#001122' },
    });
    expect(tokens.extra.mascotOutline).toBe('#FF00AA');
    expect(tokens.extra['chart-series1']).toBe('#001122');
  });

  it('round-trips the raw overlay so an editor can show what was typed', () => {
    const overlay = { color: { accent: '#ABCDEF' } };
    expect(applyOverlay(compileTokens(base), overlay).overrides).toEqual(overlay);
    expect(applyOverlay(compileTokens(base), null).overrides).toBeNull();
  });

  it('ignores a value of the wrong shape rather than writing "[object Object]"', () => {
    const tokens = applyOverlay(compileTokens(base), { color: { primary: { nested: true } } });
    expect(tokens.color.primary).toBe(base.colorPrimary);
  });
});

describe('tokensToCss', () => {
  it('emits one custom property per token, namespaced', () => {
    const css = tokensToCss(compileTokens(base));
    expect(css.startsWith(':root {')).toBe(true);
    expect(css.trimEnd().endsWith('}')).toBe(true);
    expect(css).toContain(`--midas-color-primary: ${base.colorPrimary};`);
    expect(css).toContain('--midas-font-size-base: 16px;');
    expect(css).toContain('--midas-space-touch-target:');
  });

  it('accepts a scoped selector, for previewing a theme inside a page', () => {
    const css = tokensToCss(compileTokens(base), '.theme-preview');
    expect(css.startsWith('.theme-preview {')).toBe(true);
  });

  it('emits overlay extras under their own prefix', () => {
    const css = tokensToCss(applyOverlay(compileTokens(base), { mascotOutline: '#FF00AA' }));
    expect(css).toContain('--midas-x-mascotOutline: #FF00AA;');
  });
});

describe('contrastWarnings', () => {
  it('says nothing about the default palette', () => {
    expect(contrastWarnings(compileTokens(base))).toEqual([]);
  });

  it('flags body text that cannot be read on the surface', () => {
    const tokens = compileTokens({ ...base, colorTextBody: '#D1D5DB' });
    const warnings = contrastWarnings(tokens);
    const pairs = warnings.map((warning) => warning.pair);
    expect(pairs).toContain('text-body on surface');
    // Every warning carries the ratio, the target and something to do about it.
    for (const warning of warnings) {
      expect(warning.ratio).toBeLessThan(warning.required);
      expect(warning.advice.length).toBeGreaterThan(20);
    }
  });

  it('flags a brand colour too close to the page to see', () => {
    const tokens = compileTokens({ ...base, colorPrimary: '#FAFAFA', colorSurface: '#FFFFFF' });
    expect(contrastWarnings(tokens).map((warning) => warning.pair)).toContain('primary on surface');
  });

  it('passes every shipped preset on the pairs that block a publish', () => {
    const blocking = new Set([
      'text-body on surface',
      'text-body on background',
      'primary-contrast on primary',
    ]);
    for (const preset of THEME_PRESETS) {
      const tokens = compileTokens(withDefaults(preset.shape, preset.key));
      const failures = contrastWarnings(tokens).filter((warning) => blocking.has(warning.pair));
      expect(failures, `preset ${preset.key} would be unpublishable`).toEqual([]);
    }
  });
});

describe('isTokenTree', () => {
  it('accepts a compiled tree and rejects everything else', () => {
    expect(isTokenTree(compileTokens(base))).toBe(true);
    expect(isTokenTree(null)).toBe(false);
    expect(isTokenTree('#4F46E5')).toBe(false);
    expect(isTokenTree([])).toBe(false);
    // The shape a draft row carries before its first publish.
    expect(isTokenTree({ overrides: { color: {} } })).toBe(false);
  });
});
