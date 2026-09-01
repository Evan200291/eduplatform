import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { focusRing, text, transition } from '@/components/ui';
import type { NavSection } from './nav.types';

/**
 * The active row is doing three jobs at once: a tinted pill, a brand-coloured
 * rail in the left gutter, and a coloured icon. One of those alone reads as a
 * hover state; together they read as "you are here" from the corner of the eye,
 * which is what a menu that frames every screen has to do.
 */
const link = {
  base: cn(
    'group relative flex items-center gap-3 rounded-md pl-4 pr-3 py-2 text-sm min-h-touch',
    focusRing,
    transition,
  ),
  idle: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  active: 'bg-primary-soft font-medium text-primary-strong',
  icon: 'h-5 w-5 shrink-0 transition-colors duration-fast ease-standard',
  iconIdle: 'text-ink-muted group-hover:text-ink',
  iconActive: 'text-primary',
} as const;

export interface SidebarNavProps {
  sections: readonly NavSection[];
  /** Called after any link activates, so a mobile drawer can close itself. */
  onNavigate?: () => void;
  className?: string;
}

/**
 * The vertical menu for the teacher and admin surfaces.
 *
 * `aria-current="page"` comes from `NavLink` automatically, which is what tells a
 * screen reader where it is — the colour change alone would not.
 */
export function SidebarNav({ sections, onNavigate, className }: SidebarNavProps) {
  return (
    <nav aria-label="Main" className={cn('flex flex-col gap-6 px-3 py-4', className)}>
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`} className="flex flex-col gap-1">
          {section.label ? (
            <h2 className={cn(text.eyebrow, 'px-4 pb-1')}>{section.label}</h2>
          ) : null}

          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.isExact}
              onClick={onNavigate}
              className={({ isActive }) => cn(link.base, isActive ? link.active : link.idle)}
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-2 left-0 w-1 rounded-full',
                      isActive ? 'bg-primary' : 'bg-transparent',
                    )}
                  />
                  <item.icon
                    aria-hidden
                    className={cn(link.icon, isActive ? link.iconActive : link.iconIdle)}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badgeCount ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-contrast tabular-nums">
                      {item.badgeCount > 99 ? '99+' : item.badgeCount}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
