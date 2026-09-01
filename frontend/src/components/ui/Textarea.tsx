import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { controlBase, controlBorder, controlPadding } from './control-styles';
import { useFieldContext } from './field-context';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, rows = 4, ...rest },
  ref,
) {
  const field = useFieldContext();

  return (
    <textarea
      ref={ref}
      id={id ?? field.inputId}
      rows={rows}
      aria-describedby={rest['aria-describedby'] ?? field.describedBy}
      aria-invalid={rest['aria-invalid'] ?? (field.isInvalid || undefined)}
      required={rest.required ?? field.isRequired}
      className={cn(
        controlBase,
        controlPadding,
        controlBorder(field.isInvalid),
        'resize-y',
        className,
      )}
      {...rest}
    />
  );
});
