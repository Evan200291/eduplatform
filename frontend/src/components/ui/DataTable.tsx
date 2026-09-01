import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './Skeleton';
import { text } from './styles';

export interface Column<T> {
  /** Stable identity for the column; also the React key. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Right-aligns and applies tabular figures — use for counts and scores. */
  isNumeric?: boolean;
  /** e.g. `hidden md:table-cell` to drop a column on narrow screens. */
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  getRowKey: (row: T) => string;
  /** Describes the table for screen readers. Required — a table needs a name. */
  caption: string;
  /** Set false to show the caption visually as well. */
  isCaptionHidden?: boolean;
  isLoading?: boolean;
  /** Rendered in place of the table body when there are no rows. */
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * A configuration-driven table.
 *
 * Columns are data, not markup, which is what keeps the admin panel's dozen
 * lists consistent: sorting, alignment, loading rows and the empty state are
 * solved once here rather than re-implemented per screen.
 *
 * Rows are only clickable when `onRowClick` is given, and in that case each row
 * also carries a real focusable element via `tabIndex`, so the interaction is
 * reachable from the keyboard.
 */
export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  caption,
  isCaptionHidden = true,
  isLoading = false,
  emptyState,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const showEmpty = !isLoading && rows.length === 0;

  return (
    <div className={cn('w-full overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className={cn('px-4 py-2 text-left', isCaptionHidden ? 'sr-only' : text.hint)}>
          {caption}
        </caption>

        {/*
         * Small uppercase headers on the sunken tone: the column names have to be
         * legible without competing with the data underneath them, and a size and
         * case change separates them more cleanly than colour alone.
         */}
        <thead>
          <tr className="border-b border-line bg-surface-sunken">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] text-ink-muted whitespace-nowrap',
                  column.isNumeric && 'text-right',
                  column.headerClassName ?? column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading
            ? Array.from({ length: 5 }, (_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-line last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-4 py-3', column.className)}>
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'border-b border-line last:border-0 transition-colors duration-fast ease-standard',
                    onRowClick &&
                      'cursor-pointer hover:bg-primary-soft focus-visible:bg-primary-soft',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-ink',
                        column.isNumeric && 'text-right tabular-nums',
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}

          {showEmpty ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                {emptyState ?? <p className={cn(text.hint, 'text-center')}>Nothing to show yet.</p>}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
