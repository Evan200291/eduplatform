import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api';

/**
 * One QueryClient for the app.
 *
 * The retry policy is the important part: a 401 has already been handled by the
 * transport layer (silent refresh, then session end), and 403/404/422 will not
 * change on a second attempt. Retrying those wastes the user's time and, on a
 * school's metered connection, their bandwidth.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.isRetryable;
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Learner-facing data changes on a human timescale; a minute of freshness
        // keeps navigation instant without showing yesterday's homework.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
