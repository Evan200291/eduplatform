import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useProfile } from '@/auth/use-auth';
import { DEFAULT_AGE_MODE, applyAgeMode, isAgeMode } from './age-mode';
import { rememberSchoolSlug, resolveSchoolSlug } from './school-slug';
import { loadThemeStylesheet } from './stylesheet';
import { ThemeContext, type ThemeContextValue } from './theme-context';

/**
 * Keeps the document's branding and age mode in step with the current tenant.
 *
 * The provider owns exactly two side effects — a `<link>` to the school's
 * compiled stylesheet, and the `data-age-mode` attribute — and nothing else in
 * the app touches either. Feature components read tokens through Tailwind
 * classes or `readToken`, so a school swapping its brand needs no component
 * changes at all.
 *
 * Branding is applied before sign-in from the resolved slug, so the login screen
 * is already the school's, and re-applied afterwards if the profile disagrees.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const profile = useProfile();
  const [appliedSlug, setAppliedSlug] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Signed-in profile wins; before that, fall back to URL, subdomain or memory.
  const targetSlug = profile?.school?.slug ?? resolveSchoolSlug();

  useEffect(() => {
    let cancelled = false;

    if (!targetSlug) {
      // No tenant to brand for — the compiled defaults in tokens.css apply.
      setIsReady(true);
      return;
    }

    void loadThemeStylesheet(targetSlug).then(() => {
      if (cancelled) return;
      setAppliedSlug(targetSlug);
      setIsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [targetSlug]);

  // Remember the slug only once it belongs to a signed-in user, so a stray
  // `?school=` in a link cannot pin someone to the wrong branding forever.
  useEffect(() => {
    const slug = profile?.school?.slug;
    if (slug) rememberSchoolSlug(slug);
  }, [profile?.school?.slug]);

  const ageMode = useMemo(() => {
    const candidate = profile?.ageMode ?? profile?.school?.defaultAgeMode;
    return isAgeMode(candidate) ? candidate : DEFAULT_AGE_MODE;
  }, [profile?.ageMode, profile?.school?.defaultAgeMode]);

  useEffect(() => {
    applyAgeMode(ageMode);
  }, [ageMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ schoolSlug: appliedSlug, ageMode, isReady }),
    [appliedSlug, ageMode, isReady],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
