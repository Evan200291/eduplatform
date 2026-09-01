/**
 * Shared style fragments for the UI kit.
 *
 * Convention for every component in this folder:
 *   1. A `const variants = { ... }` map near the top of the file.
 *   2. Class strings only — no inline styles, no literal colours or sizes.
 *   3. A `className` prop merged last through `cn()`, so a caller can always
 *      override without editing the component.
 *
 * Changing how the whole product looks should mean editing a token on the
 * server, or one of the maps below. It should never mean a find-and-replace.
 */

/** The one focus treatment. Applied by components that render their own ring. */
export const focusRing =
  'outline-none focus-visible:ring-4 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** A raised panel: the default container for grouped content. */
export const panel = 'bg-surface border border-line rounded-lg shadow-sm';

/**
 * Text styles used often enough to be worth naming.
 *
 * Headings run through the heading family at weight 800 with tightened
 * tracking: at display sizes the default spacing reads as loose, and the extra
 * weight is what separates a heading from bold body text at a glance.
 *
 * `eyebrow` is the small uppercase label above a section. Uppercase text needs
 * positive tracking to stay legible, which is the opposite of what headings
 * want — hence a separate entry rather than a size variant of `heading`.
 */
export const text = {
  heading: 'font-heading font-bold leading-heading tracking-heading text-ink',
  body: 'leading-body text-ink',
  muted: 'text-ink-muted',
  label: 'text-sm font-medium text-ink',
  hint: 'text-sm text-ink-muted',
  error: 'text-sm font-medium text-danger-strong',
  eyebrow: 'text-xs font-medium uppercase tracking-[0.08em] text-ink-muted',
} as const;

/** Disabled treatment, consistent across buttons, inputs and menu items. */
export const disabled = 'disabled:opacity-60 disabled:cursor-not-allowed';

/** Motion that respects the duration tokens (which collapse to 0ms on request). */
export const transition = 'transition-colors duration-fast ease-standard';

export type Size = 'sm' | 'md' | 'lg';

/** Row heights that never drop below the accessible touch floor. */
export const controlSize: Record<Size, string> = {
  sm: 'min-h-touch px-3 text-sm',
  md: 'min-h-touch px-4 text-base',
  lg: 'min-h-touch px-6 text-lg',
};
