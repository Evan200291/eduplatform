import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import { buttonClasses, type ButtonVariant } from './button-styles';
import type { Size } from './styles';

/**
 * The one button. Every clickable action in the product uses it, so hover,
 * focus, disabled and loading behave identically everywhere.
 *
 * Styling lives in `button-styles.ts`, shared with `ButtonLink` — anything that
 * navigates must be an anchor, and it should still look like a button.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  /** Shows a spinner and blocks input without changing the button's width. */
  isLoading?: boolean;
  /** Announced to screen readers while loading. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingLabel = 'Working…',
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // `aria-busy` is what tells assistive tech the press was received; the
      // spinner alone is invisible to it.
      aria-busy={isLoading || undefined}
      disabled={rest.disabled || isLoading}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {isLoading ? <Spinner className="shrink-0" label={loadingLabel} /> : leadingIcon}
      {children}
      {!isLoading && trailingIcon}
    </button>
  );
});

export type { ButtonVariant };
