import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/components/feedback';
import { createQueryClient } from '@/query/query-client';
import { createRouter } from '@/routes';
import { ThemeProvider } from '@/theme';

/**
 * The provider stack, and nothing else.
 *
 * Both singletons are created at module scope on purpose: a client or router
 * rebuilt on render would throw away every cached query and the history stack
 * with it.
 *
 * Order matters, outside in:
 *  - `ErrorBoundary` catches a crash above the router, where no screen-level
 *    boundary can — without it that case is a white page.
 *  - `QueryClientProvider` must be above anything that fetches, which is every
 *    screen and the theme.
 *  - `ThemeProvider` applies the tenant's branding and age mode to the document,
 *    so it wraps the router rather than sitting inside a single surface.
 */
const queryClient = createQueryClient();
const router = createRouter();

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
