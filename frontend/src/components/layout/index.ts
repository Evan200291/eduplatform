/**
 * App chrome.
 *
 * Three shells, one per audience, all fed by the same `NavSection[]` data:
 *  - `AppShell`     sidebar + top bar (teacher portal, admin panel)
 *  - `LearnerShell` large bottom tabs (student surface)
 *  - `AuthLayout`   centred card, no navigation (sign-in and friends)
 *
 * Each shell owns the skip link, the `<main id="main-content">` landmark, the
 * offline banner and an `ErrorBoundary`, so no screen has to remember them.
 */

export { AppShell, type AppShellProps } from './AppShell';
export { AuthCard, AuthLayout } from './AuthLayout';
export { LearnerShell, type LearnerShellProps } from './LearnerShell';
export { SchoolSwitcher } from './SchoolSwitcher';
export { SidebarNav, type SidebarNavProps } from './SidebarNav';
export { SurfaceSwitcher } from './SurfaceSwitcher';
export { TopBar, type TopBarProps } from './TopBar';
export { UserMenu } from './UserMenu';
export { useVisibleNav } from './use-visible-nav';
export type { NavItem, NavSection } from './nav.types';
