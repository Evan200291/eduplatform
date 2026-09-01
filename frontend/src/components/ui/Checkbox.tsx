import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { focusRing, text, transition } from './styles';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  hint?: ReactNode;
}

/**
 * A checkbox with its label as one hit target — the whole row is clickable,
 * which matters on a tablet and for anyone with limited fine motor control.
 * The row is padded to the touch-target token rather than the box being resized,
 * so the control stays visually proportionate at every age mode.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, ...rest },
  ref,
) {
  return (
    <label
      className={cn(
        'flex min-h-touch cursor-pointer items-start gap-3 rounded-md p-2',
        'hover:bg-surface-sunken',
        transition,
        rest.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'mt-1 h-5 w-5 shrink-0 rounded-sm border border-line-strong text-primary',
          'accent-primary',
          focusRing,
        )}
        {...rest}
      />
      <span className="min-w-0">
        <span className={text.body}>{label}</span>
        {hint ? <span className={cn('block', text.hint)}>{hint}</span> : null}
      </span>
    </label>
  );
});
