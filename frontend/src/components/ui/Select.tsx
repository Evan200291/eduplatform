import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { controlBase, controlBorder, controlPadding } from './control-styles';
import { useFieldContext } from './field-context';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  /** Rendered as a disabled first option, so "nothing chosen" is explicit. */
  placeholder?: string;
}

/**
 * A native select. Deliberately native: it is keyboard accessible, works with
 * every screen reader, and on a phone it opens the platform picker — which is a
 * better experience for a ten-year-old than any custom listbox.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, id, ...rest },
  ref,
) {
  const field = useFieldContext();

  return (
    <select
      ref={ref}
      id={id ?? field.inputId}
      aria-describedby={rest['aria-describedby'] ?? field.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field.isInvalid || undefined)}
      required={rest.required ?? field.isRequired}
      className={cn(controlBase, controlPadding, controlBorder(field.isInvalid), 'pr-8', className)}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
