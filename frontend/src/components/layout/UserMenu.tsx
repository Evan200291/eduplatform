import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import {
  Avatar,
  IconChevronDown,
  IconLock,
  IconSettings,
  IconSignOut,
  IconUser,
  focusRing,
  panel,
  text,
  transition,
} from '@/components/ui';
import { authActions, useProfile } from '@/auth';
import { useDismiss } from '@/hooks/use-dismiss';
import { paths } from '@/routes/paths';

const item = cn(
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm min-h-touch',
  'text-ink hover:bg-surface-sunken',
  focusRing,
  transition,
);

/** Menu glyphs stay quiet until the row is hovered, so the labels lead. */
const itemIcon = 'h-4 w-4 shrink-0 text-ink-muted';

/**
 * Account menu in the top bar: who you are, and the three things you can do
 * about it.
 *
 * A plain button + list rather than a library popover — `aria-haspopup`,
 * `aria-expanded` and `role="menu"` are the whole contract, and `useDismiss`
 * supplies Escape and click-away.
 */
export function UserMenu() {
  const profile = useProfile();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);

  if (!profile) return null;

  const signOut = async () => {
    close();
    await authActions.signOut();
    navigate(paths.login, { replace: true });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 min-h-touch',
          'hover:bg-surface-sunken',
          isOpen && 'bg-surface-sunken',
          focusRing,
          transition,
        )}
      >
        <Avatar name={profile.displayName} src={profile.avatarUrl} size="sm" />
        <span className="hidden max-w-[12rem] truncate text-sm text-ink sm:block">
          {profile.displayName}
        </span>
        <IconChevronDown aria-hidden className="h-4 w-4 text-ink-muted" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Account"
          className={cn(panel, 'absolute right-0 z-20 mt-2 w-64 overflow-hidden p-1 shadow-lg')}
        >
          <div className="flex items-center gap-3 border-b border-line px-3 pb-3 pt-2">
            <Avatar name={profile.displayName} src={profile.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{profile.displayName}</p>
              <p className={cn(text.hint, 'truncate text-xs')}>
                {profile.email ?? profile.school?.name}
              </p>
            </div>
          </div>

          <div className="flex flex-col py-1">
            <Link role="menuitem" to={paths.preferences} onClick={close} className={item}>
              <IconSettings aria-hidden className={itemIcon} />
              Accessibility &amp; display
            </Link>
            <Link role="menuitem" to={paths.sessions} onClick={close} className={item}>
              <IconUser aria-hidden className={itemIcon} />
              Signed-in devices
            </Link>
            <Link role="menuitem" to={paths.changePassword} onClick={close} className={item}>
              <IconLock aria-hidden className={itemIcon} />
              Change password
            </Link>
          </div>

          <div className="border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              className={cn(item, 'text-danger-strong hover:bg-danger-soft')}
            >
              <IconSignOut aria-hidden className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
