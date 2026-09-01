import { Navigate, Outlet } from 'react-router-dom';
import { useCanAny, type Permission } from '@/auth';
import { paths } from './paths';

export interface RequirePermissionProps {
  /** Holding any one of these is enough. */
  anyOf: readonly Permission[];
}

/**
 * Gate for a route group that needs a permission.
 *
 * `anyOf` rather than `allOf` because screens are usually reachable by more than
 * one job: the users list is for a school admin *or* a support agent, and either
 * one alone should get in.
 *
 * This hides a route; it does not secure it. The backend re-checks every request,
 * so a user who guesses a URL sees the no-access screen and, if they got past
 * that, a `FORBIDDEN` from the API.
 */
export function RequirePermission({ anyOf }: RequirePermissionProps) {
  const allowed = useCanAny(anyOf);
  return allowed ? <Outlet /> : <Navigate to={paths.forbidden} replace />;
}
