import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { authActions, homeSurfaceFor, type LoginCredentials } from '@/auth';
import { SURFACE_HOME, paths } from '@/routes/paths';

/** Never bounce back to a screen that only exists for signed-out users. */
const NOT_A_DESTINATION = new Set<string>([paths.login, paths.acceptInvitation, paths.root]);

/**
 * Submitting the login form.
 *
 * Wrapped in a mutation so the button gets `isPending` and the form gets a typed
 * `error` for free, and so a second click while the first request is in flight
 * cannot create two sessions.
 *
 * The cache is cleared on success: a shared classroom tablet must not show the
 * previous learner's homework list for the moment before the refetch lands.
 */
export function useLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const requested = (location.state as { from?: string } | null)?.from;
  const from = requested && !NOT_A_DESTINATION.has(requested) ? requested : null;

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authActions.signIn(credentials),
    onSuccess: (profile) => {
      queryClient.clear();
      const destination = profile.mustChangePassword
        ? paths.changePassword
        : (from ?? SURFACE_HOME[homeSurfaceFor(profile)]);
      navigate(destination, { replace: true });
    },
  });
}
