import { cn } from '@/lib/cn';
import { controlSize, disabled, focusRing, type Size } from './styles';

/**
 * The button variant map, kept apart from the component so a link can look like a
 * button without the two drifting.
 *
 * To restyle a variant, edit it here — nothing else in the app hard-codes button
 * colours.
 *
 * Solid variants are *raised*: a solid bottom edge in the variant's `-strong`
 * colour, which the button sinks into when pressed. That edge is the whole
 * effect — a flat fill with a blurred drop shadow reads as a coloured rectangle,
 * whereas an edge that visibly compresses reads as a physical control, which is
 * what makes a primary action feel worth pressing. Each variant supplies its own
 * edge colour through `--edge` rather than the base repeating the shadow once
 * per variant.
 */

/** Colour + edge per variant. `--edge` is consumed by `raised` below. */
export const buttonVariants = {
  primary: 'bg-primary text-primary-contrast hover:bg-primary-strong [--edge:var(--midas-color-primary-strong)]',
  secondary:
    'bg-secondary text-secondary-contrast hover:bg-secondary-strong [--edge:var(--midas-color-secondary-strong)]',
  danger: 'bg-danger text-danger-contrast hover:bg-danger-strong [--edge:var(--midas-color-danger-strong)]',
  outline: 'bg-surface text-ink border-2 border-line-strong hover:bg-surface-sunken hover:border-primary-muted',
  subtle: 'bg-primary-soft text-primary-strong hover:bg-primary-muted',
  ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
  link: 'bg-transparent text-primary-strong underline underline-offset-2 hover:text-primary min-h-0 px-0',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;

/** The variants that get the pressable edge. The rest are intentionally flat. */
const RAISED_VARIANTS: ReadonlySet<ButtonVariant> = new Set(['primary', 'secondary', 'danger']);

/**
 * The press. Held in one place so every solid button compresses by the same
 * amount — the edge shrinks and the face moves down to meet it, so the control's
 * overall height never changes and a row of buttons cannot jitter on click.
 *
 * `disabled:` resets both, because a control that still depresses when it is
 * refusing input is telling the user it worked.
 */
const raised = cn(
  'shadow-[0_4px_0_0_var(--edge)]',
  'active:translate-y-[2px] active:shadow-[0_2px_0_0_var(--edge)]',
  'disabled:translate-y-0 disabled:shadow-[0_4px_0_0_var(--edge)]',
);

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-md font-heading font-medium',
    // Transform is animated alongside colour so the press reads as motion, not
    // a jump. Both collapse to 0ms under the reduced-motion token.
    'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-standard',
    focusRing,
    disabled,
    controlSize[size],
    buttonVariants[variant],
    RAISED_VARIANTS.has(variant) && raised,
    fullWidth && 'w-full',
    className,
  );
}
