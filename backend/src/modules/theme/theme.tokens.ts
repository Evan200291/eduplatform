// ─────────────────────────────────────────────────────────────────────────────
// Theme tokens
// Blueprint 07: "tokens, not hard-coded values." This file is the compiler that
// turns the handful of choices a school actually makes — a primary colour, a font, an
// age band — into the full token tree the client renders from, and into the CSS
// variables that tree becomes.
//
// The reason it is a compiler rather than a form with sixty fields: a school
// administrator can pick a brand colour. They cannot reasonably pick a hover state, a
// disabled surface, a focus ring and a readable text colour to sit on top of it, and
// asking them to means most schools end up with an unreadable button somewhere. The
// derived values are computed, and `contrastWarnings` checks the ones that matter
// against WCAG AA — so a school choosing pale yellow on white is told, at the point of
// choosing, rather than a child squinting at it.
//
// Age mode scales typography and density from the same tokens rather than swapping
// stylesheets. A seven-year-old and a sixteen-year-old get the same components at
// different sizes, which is the only version of this that stays maintainable.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode } from '@prisma/client';

/** Written as a code rather than an escape so the generated CSS is easy to diff. */
const NEWLINE = String.fromCharCode(10);

/** The columns of the Theme row this compiler reads. */
export interface ThemeInput {
  key: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorSurface: string;
  colorBackground: string;
  colorTextBody: string;
  colorTextMuted: string;
  fontHeading: string;
  fontBody: string;
  fontBaseSize: number;
  radiusScale: string;
  densityScale: string;
  reduceMotion: boolean;
  highContrast: boolean;
  ageMode: AgeMode | null;
}

export interface TokenTree {
  meta: { themeKey: string; ageMode: string | null; generatedAt: string; tokenVersion: number };
  color: Record<string, string>;
  typography: Record<string, string | number>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
  /** Overrides that did not belong to a known group, emitted as `--midas-x-*`. */
  extra: Record<string, string>;
  /** The school's raw overlay, kept so the editor can round-trip what was typed. */
  overrides: Record<string, unknown> | null;
}

/** The groups an overlay is allowed to merge into. */
const MERGEABLE_GROUPS = ['color', 'typography', 'spacing', 'radius', 'shadow', 'motion'] as const;
type MergeableGroup = (typeof MERGEABLE_GROUPS)[number];

/**
 * Bumped when the shape of the tree changes, so a client can tell a token set written
 * by an older release from one it fully understands.
 */
export const TOKEN_VERSION = 1;

/**
 * Age band scaling. Early years gets larger text and more room between targets
 * because small fingers miss small buttons; adult mode is the compact baseline.
 */
const AGE_SCALE: Record<AgeMode, { font: number; density: number; radius: number }> = {
  [AgeMode.EARLY_YEARS]: { font: 1.25, density: 1.35, radius: 1.5 },
  [AgeMode.PRIMARY]: { font: 1.125, density: 1.15, radius: 1.25 },
  [AgeMode.LOWER_SECONDARY]: { font: 1, density: 1, radius: 1 },
  [AgeMode.UPPER_SECONDARY]: { font: 1, density: 0.95, radius: 0.9 },
  [AgeMode.ADULT]: { font: 1, density: 0.9, radius: 0.75 },
};

const DENSITY_SCALE: Record<string, number> = {
  compact: 0.85,
  comfortable: 1,
  spacious: 1.25,
};

const RADIUS_SCALE: Record<string, number> = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 14,
  xl: 22,
  full: 999,
};

