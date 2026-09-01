// ─────────────────────────────────────────────────────────────────────────────
// Content routes — governance
// Mounted as `/content-ownership`, `/content-publications`, `/content-reports`
// and `/content-moderation-reviews`. Sibling of content.routes.ts.
//
// One access rule is worth stating: any signed-in user may raise a report
// (`content.report.create`, which learners hold), but listing the school's
// reports or resolving one requires `content.report.review`. A learner reading
// `/content-reports` therefore gets only the reports they filed, enforced by
// passing their own id as `restrictToReporterId` rather than by a query flag.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getActor, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as governance from './content.governance.service';
import {
  contentReportListQuery,
  createContentReportSchema,
  createModerationReviewSchema,
  moderationReviewListQuery,
  ownershipListQuery,
  publicationListQuery,
  resolveContentReportSchema,
  setOwnershipSchema,
} from './content.validation';

/** Every governance router shares the same authenticated, tenant-scoped stack. */
function governanceRouter(): Router {
  const instance = Router();
  instance.use(authenticate, tenantContext, requireSchoolContext);
  return instance;
}

// ── Ownership and licensing (blueprint 05) ──────────────────────────────────

const ownership = governanceRouter();

ownership.get(
  '/',
  requirePermission('content.ownership.read'),
  validate({ query: ownershipListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof governance.listOwnershipRecords>[1];
    const { items, totalItems } = await governance.listOwnershipRecords(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Upsert: one record per target, so PUT is the honest verb. */
ownership.put(
  '/',
  requirePermission('content.ownership.write'),
  validate({ body: setOwnershipSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await governance.setOwnershipRecord(getContext(req), getSchoolId(req), req.body));
  }),
);

export const contentOwnershipRouter = ownership;

// ── Publication history (blueprint 12) ──────────────────────────────────────

const publications = governanceRouter();

publications.get(
  '/',
  requirePermission('activity.read'),
  validate({ query: publicationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof governance.listPublications>[1];
    const { items, totalItems } = await governance.listPublications(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

export const contentPublicationRouter = publications;

// ── Content reports (blueprint 10 safety) ───────────────────────────────────

const reports = governanceRouter();

/**
 * A reviewer sees the school's reports; anyone else sees only their own. The
 * restriction is derived from the actor's permissions, never from `?mine`, which
 * only lets a reviewer narrow the list voluntarily.
 */
reports.get(
  '/',
  requirePermission('content.report.create'),
  validate({ query: contentReportListQuery }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req);
    const canReview = actor.permissions.has('content.report.review');
    const query = req.query as unknown as Parameters<typeof governance.listContentReports>[1];
    const restrictTo = !canReview || query.mine ? actor.userId : undefined;

    const { items, totalItems } = await governance.listContentReports(
      getSchoolId(req),
      query,
      restrictTo,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

reports.post(
  '/',
  requirePermission('content.report.create'),
  validate({ body: createContentReportSchema }),
  asyncHandler(async (req, res) => {
    const report = await governance.createContentReport(getContext(req), getSchoolId(req), req.body);
    created(res, report, `/api/v1/content-reports/${report.id}`);
  }),
);

reports.get(
  '/:id',
  requirePermission('content.report.create'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const actor = getActor(req);
    const restrictTo = actor.permissions.has('content.report.review') ? undefined : actor.userId;
    ok(res, await governance.getContentReport(getSchoolId(req), req.params.id, restrictTo));
  }),
);

reports.post(
  '/:id/resolve',
  requirePermission('content.report.review'),
  validate({ params: idParam, body: resolveContentReportSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await governance.resolveContentReport(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

export const contentReportRouter = reports;

// ── Moderation reviews ──────────────────────────────────────────────────────

const reviews = governanceRouter();

reviews.get(
  '/',
  requirePermission('content.report.review'),
  validate({ query: moderationReviewListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof governance.listModerationReviews>[1];
    const { items, totalItems } = await governance.listModerationReviews(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** A review recorded without a report, e.g. a proactive content sweep. */
reviews.post(
  '/',
  requirePermission('content.report.review'),
  validate({ body: createModerationReviewSchema }),
  asyncHandler(async (req, res) => {
    created(res, await governance.createModerationReview(getContext(req), getSchoolId(req), req.body));
  }),
);

export const contentModerationReviewRouter = reviews;

