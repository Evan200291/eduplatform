// ─────────────────────────────────────────────────────────────────────────────
// Media routes
// Mounted twice from src/routes/index.ts:
//   `/media`        — authenticated, tenant-scoped (this file's `mediaRouter`)
//   `/public/media` — unauthenticated, `isPublic` assets only (`publicMediaRouter`)
//
// The public router exists because a login page needs a school's logo before
// anyone has authenticated. It serves nothing else: the query in
// `openPublicMedia` requires `isPublic`, a non-deleted row and an approved
// moderation decision.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { asyncHandler } from '../../core/http/async-handler';
import { badRequest } from '../../core/http/errors';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, parseOrThrow, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { ALL_ALLOWED_MIME_TYPES } from '../../core/storage';
import type { MediaDownload } from './media.service';
import * as media from './media.service';
import {
  mediaListQuery,
  moderateMediaSchema,
  updateMediaSchema,
  uploadMediaSchema,
} from './media.validation';

/**
 * Files are buffered in memory: the size cap is small (10 MB by default), and a
 * buffer lets the service checksum, measure and store the bytes without a
 * temporary file that would need cleaning up after a failure.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.storage.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALL_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }
    callback(null, true);
  },
});

/** Streams a resolved asset with the headers the service decided on. */
function sendMedia(res: import('express').Response, download: MediaDownload): void {
  res.setHeader('Content-Type', download.mimeType);
  res.setHeader('Content-Length', String(download.byteSize));
  res.setHeader('Content-Disposition', download.disposition);
  res.setHeader('Cache-Control', download.cacheControl);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (download.checksumSha256) res.setHeader('ETag', `"${download.checksumSha256}"`);
  download.stream.pipe(res);
}

const dispositionFor = (value: unknown): 'inline' | 'attachment' =>
  value === 'attachment' ? 'attachment' : 'inline';

// ── Authenticated router ────────────────────────────────────────────────────

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

router.get(
  '/',
  requirePermission('media.read'),
  validate({ query: mediaListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof media.listMedia>[1];
    const { items, totalItems } = await media.listMedia(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.get(
  '/usage',
  requirePermission('media.read'),
  asyncHandler(async (req, res) => {
    ok(res, await media.getMediaUsage(getSchoolId(req)));
  }),
);

/**
 * Multipart upload. The metadata arrives as ordinary form fields, so it is
 * parsed after multer has run rather than by the `validate` middleware.
 */
router.post(
  '/',
  requirePermission('media.upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Attach a file in the `file` field.');
    const input = parseOrThrow(uploadMediaSchema, req.body ?? {});
    const asset = await media.uploadMedia(getContext(req), getSchoolId(req), req.file, input);
    created(res, asset, `/api/v1/media/${asset.id}`);
  }),
);

router.get(
  '/:id',
  requirePermission('media.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await media.getMedia(getSchoolId(req), req.params.id));
  }),
);

/** Serves the bytes. `?disposition=attachment` forces a download. */
router.get(
  '/:id/file',
  requirePermission('media.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const download = await media.openMedia(
      getSchoolId(req),
      req.params.id,
      dispositionFor(req.query.disposition),
    );
    sendMedia(res, download);
  }),
);

router.patch(
  '/:id',
  requirePermission('media.upload'),
  validate({ params: idParam, body: updateMediaSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await media.updateMedia(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/:id/moderate',
  requirePermission('media.moderate'),
  validate({ params: idParam, body: moderateMediaSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await media.moderateMedia(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.delete(
  '/:id',
  requirePermission('media.delete'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await media.deleteMedia(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.post(
  '/:id/restore',
  requirePermission('media.delete'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await media.restoreMedia(getContext(req), getSchoolId(req), req.params.id));
  }),
);

export const mediaRouter = router;

// ── Public router ───────────────────────────────────────────────────────────

const publicRouter = Router();

/** Logos and favicons, needed by the login screen before any token exists. */
publicRouter.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const download = await media.openPublicMedia(
      req.params.id,
      dispositionFor(req.query.disposition),
    );
    sendMedia(res, download);
  }),
);

export const publicMediaRouter = publicRouter;

