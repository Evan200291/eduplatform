import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingScreen } from '@/components/feedback';
import { useAuthStatus, useProfile } from '@/auth';
import { paths } from './paths';

/**
 * Gate for everything behind sign-in.
 *
 * Three states matter, and conflating any two of them breaks a real case:
 *  - `unknown`  — bootstrap has not finished. Render a loader. Redirecting here
 *                 would bounce a signed-in user to /login on every hard refresh,
 *                 because the access token lives in memory only.
 *  - `anonymous` — send to login, remembering where they were headed.
 *  - `authenticated` — render the route, unless the account is flagged
 *                 `mustChangePassword`, in which case that screen is the only
 *                 destination the app will allow.
 */
export function RequireAuth() {
  const status = useAuthStatus();
  const profile = useProfile();
  const location = useLocation();

  if (status === 'unknown') return <LoadingScreen label="Checking your sign-in…" />;

  if (status === 'anonymous') {
    return <Navigate to={paths.login} replace state={{ from: location.pathname + location.search }} />;
  }

  if (profile?.mustChangePassword && location.pathname !== paths.changePassword) {
    return <Navigate to={paths.changePassword} replace />;
  }

  return <Outlet />;
}
