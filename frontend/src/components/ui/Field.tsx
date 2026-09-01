import { useId, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FieldContext, type FieldContextValue } from './field-context';
import { text } from './styles';

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Guidance shown before the user makes a mistake. */
  hint?: ReactNode;
  /** Server- or client-side validation message. Presence marks the field invalid. */
  error?: ReactNode;
  isRequired?: boolean;
  /** Hides the visible label but keeps it for screen readers. Use sparingly. */
  isLabelHidden?: boolean;
  className?: string;
}

/**
 * Label, hint and error for one control, wired together by id.
 *
 * `error` is a plain node, which is what makes binding server validation easy:
 * `error={apiError.fieldErrors()[name]}` — the backend already returns
 * `issues: {path, message}[]` shaped for exactly this.
 */
export function Field({
  label,
  children,
  hint,
  error,
  isRequired = false,
  isLabelHidden = false,
  className,
}: FieldProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const value = useMemo<FieldContextValue>(
    () => ({
      inputId,
      describedBy: [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined,
      isInvalid: Boolean(error),
      isRequired,
    }),
    [inputId, hint, hintId, error, errorId, isRequired],
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className={cn(text.label, isLabelHidden && 'sr-only')}>
        {label}
        {isRequired ? (
          <>
            {' '}
            <span className="text-danger-strong" aria-hidden>
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </label>

      <FieldContext.Provider value={value}>{children}</FieldContext.Provider>

      {hint ? (
        <p id={hintId} className={text.hint}>
          {hint}
        </p>
      ) : null}

      {/* Announced when it appears, without stealing focus from the input. */}
      {error ? (
        <p id={errorId} role="status" className={text.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
