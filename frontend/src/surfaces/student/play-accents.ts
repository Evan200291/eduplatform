/**
 * The student surface's decorative colour rotation.
 *
 * The six `play-*` tokens exist so a learner's screen can be genuinely
 * colourful without a school's rebrand having to carry six extra configurable
 * hues (see `styles/tokens.css`). This module is the one place that decides
 * *how* they are used, so every list of repeating things — path steps, mission
 * cards, home tiles, topics, badges — cycles through the same six in the same
 * order, and a screen never has to name a colour by hand.
 *
 * Rules that come with these classes:
 *
 *  - **Decorative only.** A `play` colour differentiates one tile from the next.
 *    It never signals state: success / warning / danger are the only tones a
 *    learner is ever asked to read meaning from, because a child must not have
 *    to guess whether pink is bad news. Where a row *does* carry state (locked,
 *    overdue, completed), the semantic tone wins and the accent steps aside.
 *  - **`surface` is a background, never a text colour.** The pale tints do not
 *    carry white text at AA. Put `text-ink` or the matching `text` entry on top
 *    of them; `chip` is the inverse — a saturated fill that *is* AA against
 *    `text-ink-on-brand`.
 *
 * Class strings are written out in full rather than composed from a template,
 * because Tailwind scans source text: `bg-play-${n}-soft` would produce nothing.
 */
export interface PlayAccent {
  /** Pale tint for a panel, tile or row background. Backgrounds only. */
  surface: string;
  /** Saturated fill + contrast text: icon chips, number medallions. */
  chip: string;
  /** The saturated hue as text. Safe on `surface` and on the page canvas. */
  text: string;
  /** The saturated hue as a full border. */
  border: string;
  /** The saturated hue as a border on hover, for tiles that respond to a pointer. */
  hoverBorder: string;
  /** The saturated hue as a left edge, for accented rows. */
  borderLeft: string;
  /** The pale tint as a border — a tinted panel's own outline. */
  borderSoft: string;
}

export const PLAY_ACCENTS: readonly PlayAccent[] = [
  {
    surface: 'bg-play-1-soft',
    chip: 'bg-play-1 text-ink-on-brand',
    text: 'text-play-1',
    border: 'border-play-1',
    hoverBorder: 'hover:border-play-1',
    borderLeft: 'border-l-play-1',
    borderSoft: 'border-play-1-soft',
  },
  {
    surface: 'bg-play-2-soft',
    chip: 'bg-play-2 text-ink-on-brand',
    text: 'text-play-2',
    border: 'border-play-2',
    hoverBorder: 'hover:border-play-2',
    borderLeft: 'border-l-play-2',
    borderSoft: 'border-play-2-soft',
  },
  {
    surface: 'bg-play-3-soft',
    chip: 'bg-play-3 text-ink-on-brand',
    text: 'text-play-3',
    border: 'border-play-3',
    hoverBorder: 'hover:border-play-3',
    borderLeft: 'border-l-play-3',
    borderSoft: 'border-play-3-soft',
  },
  {
    surface: 'bg-play-4-soft',
    chip: 'bg-play-4 text-ink-on-brand',
    text: 'text-play-4',
    border: 'border-play-4',
    hoverBorder: 'hover:border-play-4',
    borderLeft: 'border-l-play-4',
    borderSoft: 'border-play-4-soft',
  },
  {
    surface: 'bg-play-5-soft',
    chip: 'bg-play-5 text-ink-on-brand',
    text: 'text-play-5',
    border: 'border-play-5',
    hoverBorder: 'hover:border-play-5',
    borderLeft: 'border-l-play-5',
    borderSoft: 'border-play-5-soft',
  },
  {
    surface: 'bg-play-6-soft',
    chip: 'bg-play-6 text-ink-on-brand',
    text: 'text-play-6',
    border: 'border-play-6',
    hoverBorder: 'hover:border-play-6',
    borderLeft: 'border-l-play-6',
    borderSoft: 'border-play-6-soft',
  },
];

/**
 * The accent for the nth item in a list. Wraps, and tolerates a negative index,
 * so a caller can pass a raw array position without guarding it.
 */
export function playAccent(index: number): PlayAccent {
  const size = PLAY_ACCENTS.length;
  return PLAY_ACCENTS[((index % size) + size) % size];
}

/**
 * The chip a page uses when something is genuinely stateful rather than merely
 * one-of-many — a completed step, a locked one. Kept next to the decorative set
 * so the contrast between "colour that means something" and "colour that does
 * not" is visible in one file.
 */
export const stateChip = {
  success: 'bg-success text-success-contrast',
  warning: 'bg-warning text-warning-contrast',
  danger: 'bg-danger text-danger-contrast',
  locked: 'bg-surface-sunken text-ink-muted',
} as const;
