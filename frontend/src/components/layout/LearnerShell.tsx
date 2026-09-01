import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { focusRing, transition } from '@/components/ui';
import { ErrorBoundary, LoadingScreen, OfflineBanner } from '@/components/feedback';
import { TopBar } from './TopBar';
import { useVisibleNav } from './use-visible-nav';
import type { NavSection } from './nav.types';

const tab = {
  base: cn(
    'group relative flex flex-1 flex-col items-center justify-center gap-1 px-2 py-2 min-h-touch text-xs font-medium',
    'sm:flex-none sm:flex-row sm:gap-2 sm:rounded-pill sm:px-4 sm:text-sm',
    focusRing,
    transition,
  ),
  idle: 'text-ink-muted hover:text-ink sm:hover:bg-surface-sunken',
  active: 'text-primary-strong sm:bg-primary-soft',
} as const;

/**
 * The icon tile behind each destination.
 *
 * A learner navigating with a thumb needs the current tab to be obvious from
 * across a table, not from a subtle text-colour shift — so the active icon gets
 * a filled tile rather than only a change of tint. Scaling the tile (instead of
 * the label with it) keeps every tab the same height, so the bar cannot jump as
 * the selection moves.
 */
const iconTile = {
  base: cn(
    'grid place-items-center rounded-lg h-9 w-9 sm:h-7 sm:w-7',
    'transition-[background-color,color,transform] duration-base ease-standard',
  ),
  idle: 'bg-transparent text-ink-muted group-hover:text-ink',
  active: 'bg-primary text-primary-contrast scale-105 shadow-sm',
} as const;

export interface LearnerShellProps {
  sections: readonly NavSection[];
  homeTo: string;
  notificationsTo?: string;
  unreadCount?: number;
}

/**
 * Chrome for the student surface.
 *
 * Deliberately not the sidebar shell: a nine-year-old on a school tablet does
 * better with a small number of large, always-visible destinations than with a
 * scrolling menu. The same `NavSection[]` data drives it, so permissions and
 * labels stay defined in one place per surface.
 *
 * The bar is fixed to the bottom on phones (thumb reach) and becomes a row of
 * pills from `sm` up. `pb-24` on `<main>` keeps content clear of it.
 */
export function LearnerShell({
  sections,
  homeTo,
  notificationsTo,
  unreadCount,
}: LearnerShellProps) {
  const visible = useVisibleNav(sections);
  const items = visible.flatMap((section) => section.items);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <OfflineBanner />

      <TopBar homeTo={homeTo} notificationsTo={notificationsTo} unreadCount={unreadCount} />

      <nav
        aria-label="Main"
        className={cn(
          'fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface',
          'sm:static sm:justify-center sm:gap-1 sm:border-t-0 sm:border-b sm:px-gutter sm:py-2',
        )}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.isExact}
            className={({ isActive }) => cn(tab.base, isActive ? tab.active : tab.idle)}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cn(iconTile.base, isActive ? iconTile.active : iconTile.idle)}
                >
                  <item.icon aria-hidden className="h-5 w-5 sm:h-4 sm:w-4" />
                </span>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl px-gutter pb-24 pt-6 sm:pb-10"
      >
        <ErrorBoundary>
          <Suspense fallback={<LoadingScreen />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
