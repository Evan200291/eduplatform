import { cn } from '@/lib/cn';

export interface SkeletonProps {
  className?: string;
}

/**
 * A placeholder block. Sized by the caller with utility classes so the skeleton
 * matches the real content's layout and the page does not jump when data lands.
 *
 * `aria-hidden` on purpose: the loading state is announced once by the
 * surrounding region, not once per grey rectangle.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn('block animate-pulse rounded-md bg-surface-sunken', className)}
    />
  );
}

/** Several stacked lines, for paragraph-shaped content. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('block space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          // A short final line reads as prose rather than as a grey box.
          className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </span>
  );
}
