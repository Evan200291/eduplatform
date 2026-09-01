import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { IconButton, IconClose } from '@/components/ui';
import { ErrorBoundary, LoadingScreen, OfflineBanner } from '@/components/feedback';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { useVisibleNav } from './use-visible-nav';
import type { NavSection } from './nav.types';

export interface AppShellProps {
  sections: readonly NavSection[];
  homeTo: string;
  notificationsTo?: string;
  unreadCount?: number;
}

/**
 * The chrome shared by the teacher portal and the admin panel: a persistent
 * sidebar on wide screens, a dismissible drawer below `lg`.
 *
 * Two accessibility obligations live here rather than in every screen. The skip
 * link is the first focusable element on the page, so a keyboard user reaches
 * content without tabbing the whole menu. And `<main id="main-content">` is
 * rendered once, so there is exactly one landmark for it.
 *
 * An `ErrorBoundary` sits inside the shell, not around it — a crashed screen
 * should leave the user their navigation.
 */
export function AppShell({ sections, homeTo, notificationsTo, unreadCount }: AppShellProps) {
  const visible = useVisibleNav(sections);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const location = useLocation();

  // Navigating is the drawer's cue to get out of the way.
  useEffect(() => setIsDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <OfflineBanner />

      <TopBar
        onOpenNav={() => setIsDrawerOpen(true)}
        homeTo={homeTo}
        notificationsTo={notificationsTo}
        unreadCount={unreadCount}
      />

      <div className="flex">
        {/*
         * `top-16` and the matching viewport subtraction below track the
         * top bar's fixed height, so the menu scrolls independently of the page
         * without ever sliding under the bar.
         */}
        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-var(--midas-space-16))] overflow-y-auto scrollbar-thin">
            <SidebarNav sections={visible} />
          </div>
        </aside>

        {isDrawerOpen ? (
          <div className="fixed inset-0 z-20 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-overlay"
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-surface shadow-lg scrollbar-thin">
              <div className="flex items-center justify-end px-2 py-2">
                <IconButton label="Close menu" onClick={() => setIsDrawerOpen(false)}>
                  <IconClose aria-hidden className="h-5 w-5" />
                </IconButton>
              </div>
              <SidebarNav sections={visible} onNavigate={() => setIsDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <main
          id="main-content"
          className={cn(
            'min-w-0 flex-1 px-gutter py-6 lg:px-8 lg:py-8',
            'mx-auto w-full max-w-[100rem]',
          )}
        >
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
