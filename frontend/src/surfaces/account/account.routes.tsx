import { Navigate, type RouteObject } from 'react-router-dom';
import { paths } from '@/routes/paths';
import { AccountSurface } from './AccountSurface';
import { PreferencesPage } from './PreferencesPage';
import { SessionsPage } from './SessionsPage';

/**
 * Routes under `/account`.
 *
 * Ungated: every screen here is about your own account, so no permission could
 * sensibly hide one. `/account` itself has no page of its own and forwards to the
 * accessibility settings, which is what people come here for most.
 *
 * Change password is reachable from the account menu but lives in the auth
 * routes, because the backend revokes the session when it succeeds.
 */
export const ACCOUNT_ROUTES: readonly RouteObject[] = [
  {
    path: '/account',
    element: <AccountSurface />,
    children: [
      { index: true, element: <Navigate to={paths.preferences} replace /> },
      { path: 'preferences', element: <PreferencesPage /> },
      { path: 'sessions', element: <SessionsPage /> },
    ],
  },
];
