import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { panel, text } from '@/components/ui';
import { ErrorBoundary, LoadingScreen, OfflineBanner } from '@/components/feedback';

/**
 * Chrome for the screens you reach before you have an identity: sign in, accept
 * an invitation, set a first password.
 *
 * No navigation by design — there is nowhere else to go, and offering links here
 * is how people end up in loops. The school's branding still applies, because the
 * theme stylesheet is loaded from the slug in the URL before React mounts.
 */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <OfflineBanner />

      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-gutter py-10"
      >
        <div className="w-full max-w-md">
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <footer className={cn(text.hint, 'px-gutter pb-6 text-center')}>
        Midas Learning · Ask your teacher if you cannot get in
      </footer>
    </div>
  );
}

/** The card every auth screen sits in, so they all line up. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(panel, 'p-6 shadow-md')}>
      <h1 className={cn(text.heading, 'text-2xl')}>{title}</h1>
      {description ? <p className={cn(text.hint, 'mt-1')}>{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
