/**
 * Works out which school's branding to show *before* anyone signs in.
 *
 * Order of preference, most explicit first:
 *   1. `?school=slug` in the URL — how an invitation or SSO link arrives.
 *   2. A subdomain (`acme.midas.example` → `acme`), for schools on a vanity host.
 *   3. The slug remembered from the last successful sign-in on this device.
 *
 * Remembering the slug is a display convenience, not authentication: it reveals
 * nothing a visitor to that subdomain could not already see, and the server
 * still returns the platform default for an unknown slug rather than a 404.
 */

const STORAGE_KEY = 'midas.school-slug';

/** Hosts that never carry a tenant subdomain. */
const NON_TENANT_HOSTS = new Set(['localhost', '127.0.0.1', 'www', 'app', 'api']);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

function normalise(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

function fromQuery(): string | null {
  return normalise(new URLSearchParams(window.location.search).get('school'));
}

function fromSubdomain(): string | null {
  const parts = window.location.hostname.split('.');
  // A bare host or a two-label domain has no tenant label to read.
  if (parts.length < 3) return null;
  const candidate = parts[0];
  if (NON_TENANT_HOSTS.has(candidate)) return null;
  return normalise(candidate);
}

function fromStorage(): string | null {
  try {
    return normalise(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function resolveSchoolSlug(): string | null {
  return fromQuery() ?? fromSubdomain() ?? fromStorage();
}

export function rememberSchoolSlug(slug: string | null): void {
  try {
    if (slug) localStorage.setItem(STORAGE_KEY, slug);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: branding simply falls back next visit.
  }
}
