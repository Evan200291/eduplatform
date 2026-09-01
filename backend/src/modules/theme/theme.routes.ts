// ─────────────────────────────────────────────────────────────────────────────
// Theme routes
//
// Three permissions, and the split matters: `theme.read` to look, `theme.write` to
// change the working copy, `theme.publish` to change what learners see. A school can
// hand the middle one to whoever is doing the fiddling and keep the last one with the
// person accountable for how the school looks.
//
// `POST /preview` writes nothing. It exists so the editor can show the compiled result
// and its contrast warnings before anybody commits, which is the only way those
// warnings are useful — a warning after publishing is a bug report.
//
// The `text/css` responses are here rather than in the frontend because the tokens have
// to be in the document at first paint. A login screen that flashes the platform indigo
// before turning the school's green looks broken to the school that paid for the green.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../../core/http/async-handler';
import { paginationSchema } from '../../core/http/pagination';
import { created, noContent, ok, paginated } from '../../core/http/respond';
import { idParam, keySchema, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';

import * as publish from './theme.publish.service';
import * as themes from './theme.service';
import {
  createThemeSchema,
  previewThemeSchema,
  publishThemeSchema,
  rollbackThemeSchema,
  themeListQuery,
  updateThemeSchema,
} from './theme.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

const versionParam = idParam.extend({ version: z.coerce.number().int().min(1) });
const slugParam = z.object({ slug: keySchema });

/** Sends a compiled token set as a stylesheet the browser can apply directly. */
function sendCss(res: Response, css: string, cacheControl: string): void {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.status(200).send(css);
}

// ── Catalogue and the live theme ────────────────────────────────────────────

router.get('/options', requirePermission('theme.read'), (_req, res) => {
  ok(res, themes.themeOptions());
});

router.get(
  '/active',
  requirePermission('theme.read'),
  asyncHandler(async (req, res) => {
    ok(res, await themes.resolveSchoolTheme(getSchoolId(req)));
  }),
);

router.get(
  '/active.css',
  requirePermission('theme.read'),
  asyncHandler(async (req, res) => {
    const active = await themes.resolveSchoolTheme(getSchoolId(req));
    sendCss(res, active.css, 'private, max-age=60');
  }),
);

/** Clearing the active theme returns every screen to the compiled default. */
router.delete(
  '/active',
  requirePermission('theme.publish'),
  asyncHandler(async (req, res) => {
    await publish.deactivateTheme(getContext(req), getSchoolId(req));
    noContent(res);
  }),
);

router.post(
  '/preview',
  requirePermission('theme.write'),
  validate({ body: previewThemeSchema }),
  (req, res) => {
    const input = req.body as Parameters<typeof themes.previewTheme>[0];
    ok(res, themes.previewTheme(input));
  },
);

// ── The working copy ────────────────────────────────────────────────────────

router.get(
  '/',
  requirePermission('theme.read'),
  validate({ query: themeListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof themes.listThemes>[2];
    const result = await themes.listThemes(getContext(req), getSchoolId(req), query);
    paginated(res, result.items, query.page, query.pageSize, result.totalItems, {
      activeThemeId: result.activeThemeId,
    });
  }),
);

router.post(
  '/',
  requirePermission('theme.write'),
  validate({ body: createThemeSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof themes.createTheme>[2];
    created(res, await themes.createTheme(getContext(req), getSchoolId(req), input));
  }),
);

router.get(
  '/:id',
  requirePermission('theme.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await themes.getTheme(getSchoolId(req), req.params.id));
  }),
);

/** The draft stylesheet, for an editor preview frame. */
router.get(
  '/:id/css',
  requirePermission('theme.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const detail = await themes.getTheme(getSchoolId(req), req.params.id);
    // Never cached: this is a draft, and it changes every time somebody saves.
    sendCss(res, themes.draftCss(detail), 'no-store');
  }),
);

router.patch(
  '/:id',
  requirePermission('theme.write'),
  validate({ params: idParam, body: updateThemeSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof themes.updateTheme>[3];
    ok(res, await themes.updateTheme(getContext(req), getSchoolId(req), req.params.id, input));
  }),
);

router.post(
  '/:id/archive',
  requirePermission('theme.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await themes.setThemeArchived(getContext(req), getSchoolId(req), req.params.id, true));
  }),
);

router.post(
  '/:id/restore',
  requirePermission('theme.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await themes.setThemeArchived(getContext(req), getSchoolId(req), req.params.id, false));
  }),
);

// ── Publishing, activation and history ──────────────────────────────────────

router.post(
  '/:id/publish',
  requirePermission('theme.publish'),
  validate({ params: idParam, body: publishThemeSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof publish.publishTheme>[3];
    ok(res, await publish.publishTheme(getContext(req), getSchoolId(req), req.params.id, input));
  }),
);

router.post(
  '/:id/activate',
  requirePermission('theme.publish'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await publish.activateTheme(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.get(
  '/:id/versions',
  requirePermission('theme.read'),
  validate({ params: idParam, query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof publish.listVersions>[2];
    const result = await publish.listVersions(getSchoolId(req), req.params.id, query);
    paginated(res, result.items, query.page, query.pageSize, result.totalItems);
  }),
);

router.get(
  '/:id/versions/:version',
  requirePermission('theme.read'),
  validate({ params: versionParam }),
  asyncHandler(async (req, res) => {
    ok(res, await publish.getVersion(getSchoolId(req), req.params.id, Number(req.params.version)));
  }),
);

router.post(
  '/:id/rollback',
  requirePermission('theme.publish'),
  validate({ params: idParam, body: rollbackThemeSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof publish.rollbackTheme>[3];
    ok(res, await publish.rollbackTheme(getContext(req), getSchoolId(req), req.params.id, input));
  }),
);

export const themeRouter = router;

// ── Unauthenticated branding ────────────────────────────────────────────────

/**
 * The login screen's stylesheet. No token exists yet, so this is deliberately public:
 * it returns colours and font names, which is exactly what is visible on the page it
 * styles. An unknown slug gets the platform default rather than a 404, because a 404
 * here is a free answer to "which schools are on this box?".
 */
const publicRouter = Router();

publicRouter.get(
  '/schools/:slug/theme.css',
  validate({ params: slugParam }),
  asyncHandler(async (req, res) => {
    const resolved = await themes.resolveThemeBySlug(req.params.slug);
    sendCss(res, resolved.css, 'public, max-age=300');
  }),
);

publicRouter.get(
  '/schools/:slug/theme',
  validate({ params: slugParam }),
  asyncHandler(async (req, res) => {
    ok(res, await themes.resolveThemeBySlug(req.params.slug));
  }),
);

export const publicThemeRouter = publicRouter;
