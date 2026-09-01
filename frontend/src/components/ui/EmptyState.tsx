import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { text } from './styles';

export interface EmptyStateProps {
  title: ReactNode;
  /** Say what to do next, not just that nothing is here. */
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * What a list shows when it has nothing in it. Kept as a component so "no
 * homework yet" and "no schools yet" look and read the same way.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      {/* The glyph sits in a tinted disc so an empty screen still has one
       * deliberate shape on it, rather than a stray outline floating in space. */}
      {icon ? (
        <span
          aria-hidden
          className="grid h-16 w-16 place-items-center rounded-full bg-surface-sunken text-ink-muted"
        >
          {icon}
        </span>
      ) : null}
      <p className={cn(text.heading, 'text-lg')}>{title}</p>
      {description ? <p className={cn(text.hint, 'max-w-prose')}>{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
