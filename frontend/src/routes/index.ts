/**
 * Routing.
 *
 * Import from `@/routes` for the URL registry and the guards; the route table
 * itself is only needed by the app entry.
 *
 *  - `paths.ts`             every URL in the app, in one place
 *  - `router.tsx`           the route table, composed from the surfaces
 *  - `RequireAuth.tsx`      the "signed in?" gate
 *  - `RequirePermission.tsx` the per-screen permission gate
 *  - `RootRedirect.tsx`     `/` forwarding, and keeping guests off `/login`
 *  - `use-home-path.ts`     where the current user belongs
 */

export { SURFACE_HOME, paths } from './paths';
export { RequireAuth } from './RequireAuth';
export { RequirePermission, type RequirePermissionProps } from './RequirePermission';
export { RequireGuest, RootRedirect } from './RootRedirect';
export { useHomePath } from './use-home-path';
export { ROUTES, createRouter } from './router';
