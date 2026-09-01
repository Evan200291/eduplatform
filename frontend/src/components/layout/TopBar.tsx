import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { IconMenu, IconNotifications, IconButton, focusRing, text, transition } from '@/components/ui';
import { useProfile } from '@/auth';
import { SchoolSwitcher } from './SchoolSwitcher';
import { SurfaceSwitcher } from './SurfaceSwitcher';
import { UserMenu } from './UserMenu';

export interface TopBarProps {
  /** Shown on narrow screens only; opens the nav drawer. */
  onOpenNav?: () => void;
  /** Where the school name links to. */
  homeTo: string;
  notificationsTo?: string;
  unreadCount?: number;
}

/** First letter of the tenant's name, for the brand tile. Never empty. */
function markLetter(name: string): string {
  return (name.trim()[0] ?? 'M').toUpperCase();
}

/**
 * The bar above every signed-in screen.
 *
 * Holds identity (which school you are in, who you are) and the two controls that
 * must be reachable from anywhere: notifications and the account menu. Page-level
 * actions belong in `PageHeader`, not here — that keeps the bar stable while
 * navigating, which is what makes it findable.
 *
 * The height is fixed (`h-16`) rather than derived from its contents, because the
 * sidebar's sticky offset in `AppShell` has to match it exactly; a bar that grows
 * with a long school name would leave a gap or hide the first menu item.
 */
export function TopBar({ onOpenNav, homeTo, notificationsTo, unreadCount = 0 }: TopBarProps) {
  const profile = useProfile();
  const schoolName = profile?.school?.name ?? 'Midas Learning';
  const orgName = profile?.school ? (profile.organization?.name ?? null) : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface px-gutter">
      {onOpenNav ? (
        <IconButton label="Open menu" variant="ghost" onClick={onOpenNav} className="lg:hidden">
          <IconMenu aria-hidden className="h-5 w-5" />
        </IconButton>
      ) : null}

      {/*
       * `min-w-0` on both the link and its text column is what lets a long school
       * name truncate instead of pushing the account controls off-screen.
       */}
      <Link
        to={homeTo}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 sm:flex-initial',
          'hover:bg-surface-sunken',
          focusRing,
          transition,
        )}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary font-heading text-base font-bold text-primary-contrast shadow-sm"
        >
          {markLetter(schoolName)}
        </span>
        <span className="min-w-0 leading-heading">
          <span className={cn(text.heading, 'block truncate text-base')}>{schoolName}</span>
          {orgName ? (
            <span className="block truncate text-xs text-ink-muted">{orgName}</span>
          ) : null}
        </span>
      </Link>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SurfaceSwitcher />
        <SchoolSwitcher />

        {notificationsTo ? (
          <Link
            to={notificationsTo}
            className={cn(
              'relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-md',
              'text-ink-muted hover:bg-surface-sunken hover:text-ink',
              focusRing,
              transition,
            )}
          >
            <IconNotifications aria-hidden className="h-5 w-5" />
            <span className="sr-only">
              Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}
            </span>
            {unreadCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface"
              />
            ) : null}
          </Link>
        ) : null}

        <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />

        <UserMenu />
      </div>
    </header>
  );
}
