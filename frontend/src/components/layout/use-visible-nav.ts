import { useMemo } from 'react';
import { useAuthStore } from '@/auth';
import type { NavSection } from './nav.types';

/**
 * Drops the links the current user cannot use, then drops any section left
 * empty — so a support agent never sees a "Billing" heading with nothing
 * under it.
 *
 * Reads the whole `PermissionSet` once rather than calling `useCan` per item,
 * because the item list is dynamic and hooks cannot be.
 */
export function useVisibleNav(sections: readonly NavSection[]): NavSection[] {
  const permissions = useAuthStore((state) => state.permissions);

  return useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.anyOf || permissions.hasAny(item.anyOf)),
        }))
        .filter((section) => section.items.length > 0),
    [sections, permissions],
  );
}
