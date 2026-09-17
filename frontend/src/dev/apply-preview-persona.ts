import { PermissionSet, useAuthStore } from '@/auth';
import { isPreviewPersona, previewProfile } from './preview-personas';

/**
 * Signs the dev preview harness straight into a fixture persona, bypassing
 * login entirely, so every surface can be reviewed in a real browser without
 * a backend or a password.
 *
 * DEV ONLY — `import.meta.env.DEV` is false in a production build, so this
 * whole module (and the `src/dev/` fixtures it pulls in) is dead-code-eliminated
 * from the shipped bundle. See `preview-personas.ts` for what's fabricated.
 *
 * Usage: open the app with `?preview=student` (or `teacher`, `admin`, `platform`)
 * in the URL. Returns whether a persona was applied, so `main.tsx` knows to skip
 * the real `bootstrap()` — calling both would let the real one win the race and
 * overwrite the fixture with "anonymous".
 */
export function applyPreviewPersonaFromUrl(): boolean {
  if (!import.meta.env.DEV) return false;

  const persona = new URLSearchParams(window.location.search).get('preview');
  if (!isPreviewPersona(persona)) return false;

  const profile = previewProfile(persona);
  useAuthStore.setState({
    status: 'authenticated',
    profile,
    tenant: {
      organizationId: profile.organization?.id ?? null,
      schoolId: profile.school?.id ?? null,
      schoolSlug: profile.school?.slug ?? null,
    },
    permissions: new PermissionSet(profile.permissions),
    endedReason: null,
  });
  return true;
}
