import { forwardRef, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { buttonClasses, type ButtonVariant } from './button-styles';
import type { Size } from './styles';

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * A navigation control that looks like a button.
 *
 * Separate from `Button` on purpose: something that changes the URL must be an
 * anchor, so it can be middle-clicked, opened in a new tab and announced as a
 * link. A `<button onClick={navigate}>` breaks all three, which is why the kit
 * makes the correct element the easy one to reach for.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'primary', size = 'md', fullWidth, leadingIcon, trailingIcon, className, children, ...rest },
  ref,
) {
  return (
    <Link ref={ref} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
});
