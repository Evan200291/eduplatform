import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { text } from './styles';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary and secondary actions for the page. */
  actions?: ReactNode;
  /** Breadcrumbs or a back link. */
  above?: ReactNode;
  className?: string;
}

/**
 * The top of every screen. One component so the `<h1>` is always present and
 * always the page's only one — the anchor a screen reader user jumps to first.
 */
export function PageHeader({ title, description, actions, above, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {above}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className={cn(text.heading, 'text-2xl text-balance')}>{title}</h1>
          {description ? (
            <p className={cn(text.hint, 'mt-1 max-w-prose leading-body')}>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
