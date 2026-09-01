import { AGE_MODES, type AgeMode } from '@/types/enums';

/**
 * Age mode is a single dial, not a set of themes.
 *
 * The server already scaled typography, density and radius into the tokens, so
 * nothing here changes visual values. What this module provides is the
 * `data-age-mode` attribute for the few places a component genuinely needs to
 * behave differently — fewer items per screen for early years, plain-language
 * copy, a simpler navigation shape — plus ordering helpers so those checks read
 * as ranges rather than long equality chains.
 */

const ORDER: Record<AgeMode, number> = {
  EARLY_YEARS: 0,
  PRIMARY: 1,
  LOWER_SECONDARY: 2,
  UPPER_SECONDARY: 3,
  ADULT: 4,
};

export const DEFAULT_AGE_MODE: AgeMode = 'LOWER_SECONDARY';

export function isAgeMode(value: unknown): value is AgeMode {
  return typeof value === 'string' && (AGE_MODES as readonly string[]).includes(value);
}

/** True when `mode` is at or above `floor` in the youngest-to-oldest ordering. */
export function ageAtLeast(mode: AgeMode, floor: AgeMode): boolean {
  return ORDER[mode] >= ORDER[floor];
}

export function ageBelow(mode: AgeMode, ceiling: AgeMode): boolean {
  return ORDER[mode] < ORDER[ceiling];
}

/** Younger learners get shorter labels, bigger targets and less on screen. */
export function isYoungLearner(mode: AgeMode): boolean {
  return ageBelow(mode, 'LOWER_SECONDARY');
}

/** Publishes the mode to the document so CSS and tests can read it. */
export function applyAgeMode(mode: AgeMode): void {
  document.documentElement.dataset.ageMode = mode;
}

export const AGE_MODE_LABELS: Record<AgeMode, string> = {
  EARLY_YEARS: 'Early years',
  PRIMARY: 'Primary',
  LOWER_SECONDARY: 'Lower secondary',
  UPPER_SECONDARY: 'Upper secondary',
  ADULT: 'Adult',
};

/**
 * How many cards to show in a carousel or grid row before paging. Early years
 * screens get fewer, larger choices; adults can scan more.
 */
export function itemsPerRow(mode: AgeMode): number {
  switch (mode) {
    case 'EARLY_YEARS':
      return 2;
    case 'PRIMARY':
      return 3;
    default:
      return 4;
  }
}
