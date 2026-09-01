import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { focusRing, transition } from '@/components/ui';
import { accessibleSurfaces, useProfile } from '@/auth';
import { SURFACE_HOME } from '@/routes/paths';
import type { Surface } from '@/types/enums';

const LABELS: Record<Surface, string> = {
  student: 'Learning',
  teacher: 'Teaching',
  admin: 'Admin',
};

/**
 * A segmented control rather than a row of links: the surfaces are alternatives
 * to one another, and the recessed track is what says so at a glance. The active
 * segment is a raised white chip, which is the same "lifted out of the groove"
 * language the buttons use.
 */
const tab = {
  base: cn(
    'inline-flex min-h-touch items-center rounded-md px-3 text-sm whitespace-nowrap',
    focusRing,
    transition,
  ),
  idle: 'text-ink-muted hover:text-ink',
  active: 'bg-surface font-medium text-ink shadow-sm',
} as const;

/**
 * Switches between the surfaces one person can hold at once — a head of year who
 * teaches a class is both a teacher and a school admin.
 *
 * Renders nothing for the overwhelming majority of users, who have exactly one.
 */
export function SurfaceSwitcher() {
  const profile = useProfile();
  const location = useLocation();
  if (!profile) return null;

  const surfaces = accessibleSurfaces(profile);
  if (surfaces.length < 2) return null;

  return (
    <nav
      aria-label="Switch area"
      className="flex shrink-0 items-center gap-1 rounded-md bg-surface-sunken p-0.5"
    >
      {surfaces.map((surface) => {
        const to = SURFACE_HOME[surface];
        const isActive = location.pathname.startsWith(to);
        return (
          <Link
            key={surface}
            to={to}
            aria-current={isActive ? 'page' : undefined}
            className={cn(tab.base, isActive ? tab.active : tab.idle)}
          >
            {LABELS[surface]}
          </Link>
        );
      })}
    </nav>
  );
}
