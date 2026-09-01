// ─────────────────────────────────────────────────────────────────────────────
// Reporting routes
// The mount point for `/api/v1/reports`.
//
// The read permissions are graded (`report.read.own` → `.scoped` → `.school`) and
// any of them opens the reading routes, because what a caller may actually see is
// decided by the cohort resolver, not by the route. A parent holding only
// `report.read.own` and a head teacher holding `report.read.school` call the same
// endpoint and get different rows — which is the only arrangement that keeps the
// scope rule in one place instead of duplicated across nine routes.
//
// Writing a definition is separate (`report.definition.write`): defining what the
// school measures is a different act from reading it. And the download route is the
// only one in the module that does not return the standard envelope, because it
// returns a file — authorized per request, never by holding a URL.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler';
import { accepted, created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import {
  requireAnyPermission,
  requirePermission,
  requireSchoolContext,
} from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as exportsService from './exports.service';
import * as reporting from './reporting.service';
import {
  createReportDefinitionSchema,
  exportListQuery,
  reportDefinitionListQuery,
  reportKeySchema,
  requestExportSchema,
  runReportQuery,
  updateReportDefinitionSchema,
} from './reporting.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

/** Any of these opens a reading route; the cohort resolver narrows the rows. */
const canRead = requireAnyPermission(
  'report.read.own',
  'report.read.scoped',
  'report.read.school',
  'report.read.organization',
  'report.read.platform',
);

const keyParam = z.object({ key: reportKeySchema });

// ── The catalogue ───────────────────────────────────────────────────────────

/**
 * What can actually be run, straight from the code registry. Every entry carries
 * its own measure and limitation notes, so a report picker can show what a report
 * does not prove before anyone runs it.
 */
router.get(
  '/catalogue',
  canRead,
  asyncHandler(async (_req, res) => {
    ok(res, reporting.standardReportCatalogue());
  }),
);

// ── Definitions ─────────────────────────────────────────────────────────────

/** The school's saved reports plus the platform's standard ones. */
router.get(
  '/definitions',
  canRead,
  validate({ query: reportDefinitionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof reporting.listDefinitions>[2];
    const { items, totalItems } = await reporting.listDefinitions(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/**
 * Saving a report. The validator requires real measure and limitation notes of at
 * least a sentence each, so a definition cannot be created without answering
 * blueprint 04's question about what it does not prove.
 */
router.post(
  '/definitions',
  requirePermission('report.definition.write'),
  validate({ body: createReportDefinitionSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof reporting.createDefinition>[2];
    created(res, await reporting.createDefinition(getContext(req), getSchoolId(req), input));
  }),
);

router.get(
  '/definitions/:id',
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await reporting.getDefinition(getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/definitions/:id',
  requirePermission('report.definition.write'),
  validate({ params: idParam, body: updateReportDefinitionSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof reporting.updateDefinition>[3];
    ok(
      res,
      await reporting.updateDefinition(getContext(req), getSchoolId(req), req.params.id, input),
    );
  }),
);

/** Archived, not deleted: an export that cites a report must stay traceable. */
router.post(
  '/definitions/:id/archive',
  requirePermission('report.definition.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await reporting.archiveDefinition(getContext(req), getSchoolId(req), req.params.id));
  }),
);

// ── Running ─────────────────────────────────────────────────────────────────

/** Running a saved report by id. */
router.get(
  '/definitions/:id/run',
  canRead,
  validate({ params: idParam, query: runReportQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof reporting.runReport>[3];
    ok(res, await reporting.runReport(getContext(req), getSchoolId(req), req.params.id, query));
  }),
);

/**
 * Running a standard report by key, which is what a dashboard tile does. Keys are
 * dotted (`engagement.activity-summary`) and so cannot collide with the id route.
 */
router.get(
  '/standard/:key/run',
  canRead,
  validate({ params: keyParam, query: runReportQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof reporting.runReport>[3];
    ok(res, await reporting.runReport(getContext(req), getSchoolId(req), req.params.key, query));
  }),
);

// ── Exports ─────────────────────────────────────────────────────────────────

/**
 * Requesting a file. Answered 202 with the queued row: the file is built after the
 * response, and the client polls the row rather than holding a request open while a
 * school-wide report runs.
 */
router.post(
  '/exports',
  requirePermission('report.export'),
  validate({ body: requestExportSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof exportsService.requestExport>[2];
    accepted(res, await exportsService.requestExport(getContext(req), getSchoolId(req), input));
  }),
);

/** "My exports", and for a school administrator, everyone's. */
router.get(
  '/exports',
  canRead,
  validate({ query: exportListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof exportsService.listExports>[2];
    const { items, totalItems } = await exportsService.listExports(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Status, for the client polling a build it just requested. */
router.get(
  '/exports/:id',
  canRead,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await exportsService.getExport(getContext(req), getSchoolId(req), req.params.id));
  }),
);

/**
 * The file itself. The only route here that answers with bytes rather than the
 * envelope, and the reason `storageKey` never leaves the service: this check runs
 * on every download, and every download is audited.
 */
router.get(
  '/exports/:id/download',
  requirePermission('report.export'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const file = await exportsService.downloadExport(getContext(req), getSchoolId(req), req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.content.length));
    // Learner data: no shared cache should keep a copy of this response.
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(file.content);
  }),
);

export const reportingRouter = router;
