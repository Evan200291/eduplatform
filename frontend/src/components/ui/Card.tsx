import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { text } from './styles';

/**
 * The standard content container. Composed of parts rather than configured by
 * props, so a screen can use a header without a footer, or a body with no
 * padding, without the component growing a boolean for every case.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-line rounded-lg shadow-sm overflow-hidden',
        // A card that lifts slightly under the pointer tells the user the whole
        // card is the target, not just the link inside it. Harmless on the
        // static ones; the transition is token-driven so it collapses to 0ms
        // when a learner has asked for reduced motion.
        'transition-shadow duration-base ease-standard hover:shadow-md',
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Actions sit on the right of the header row: buttons, menus, filters. */
  actions?: ReactNode;
  /** Renders as an <h2> by default; raise or lower it to keep the page outline sane. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  headingLevel = 2,
  className,
}: CardHeaderProps) {
  const Heading = `h${headingLevel}` as 'h2';

  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className={cn(text.heading, 'text-lg text-balance')}>{title}</Heading>
        {description ? <p className={cn(text.hint, 'mt-1 leading-body')}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-sunken px-4 py-3',
        className,
      )}
      {...rest}
    />
  );
}
