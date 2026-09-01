/**
 * Reads token values out of the live cascade.
 *
 * Charts and canvas drawing need real colour strings, not `var(...)`. Rather
 * than fetching the token tree a second time and risking it disagreeing with the
 * applied stylesheet, we ask the document what it actually resolved to. That
 * stays correct through theme swaps, high-contrast overrides and age modes.
 */

function computed(): CSSStyleDeclaration {
  return getComputedStyle(document.documentElement);
}

/** Resolves a single custom property, e.g. `readToken('color-primary')`. */
export function readToken(name: string, fallback = ''): string {
  const value = computed().getPropertyValue(`--midas-${name}`).trim();
  return value || fallback;
}

export function readColor(key: string, fallback = '#4f46e5'): string {
  return readToken(`color-${key}`, fallback);
}

/** Returns a numeric token in pixels, e.g. `readPx('space-4')` → 16. */
export function readPx(name: string, fallback = 0): number {
  const parsed = Number.parseFloat(readToken(name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The default series palette for charts, in a fixed order so the same metric
 * keeps the same colour between renders. Derived from the tenant's own brand.
 */
export function chartSeriesColors(): string[] {
  return [
    readColor('primary'),
    readColor('secondary', '#0ea5e9'),
    readColor('accent', '#f59e0b'),
    readColor('success', '#16a34a'),
    readColor('warning', '#d97706'),
    readColor('danger', '#dc2626'),
    readColor('primary-muted', '#b9b5f5'),
    readColor('secondary-muted', '#9fdbf6'),
  ];
}
