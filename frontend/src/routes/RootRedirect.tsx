import { Navigate, Outlet } from 'react-router-dom';
import { LoadingScreen } from '@/components/feedback';
import { useAuthStatus } from '@/auth';
import { useHomePath } from './use-home-path';
import { paths } from './paths';

/**
 * `/` itself belongs to nobody — it forwards to whichever surface the user's role
 * starts in, so a bookmark of the bare domain always works.
 */
export function RootRedirect() {
  const status = useAuthStatus();
  const home = useHomePath();

  if (status === 'unknown') return <LoadingScreen label="Loading…" />;
  return <Navigate to={status === 'authenticated' ? home : paths.login} replace />;
}

/**
 * The inverse of `RequireAuth`: keeps a signed-in user off the login screen, so
 * pressing Back after sign-in does not present a form they no longer need.
 */
export function RequireGuest() {
  const status = useAuthStatus();
  const home = useHomePath();

  if (status === 'unknown') return <LoadingScreen label="Loading…" />;
  return status === 'authenticated' ? <Navigate to={home} replace /> : <Outlet />;
}
