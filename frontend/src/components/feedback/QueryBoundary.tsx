import type { ReactNode } from 'react';
import { SkeletonText, Spinner } from '@/components/ui';
import { ErrorState } from './ErrorState';

export interface QueryBoundaryProps {
  /** `isPending` from the query. */
  isLoading: boolean;
  error: unknown;
  /** True when the request succeeded but there is nothing to show. */
  isEmpty?: boolean;
  /** Shown while loading. Defaults to skeleton lines. */
  skeleton?: ReactNode;
  /** Shown when `isEmpty`. Defaults to nothing, so a screen must opt in. */
  emptyState?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

/**
 * The four states of a request, resolved in one place.
 *
 * Screens read as `<QueryBoundary {...query}>` plus their success markup, which
 * keeps loading and error handling from being re-invented (or forgotten) on
 * every list. The wrapper carries `aria-busy`, so a screen reader hears the
 * region settle once instead of hearing each skeleton rectangle.
 */
export function QueryBoundary({
  isLoading,
  error,
  isEmpty = false,
  skeleton,
  emptyState,
  onRetry,
  children,
}: QueryBoundaryProps) {
  return (
    <div aria-busy={isLoading || undefined}>
      {isLoading ? (
        // Padded, because the common case is a boundary filling a `CardBody`
        // with its own padding removed so a table can sit flush to the edges.
        (skeleton ?? <SkeletonText lines={4} className="p-4" />)
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : isEmpty ? (
        emptyState
      ) : (
        children
      )}
    </div>
  );
}

/**
 * A centred spinner for a whole route that has not resolved yet — lazy chunk
 * download, or the auth bootstrap. Not for content inside a settled page; use
 * skeletons there so the layout does not jump.
 */
export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <Spinner size="lg" label={label} />
    </div>
  );
}
