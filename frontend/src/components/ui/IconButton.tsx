import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { disabled, focusRing, transition } from './styles';

const variants = {
  solid: 'bg-primary text-primary-contrast hover:bg-primary-strong',
  outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
  danger: 'bg-danger-soft text-danger-strong hover:bg-danger-muted',
} as const;

const sizes = {
  sm: 'h-9 w-9',
  md: 'min-h-touch min-w-touch',
} as const;

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only control has no visible text to announce. */
  label: string;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

/**
 * A square, icon-only button.
 *
 * `label` is mandatory and becomes both `aria-label` and the native tooltip, so
 * an icon-only control can never ship without an accessible name. The `sm` size
 * sits below the touch floor deliberately — use it only inside dense toolbars
 * on admin screens, never on learner-facing surfaces.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        transition,
        focusRing,
        disabled,
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
