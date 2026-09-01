import { env } from '@/lib/env';

/**
 * Applies a school's tokens to the document.
 *
 * Two mechanisms, in cascade order:
 *
 * 1. A `<link>` to the server's `text/css` endpoint. Cacheable, and it lands
 *    before React mounts so the login screen never flashes platform indigo at a
 *    school that paid for its own green.
 * 2. A `<style>` block for CSS handed to us in a JSON response (the authenticated
 *    active theme, or an unsaved editor preview). Appended after the link, so it
 *    wins at equal specificity without needing `!important`.
 *
 * Everything is keyed by a `data-midas-theme` attribute, so re-applying replaces
 * rather than stacking.
 */

const LINK_KEY = 'link';

function head(): HTMLHeadElement {
  return document.head;
}

/** Public, unauthenticated branding stylesheet for a school slug. */
export function themeStylesheetUrl(slug: string): string {
  return `${env.apiBaseUrl}/public/schools/${encodeURIComponent(slug)}/theme.css`;
}

/**
 * Points the branding `<link>` at a school. Resolves once the stylesheet has
 * loaded (or failed) so callers can hold first paint until branding is settled.
 */
export function loadThemeStylesheet(slug: string): Promise<void> {
  const href = themeStylesheetUrl(slug);
  const existing = head().querySelector<HTMLLinkElement>(`link[data-midas-theme="${LINK_KEY}"]`);

  if (existing?.getAttribute('href') === href) return Promise.resolve();

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.midasTheme = LINK_KEY;

    const settle = (): void => {
      existing?.remove();
      resolve();
    };
    link.addEventListener('load', settle, { once: true });
    // A missing or failing theme endpoint must not block the app; the default
    // tokens in styles/tokens.css already render a usable product.
    link.addEventListener('error', settle, { once: true });

    // Inserted before any injected <style> so JSON-delivered CSS still wins.
    const firstInjectedStyle = head().querySelector('style[data-midas-theme]');
    if (firstInjectedStyle) head().insertBefore(link, firstInjectedStyle);
    else head().appendChild(link);
  });
}

/**
 * Applies CSS text under a named slot. Use distinct keys for distinct concerns
 * (`active`, `preview`) so one can be cleared without disturbing the other.
 */
export function applyThemeCss(key: string, css: string): void {
  const selector = `style[data-midas-theme="${key}"]`;
  let element = head().querySelector<HTMLStyleElement>(selector);

  if (!element) {
    element = document.createElement('style');
    element.dataset.midasTheme = key;
    head().appendChild(element);
  }

  if (element.textContent !== css) element.textContent = css;
}

export function clearThemeCss(key: string): void {
  head().querySelector(`style[data-midas-theme="${key}"]`)?.remove();
}
