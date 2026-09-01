// ─────────────────────────────────────────────────────────────────────────────
// Theme presets and defaults
//
// A school administrator asked to build a theme from an empty form produces one of two
// things: the default indigo, or something unreadable. These presets exist so the
// starting point is always a palette that already passes the contrast checks in
// theme.tokens.ts, and the school's work is narrowing it to their brand rather than
// inventing ten colours.
//
// Every preset here has been checked against the same `contrastWarnings` the publish
// path runs. If one ever fails that check the fix is the preset, not the check.
//
// THEME_DEFAULTS mirrors the column defaults in prisma/schema/12-theme.prisma. It is
// duplicated deliberately: the preview endpoint compiles tokens for a theme that has
// not been written yet, so it needs the defaults in code, not in the database.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode } from '@prisma/client';

import type { ThemeInput } from './theme.tokens';

/** Everything the compiler reads, except the key. Mirrors the schema defaults. */
export type ThemeShape = Omit<ThemeInput, 'key'>;

export const THEME_DEFAULTS: ThemeShape = {
  colorPrimary: '#2563EB',
  colorSecondary: '#7C3AED',
  colorAccent: '#F97316',
  colorSuccess: '#16A34A',
  colorWarning: '#D97706',
  colorDanger: '#DC2626',
  colorSurface: '#FFFFFF',
  // Neutrals carry a slight blue bias toward the primary rather than being a
  // true grey — a pure-grey page beside a blue accent reads as unconsidered.
  colorBackground: '#F7F9FC',
  colorTextBody: '#0F172A',
  colorTextMuted: '#64748B',
  fontHeading: 'Plus Jakarta Sans',
  fontBody: 'Inter',
  fontBaseSize: 16,
  radiusScale: 'md',
  densityScale: 'comfortable',
  reduceMotion: false,
  highContrast: false,
  ageMode: null,
};

export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  shape: ThemeShape;
}

/**
 * Six starting points. Not a design system each — the same components, six palettes,
 * which is what a white-label product can actually support without forking the UI.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'midas-default',
    name: 'Midas Default',
    description: 'The platform palette. Blue and violet with a warm orange accent, on cool neutrals.',
    shape: { ...THEME_DEFAULTS },
  },
  {
    key: 'oak-green',
    name: 'Oak Green',
    description: 'Deep green and warm sand. Reads as established and calm; common for primary schools.',
    shape: {
      ...THEME_DEFAULTS,
      colorPrimary: '#166534',
      colorSecondary: '#0F766E',
      colorAccent: '#B45309',
      colorSurface: '#FFFFFF',
      colorBackground: '#F4F7F2',
      colorTextBody: '#14251A',
      colorTextMuted: '#5A6B5F',
      fontHeading: 'Merriweather',
      fontBody: 'Inter',
    },
  },
  {
    key: 'harbour-blue',
    name: 'Harbour Blue',
    description: 'Navy and teal on a cool grey page. The safest choice for a mixed-age school.',
    shape: {
      ...THEME_DEFAULTS,
      colorPrimary: '#1D4ED8',
      colorSecondary: '#0E7490',
      colorAccent: '#EA580C',
      colorBackground: '#F1F5F9',
      colorTextBody: '#0F172A',
      colorTextMuted: '#556072',
    },
  },
  {
    key: 'sunrise-bright',
    name: 'Sunrise Bright',
    description:
      'Warm coral and amber with larger type. Built for early years: bigger targets, rounder corners.',
    shape: {
      ...THEME_DEFAULTS,
      colorPrimary: '#C2410C',
      colorSecondary: '#7C3AED',
      colorAccent: '#0891B2',
      colorSuccess: '#15803D',
      colorBackground: '#FFF8F1',
      colorTextBody: '#2A1508',
      colorTextMuted: '#6B5546',
      fontHeading: 'Baloo 2',
      fontBody: 'Nunito',
      fontBaseSize: 17,
      radiusScale: 'xl',
      densityScale: 'spacious',
      ageMode: AgeMode.EARLY_YEARS,
    },
  },
  {
    key: 'plum-secondary',
    name: 'Plum Secondary',
    description:
      'Plum and slate at a compact density with tighter corners. Suits upper secondary and adult learners.',
    shape: {
      ...THEME_DEFAULTS,
      colorPrimary: '#6D28D9',
      colorSecondary: '#334155',
      colorAccent: '#0D9488',
      colorSurface: '#FFFFFF',
      colorBackground: '#F8FAFC',
      colorTextBody: '#111827',
      colorTextMuted: '#5B6472',
      radiusScale: 'sm',
      densityScale: 'compact',
      fontBaseSize: 15,
      ageMode: AgeMode.UPPER_SECONDARY,
    },
  },
  {
    key: 'high-contrast',
    name: 'High Contrast',
    description:
      'Near-black on white with borders instead of shadows and no motion. For learners who need it, and the fallback when a school asks for maximum legibility.',
    shape: {
      ...THEME_DEFAULTS,
      colorPrimary: '#1E3A8A',
      colorSecondary: '#0F3D3E',
      colorAccent: '#8A3A00',
      colorSuccess: '#14532D',
      colorWarning: '#7C2D12',
      colorDanger: '#991B1B',
      colorSurface: '#FFFFFF',
      colorBackground: '#FFFFFF',
      colorTextBody: '#000000',
      colorTextMuted: '#2B2B2B',
      radiusScale: 'sm',
      reduceMotion: true,
      highContrast: true,
    },
  },
];

export function findPreset(key: string): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.key === key);
}

/** Fills a partial theme from the defaults, so a preview can compile anything. */
export function withDefaults(partial: Partial<ThemeShape>, key: string): ThemeInput {
  return {
    key,
    colorPrimary: partial.colorPrimary ?? THEME_DEFAULTS.colorPrimary,
    colorSecondary: partial.colorSecondary ?? THEME_DEFAULTS.colorSecondary,
    colorAccent: partial.colorAccent ?? THEME_DEFAULTS.colorAccent,
    colorSuccess: partial.colorSuccess ?? THEME_DEFAULTS.colorSuccess,
    colorWarning: partial.colorWarning ?? THEME_DEFAULTS.colorWarning,
    colorDanger: partial.colorDanger ?? THEME_DEFAULTS.colorDanger,
    colorSurface: partial.colorSurface ?? THEME_DEFAULTS.colorSurface,
    colorBackground: partial.colorBackground ?? THEME_DEFAULTS.colorBackground,
    colorTextBody: partial.colorTextBody ?? THEME_DEFAULTS.colorTextBody,
    colorTextMuted: partial.colorTextMuted ?? THEME_DEFAULTS.colorTextMuted,
    fontHeading: partial.fontHeading ?? THEME_DEFAULTS.fontHeading,
    fontBody: partial.fontBody ?? THEME_DEFAULTS.fontBody,
    fontBaseSize: partial.fontBaseSize ?? THEME_DEFAULTS.fontBaseSize,
    radiusScale: partial.radiusScale ?? THEME_DEFAULTS.radiusScale,
    densityScale: partial.densityScale ?? THEME_DEFAULTS.densityScale,
    reduceMotion: partial.reduceMotion ?? THEME_DEFAULTS.reduceMotion,
    highContrast: partial.highContrast ?? THEME_DEFAULTS.highContrast,
    ageMode: partial.ageMode ?? THEME_DEFAULTS.ageMode,
  };
}
