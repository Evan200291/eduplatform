import type { LucideIcon } from '@/components/ui';
import type { Permission } from '@/auth';

/**
 * Navigation is data.
 *
 * Each surface declares its menu as a plain array, which is what makes the nav
 * maintainable: adding a screen is one entry, and the permission that hides it
 * sits on the same line as the link. `SidebarNav` and the student tab bar both
 * render from this shape, so the two never drift.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Hidden unless the user holds one of these. Omit for "always visible". */
  anyOf?: readonly Permission[];
  /**
   * By default a link is active for its own path and anything under it. Set true
   * for a surface root (`/teach`) so it does not light up on every child route.
   */
  isExact?: boolean;
  /** Shown as a count bubble, e.g. unread notifications. */
  badgeCount?: number;
}

export interface NavSection {
  /** Group heading. Omit for the first, unlabelled group. */
  label?: string;
  items: readonly NavItem[];
}
