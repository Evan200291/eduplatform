import type { PageMeta } from '@/api';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { IconChevronLeft, IconChevronRight } from './icons';
import { text } from './styles';

export interface PaginationProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Page controls driven by the backend's own `meta` block, so the numbers shown
 * always match what the server counted.
 *
 * A live region announces the range: a screen-reader user pressing "Next" needs
 * to hear where they landed, not just that the button worked.
 */
export function Pagination({ meta, onPageChange, className }: PaginationProps) {
  const { page, pageSize, totalItems, totalPages, hasNextPage } = meta;
  if (totalItems === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    /*
     * This sits in containers of wildly different widths — a full-page table
     * and a third-width dashboard card both use it — and CSS breakpoints read
     * the viewport, not the container, so a narrow card on a wide screen still
     * gets the "wide" layout and overflows.
     *
     * So the layout is built to survive any width without asking: the range
     * text takes a whole line and centres when the controls no longer fit
     * beside it, the word labels drop away leaving the arrows (which keep their
     * accessible names), and nothing carries a minimum width that could push
     * past the container edge.
     */
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3',
        'sm:justify-between',
        className,
      )}
    >
      <p aria-live="polite" className={cn(text.hint, 'min-w-0 text-center sm:text-left')}>
        Showing <span className="tabular-nums">{firstItem}</span>–
        <span className="tabular-nums">{lastItem}</span> of{' '}
        <span className="tabular-nums">{totalItems}</span>
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="px-2"
        >
          <IconChevronLeft aria-hidden className="h-4 w-4" />
          <span className="hidden md:inline">Previous</span>
        </Button>
        <span className={cn(text.hint, 'whitespace-nowrap tabular-nums')}>
          {page} / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNextPage}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="px-2"
        >
          <span className="hidden md:inline">Next</span>
          <IconChevronRight aria-hidden className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
