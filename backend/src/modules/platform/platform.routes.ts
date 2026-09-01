// ─────────────────────────────────────────────────────────────────────────────
// Platform operations routes (blueprint 05 / 06 / 13 / 17)
// Everything here is platform staff work, with one deliberate exception:
// `/releases` is readable by any signed-in user. Blueprint 17 puts the version
// log inside the product so a school can see what changed without being sent a
// document, and the service decides what each reader may see — drafts are
// invisible without `platform.releases.write`, and an audience list narrows a
// note further.
//
// No route returns a secret setting value. `upsertSetting` accepts one and
// `settingValue` reads one for server code; neither path reaches a response.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, noContent, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext } from '../../core/middleware/authenticate';
import { requirePermission } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { SEVERITY_POLICIES, SETTING_SPECS } from './platform.constants';
import * as registry from './platform.service';
import * as incidents from './platform.incidents.service';
import * as operations from './platform.operations.service';
import { platformOverview } from './platform.overview.service';
import {
  createIncidentSchema,
  featureDefinitionQuery,
  featureKeyParam,
  incidentListQuery,
  incidentStatusSchema,
  jobRunListQuery,
  releaseNoteListQuery,
  releaseNoteSchema,
  settingKeyParam,
  settingListQuery,
  settingWriteSchema,
  updateFeatureDefinitionSchema,
  updateIncidentSchema,
  updateReleaseNoteSchema,
  versionParam,
} from './platform.validation';

const router = Router();
router.use(authenticate, tenantContext);

// ── Overview (blueprint 05) ─────────────────────────────────────────────────

router.get(
  '/overview',
  requirePermission('platform.overview.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await platformOverview());
  }),
);

// ── Feature registry (blueprint 06) ─────────────────────────────────────────

router.get(
  '/features',
  requirePermission('platform.features.read'),
  validate({ query: featureDefinitionQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof registry.listFeatureDefinitions>[0];
    ok(res, { features: await registry.listFeatureDefinitions(query) });
  }),
);

/** Mirrors the code registry into the table. Idempotent, so it is safe to repeat. */
router.post(
  '/features/sync',
  requirePermission('platform.features.write'),
  asyncHandler(async (req, res) => {
    ok(res, await registry.syncFeatureDefinitions(getContext(req)));
  }),
);

router.get(
  '/features/:key',
  requirePermission('platform.features.read'),
  validate({ params: featureKeyParam }),
  asyncHandler(async (req, res) => {
    ok(res, await registry.getFeatureDefinition(req.params.key));
  }),
);

router.patch(
  '/features/:key',
  requirePermission('platform.features.write'),
  validate({ params: featureKeyParam, body: updateFeatureDefinitionSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof registry.updateFeatureDefinition>[2];
    ok(res, await registry.updateFeatureDefinition(getContext(req), req.params.key, body));
  }),
);

// ── Settings ────────────────────────────────────────────────────────────────

/** The declared keys, so the panel can show a setting nobody has set yet. */
router.get(
  '/settings/catalogue',
  requirePermission('platform.settings.read'),
  asyncHandler(async (_req, res) => {
    ok(res, { settings: registry.settingCatalogue(), total: SETTING_SPECS.length });
  }),
);

router.get(
  '/settings',
  requirePermission('platform.settings.read'),
  validate({ query: settingListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof registry.listSettings>[0];
    ok(res, { settings: await registry.listSettings(query) });
  }),
);

router.put(
  '/settings',
  requirePermission('platform.settings.write'),
  validate({ body: settingWriteSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof registry.upsertSetting>[1];
    ok(res, await registry.upsertSetting(getContext(req), body));
  }),
);

router.get(
  '/settings/:key',
  requirePermission('platform.settings.read'),
  validate({ params: settingKeyParam }),
  asyncHandler(async (req, res) => {
    ok(res, await registry.getSetting(req.params.key));
  }),
);

router.delete(
  '/settings/:key',
  requirePermission('platform.settings.write'),
  validate({ params: settingKeyParam }),
  asyncHandler(async (req, res) => {
    await registry.deleteSetting(getContext(req), req.params.key);
    noContent(res);
  }),
);

// ── Incidents (blueprint 13) ────────────────────────────────────────────────

/** The severity table: criteria, targets, who is told, whether a review is due. */
router.get(
  '/incidents/severities',
  requirePermission('platform.incidents.read'),
  asyncHandler(async (_req, res) => {
    ok(res, { severities: Object.values(SEVERITY_POLICIES) });
  }),
);

router.get(
  '/incidents/summary',
  requirePermission('platform.incidents.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await incidents.incidentSummary());
  }),
);

router.get(
  '/incidents',
  requirePermission('platform.incidents.read'),
  validate({ query: incidentListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof incidents.listIncidents>[0];
    const { items, totalItems } = await incidents.listIncidents(query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/incidents',
  requirePermission('platform.incidents.write'),
  validate({ body: createIncidentSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof incidents.createIncident>[1];
    const view = await incidents.createIncident(getContext(req), body);
    created(res, view, `/api/v1/platform/incidents/${view.incident.id}`);
  }),
);

router.get(
  '/incidents/:id',
  requirePermission('platform.incidents.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await incidents.getIncident(req.params.id));
  }),
);

router.patch(
  '/incidents/:id',
  requirePermission('platform.incidents.write'),
  validate({ params: idParam, body: updateIncidentSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof incidents.updateIncident>[2];
    ok(res, await incidents.updateIncident(getContext(req), req.params.id, body));
  }),
);

router.post(
  '/incidents/:id/status',
  requirePermission('platform.incidents.write'),
  validate({ params: idParam, body: incidentStatusSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof incidents.setIncidentStatus>[2];
    ok(res, await incidents.setIncidentStatus(getContext(req), req.params.id, body));
  }),
);

// ── Job runs (blueprint 13) ─────────────────────────────────────────────────

router.get(
  '/jobs/health',
  requirePermission('platform.jobs.read'),
  asyncHandler(async (_req, res) => {
    ok(res, { jobs: await operations.jobHealthReport() });
  }),
);

router.get(
  '/jobs',
  requirePermission('platform.jobs.read'),
  validate({ query: jobRunListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof operations.listJobRuns>[0];
    const { items, totalItems } = await operations.listJobRuns(query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

// ── Release notes (blueprint 17) ────────────────────────────────────────────

/**
 * Readable by any signed-in user on purpose. The service hides drafts and
 * respects the audience list, so a school sees its own changelog and nothing
 * that was written for the platform team.
 */
router.get(
  '/releases',
  validate({ query: releaseNoteListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof operations.listReleaseNotes>[1];
    const { items, totalItems } = await operations.listReleaseNotes(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/releases',
  requirePermission('platform.releases.write'),
  validate({ body: releaseNoteSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof operations.createReleaseNote>[1];
    const row = await operations.createReleaseNote(getContext(req), body);
    created(res, row, `/api/v1/platform/releases/${row.version}`);
  }),
);

router.get(
  '/releases/:version',
  validate({ params: versionParam }),
  asyncHandler(async (req, res) => {
    ok(res, await operations.getReleaseNote(getContext(req), req.params.version));
  }),
);

router.patch(
  '/releases/:version',
  requirePermission('platform.releases.write'),
  validate({ params: versionParam, body: updateReleaseNoteSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as Parameters<typeof operations.updateReleaseNote>[2];
    ok(res, await operations.updateReleaseNote(getContext(req), req.params.version, body));
  }),
);

export const platformRouter = router;
