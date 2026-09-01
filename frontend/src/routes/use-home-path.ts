import { homeSurfaceFor, useProfile } from '@/auth';
import { SURFACE_HOME, paths } from './paths';

/**
 * The path a given user should land on.
 *
 * Used by `/`, by the sign-in redirect, and by every "back to safety" link on an
 * error screen — so a user is always returned to a page their role can actually
 * open. Falls back to the login screen when there is no profile, which is the one
 * page that works for a signed-out visitor.
 */
export function useHomePath(): string {
  const profile = useProfile();
  return profile ? SURFACE_HOME[homeSurfaceFor(profile)] : paths.login;
}
