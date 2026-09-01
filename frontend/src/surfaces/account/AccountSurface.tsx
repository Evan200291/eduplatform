import { IconAccessibility, IconLock, IconUser } from '@/components/ui';
import { AppShell, type NavSection } from '@/components/layout';
import { paths } from '@/routes/paths';
import { useHomePath } from '@/routes/use-home-path';

/**
 * Account settings, in the same shell as the rest of the app.
 *
 * Ungated: everything here is about your own account, so there is no permission
 * that could sensibly hide it.
 */
const ACCOUNT_NAV: readonly NavSection[] = [
  {
    label: 'Your account',
    items: [
      { to: paths.preferences, label: 'Accessibility & display', icon: IconAccessibility },
      { to: paths.sessions, label: 'Signed-in devices', icon: IconUser },
      { to: paths.changePassword, label: 'Change password', icon: IconLock },
    ],
  },
];

/** Route element for everything under `/account`. */
export function AccountSurface() {
  const home = useHomePath();
  return <AppShell sections={ACCOUNT_NAV} homeTo={home} />;
}
