import type { RouteObject } from 'react-router-dom';
import { AuthLayout } from '@/components/layout';
import { RequireGuest } from '@/routes/RootRedirect';
import { paths } from '@/routes/paths';
import { AcceptInvitationPage } from './AcceptInvitationPage';
import { ChangePasswordPage } from './ChangePasswordPage';
import { LoginPage } from './LoginPage';

/**
 * The screens you reach before you have a session.
 *
 * `RequireGuest` wraps them so pressing Back after signing in does not present a
 * form the user no longer needs. There is no forgot-password route by design —
 * the backend has no such flow; a locked-out learner is reset by their teacher.
 */
export const GUEST_ROUTES: RouteObject = {
  element: <RequireGuest />,
  children: [
    {
      element: <AuthLayout />,
      children: [
        { path: paths.login, element: <LoginPage /> },
        { path: paths.acceptInvitation, element: <AcceptInvitationPage /> },
      ],
    },
  ],
};

/**
 * Changing a password needs a session, but not the app's chrome.
 *
 * It uses `AuthLayout` because it is also the forced first stop for an account
 * flagged `mustChangePassword` — showing that user a full navigation they cannot
 * use yet would be a dead end. Mounted inside `RequireAuth` by the router.
 */
export const CHANGE_PASSWORD_ROUTE: RouteObject = {
  element: <AuthLayout />,
  children: [{ path: paths.changePassword, element: <ChangePasswordPage /> }],
};