// ── Colour maths ────────────────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts `#rgb`, `#rrggbb` and `#rrggbbaa`, which is what the column allows. */
export function parseHex(value: string): Rgb {
  const hex = value.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex.slice(0, 6);
  const int = Number.parseInt(full.padEnd(6, '0'), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Linear blend. `weight` is how much of `other` ends up in the result. */
export function mix(base: string, other: string, weight: number): string {
  const a = parseHex(base);
  const b = parseHex(other);
  const w = Math.max(0, Math.min(1, weight));
  return toHex({
    r: a.r + (b.r - a.r) * w,
    g: a.g + (b.g - a.g) * w,
    b: a.b + (b.b - a.b) * w,
  });
}

/** WCAG relative luminance. */
export function relativeLuminance(value: string): number {
  const { r, g, b } = parseHex(value);
  const channel = (raw: number): number => {
    const scaled = raw / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const light = relativeLuminance(a);
  const dark = relativeLuminance(b);
  const [hi, lo] = light > dark ? [light, dark] : [dark, light];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Black or white, whichever is legible on the given colour. */
export function readableOn(background: string): string {
  return contrastRatio(background, '#FFFFFF') >= contrastRatio(background, '#111827')
    ? '#FFFFFF'
    : '#111827';
}

// ── Compilation ─────────────────────────────────────────────────────────────

/** The derived family every brand colour gets, so components never invent one. */
function family(name: string, base: string, highContrast: boolean): Record<string, string> {
  const strongWeight = highContrast ? 0.32 : 0.2;
  return {
    [name]: base,
    [`${name}-soft`]: mix(base, '#FFFFFF', highContrast ? 0.78 : 0.88),
    [`${name}-muted`]: mix(base, '#FFFFFF', highContrast ? 0.45 : 0.6),
    [`${name}-strong`]: mix(base, '#000000', strongWeight),
    [`${name}-contrast`]: readableOn(base),
  };
}

export function compileTokens(theme: ThemeInput, generatedAt = new Date()): TokenTree {
  const age = theme.ageMode ? AGE_SCALE[theme.ageMode] : { font: 1, density: 1, radius: 1 };
  const density = (DENSITY_SCALE[theme.densityScale] ?? 1) * age.density;
  const radiusBase = (RADIUS_SCALE[theme.radiusScale] ?? RADIUS_SCALE.md) * age.radius;
  const baseFont = Math.round(theme.fontBaseSize * age.font * 100) / 100;
  const step = Math.round(4 * density * 100) / 100;

  const color: Record<string, string> = {
    ...family('primary', theme.colorPrimary, theme.highContrast),
    ...family('secondary', theme.colorSecondary, theme.highContrast),
    ...family('accent', theme.colorAccent, theme.highContrast),
    ...family('success', theme.colorSuccess, theme.highContrast),
    ...family('warning', theme.colorWarning, theme.highContrast),
    ...family('danger', theme.colorDanger, theme.highContrast),
    surface: theme.colorSurface,
    'surface-raised': mix(theme.colorSurface, '#FFFFFF', 0.5),
    'surface-sunken': mix(theme.colorSurface, '#000000', theme.highContrast ? 0.08 : 0.04),
    background: theme.colorBackground,
    'text-body': theme.highContrast ? mix(theme.colorTextBody, '#000000', 0.35) : theme.colorTextBody,
    'text-muted': theme.highContrast
      ? mix(theme.colorTextMuted, '#000000', 0.35)
      : theme.colorTextMuted,
    'text-on-brand': readableOn(theme.colorPrimary),
    border: mix(theme.colorTextMuted, theme.colorSurface, theme.highContrast ? 0.35 : 0.68),
    'border-strong': mix(theme.colorTextMuted, theme.colorSurface, 0.2),
    // A focus ring that is not the brand colour, so it stays visible on brand buttons.
    focus: theme.highContrast ? '#000000' : mix(theme.colorPrimary, '#000000', 0.15),
    overlay: 'rgba(17, 24, 39, 0.55)',
  };

  const typography: Record<string, string | number> = {
    'font-heading': `${theme.fontHeading}, system-ui, -apple-system, Segoe UI, sans-serif`,
    'font-body': `${theme.fontBody}, system-ui, -apple-system, Segoe UI, sans-serif`,
    'size-base': `${baseFont}px`,
    'size-xs': `${round(baseFont * 0.75)}px`,
    'size-sm': `${round(baseFont * 0.875)}px`,
    'size-md': `${baseFont}px`,
    'size-lg': `${round(baseFont * 1.125)}px`,
    'size-xl': `${round(baseFont * 1.375)}px`,
    'size-2xl': `${round(baseFont * 1.75)}px`,
    'size-3xl': `${round(baseFont * 2.25)}px`,
    'weight-body': 400,
    'weight-medium': 500,
    'weight-heading': 700,
    // Younger readers get more leading; it measurably helps early decoding.
    'line-height-body': theme.ageMode === AgeMode.EARLY_YEARS ? 1.7 : 1.55,
    'line-height-heading': 1.2,
    'letter-spacing-heading': theme.ageMode === AgeMode.EARLY_YEARS ? '0.01em' : '-0.01em',
  };

  const spacing: Record<string, string> = {
    '0': '0px',
    '1': `${round(step)}px`,
    '2': `${round(step * 2)}px`,
    '3': `${round(step * 3)}px`,
    '4': `${round(step * 4)}px`,
    '6': `${round(step * 6)}px`,
    '8': `${round(step * 8)}px`,
    '12': `${round(step * 12)}px`,
    '16': `${round(step * 16)}px`,
    // Touch target floor. 44px is the accessible minimum; early years gets more.
    'touch-target': `${Math.max(44, Math.round(44 * age.density))}px`,
    'page-gutter': `${round(step * 4)}px`,
  };

  const radius: Record<string, string> = {
    none: '0px',
    sm: `${round(radiusBase * 0.5)}px`,
    md: `${round(radiusBase)}px`,
    lg: `${round(radiusBase * 1.75)}px`,
    pill: '999px',
  };

  const shadow: Record<string, string> = theme.highContrast
    ? {
        // High contrast replaces soft shadows with borders that survive a poor screen.
        sm: `0 0 0 1px ${color['border-strong']}`,
        md: `0 0 0 2px ${color['border-strong']}`,
        lg: `0 0 0 3px ${color['border-strong']}`,
      }
    : {
        sm: '0 1px 2px rgba(17, 24, 39, 0.08)',
        md: '0 4px 12px rgba(17, 24, 39, 0.10)',
        lg: '0 12px 32px rgba(17, 24, 39, 0.14)',
      };

  const instant = theme.reduceMotion;
  const motion: Record<string, string> = {
    'duration-fast': instant ? '0ms' : '120ms',
    'duration-base': instant ? '0ms' : '220ms',
    'duration-slow': instant ? '0ms' : '420ms',
    'easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
    'easing-emphasis': instant ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    'celebration-scale': instant ? '1' : '1.06',
  };

  return {
    meta: {
      themeKey: theme.key,
      ageMode: theme.ageMode,
      generatedAt: generatedAt.toISOString(),
      tokenVersion: TOKEN_VERSION,
    },
    color,
    typography,
    spacing,
    radius,
    shadow,
    motion,
    extra: {},
    overrides: null,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Lays a school's overlay over a compiled tree.
 *
 * Values under a known group name replace that token; anything else is flattened into
 * `extra` and emitted as `--midas-x-*`. Nothing is dropped silently — a school that
 * typed a key we do not recognise still gets a variable it can use, which is the whole
 * point of having an overlay rather than another ten columns.
 */
export function applyOverlay(
  tokens: TokenTree,
  overlay: Record<string, unknown> | null | undefined,
): TokenTree {
  if (!overlay || Object.keys(overlay).length === 0) return { ...tokens, overrides: null };

  const next: TokenTree = {
    ...tokens,
    color: { ...tokens.color },
    typography: { ...tokens.typography },
    spacing: { ...tokens.spacing },
    radius: { ...tokens.radius },
    shadow: { ...tokens.shadow },
    motion: { ...tokens.motion },
    extra: { ...tokens.extra },
    overrides: overlay,
  };

  const isGroup = (key: string): key is MergeableGroup =>
    (MERGEABLE_GROUPS as readonly string[]).includes(key);

  for (const [key, value] of Object.entries(overlay)) {
    if (value === null || value === undefined) continue;

    if (isGroup(key) && typeof value === 'object' && !Array.isArray(value)) {
      for (const [token, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === 'string' || typeof raw === 'number') {
          (next[key] as Record<string, string | number>)[token] = raw;
        }
      }
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      next.extra[key] = String(value);
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [token, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === 'string' || typeof raw === 'number') {
          next.extra[`${key}-${token}`] = String(raw);
        }
      }
    }
  }

  return next;
}

// ── Output ──────────────────────────────────────────────────────────────────

/**
 * The tree as CSS custom properties. Emitted server-side so a school's branding is
 * already in the document when the first paint happens — a login screen that flashes
 * the default indigo before turning green looks broken to the school that paid for
 * the green.
 */
export function tokensToCss(tokens: TokenTree, selector = ':root'): string {
  const lines: string[] = [`${selector} {`];
  const push = (group: string, values: Record<string, string | number>): void => {
    for (const [name, value] of Object.entries(values)) {
      lines.push(`  --midas-${group}-${name}: ${String(value)};`);
    }
  };

  push('color', tokens.color);
  push('font', tokens.typography);
  push('space', tokens.spacing);
  push('radius', tokens.radius);
  push('shadow', tokens.shadow);
  push('motion', tokens.motion);
  push('x', tokens.extra);
  lines.push('}');
  return lines.join(NEWLINE);
}

/** Reads a stored token tree back, tolerating one written by an older release. */
export function isTokenTree(value: unknown): value is TokenTree {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<TokenTree>;
  return typeof candidate.color === 'object' && candidate.color !== null;
}

export interface ContrastWarning {
  pair: string;
  ratio: number;
  required: number;
  advice: string;
}

/**
 * The checks worth blocking a publish on. Body text and muted text against both
 * surfaces, and the label on a brand button — the four combinations that appear on
 * every screen. AA is 4.5:1 for body text and 3:1 for large text and UI edges.
 */
export function contrastWarnings(tokens: TokenTree): ContrastWarning[] {
  const warnings: ContrastWarning[] = [];
  const check = (pair: string, a: string, b: string, required: number, advice: string): void => {
    const ratio = contrastRatio(a, b);
    if (ratio < required) warnings.push({ pair, ratio, required, advice });
  };

  const { color } = tokens;
  check(
    'text-body on surface',
    color['text-body'],
    color.surface,
    4.5,
    'Darken the body text colour or lighten the surface. This is the pair every sentence in the product uses.',
  );
  check(
    'text-body on background',
    color['text-body'],
    color.background,
    4.5,
    'Darken the body text colour or lighten the page background.',
  );
  check(
    'text-muted on surface',
    color['text-muted'],
    color.surface,
    4.5,
    'Muted text is still text. If it cannot meet 4.5:1, use the body colour and lower the font weight instead.',
  );
  check(
    'primary-contrast on primary',
    color['primary-contrast'],
    color.primary,
    4.5,
    'The label on a primary button is unreadable. Choose a darker or lighter primary colour.',
  );
  check(
    'primary on surface',
    color.primary,
    color.surface,
    3,
    'The brand colour is too close to the surface for buttons and links to be distinguishable.',
  );
  check(
    'danger on surface',
    color.danger,
    color.surface,
    3,
    'Error states must be visible. Choose a stronger danger colour.',
  );
  check(
    'focus on surface',
    color.focus,
    color.surface,
    3,
    'The focus ring must be visible for keyboard users.',
  );
  return warnings;
}
