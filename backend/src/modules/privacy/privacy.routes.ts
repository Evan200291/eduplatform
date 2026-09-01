// ─────────────────────────────────────────────────────────────────────────────
// Privacy routes
// Four mount points, because the four things a school does here answer to four
// different permissions and, in most schools, four different levels of trust:
//
//   /data-requests      datarequest.read / datarequest.write   — the rights queue
//   /consent            consent.read / consent.write           — the lawful basis register
//   /retention-policies retention.read / retention.write       — the clocks
//   /audit              audit.read.school                      — the trail, read-only
//
// Splitting them is not tidiness. A school administrator who may read the audit trail
// is not automatically a person who may set a deletion clock on three years of
// children's work, and a single `privacy.manage` permission would have made those the
// same act.
//
// Nothing here has a delete route. Not one of the four. Requests close, consent is
// withdrawn, policies pause, audit entries expire under retention — every path is a
// record of what happened rather than a way to make it not have happened.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, idSchema, intQuery, text, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as audit from './audit.query.service';
import * as consent from './consent.service';
import * as privacy from './privacy.service';
import * as retention from './retention.service';
import * as subjectExport from './subject-export.service';
import {
  auditListQuery,
  consentListQuery,
  createDataRequestSchema,
  dataRequestListQuery,
  recordConsentSchema,
  retentionListQuery,
  transitionDataRequestSchema,
  updateDataRequestSchema,
  upsertRetentionPolicySchema,
  withdrawConsentSchema,
} from './privacy.validation';

/** Every router here is school-scoped and authenticated the same way. */
function schoolRouter(): Router {
  const router = Router();
  router.use(authenticate, tenantContext, requireSchoolContext);
  return router;
}

// ─── Data subject rights ─────────────────────────────────────────────────────

const dataRequests = schoolRouter();

/** The compliance tile: open, overdue, and how long the school actually takes. */
dataRequests.get(
  '/summary',
  requirePermission('datarequest.read'),
  asyncHandler(async (req, res) => {
    ok(res, await privacy.requestSummary(getSchoolId(req)));
  }),
);

dataRequests.get(
  '/',
  requirePermission('datarequest.read'),
  validate({ query: dataRequestListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof privacy.listDataRequests>[2];
    const result = await privacy.listDataRequests(getContext(req), getSchoolId(req), query);
    // The two counts travel with every page: a queue you can only see one page of is
    // a queue whose size you do not know.
    paginated(res, result.items, query.page, query.pageSize, result.totalItems, {
      openCount: result.openCount,
      overdueCount: result.overdueCount,
    });
  }),
);

dataRequests.post(
  '/',
  requirePermission('datarequest.write'),
  validate({ body: createDataRequestSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof privacy.createDataRequest>[2];
    created(res, await privacy.createDataRequest(getContext(req), getSchoolId(req), input));
  }),
);

dataRequests.get(
  '/:id',
  requirePermission('datarequest.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await privacy.getDataRequest(getSchoolId(req), req.params.id));
  }),
);

dataRequests.patch(
  '/:id',
  requirePermission('datarequest.write'),
  validate({ params: idParam, body: updateDataRequestSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof privacy.updateDataRequest>[3];
    ok(
      res,
      await privacy.updateDataRequest(getContext(req), getSchoolId(req), req.params.id, input),
    );
  }),
);

/** Status is its own route because each destination demands its own evidence. */
dataRequests.post(
  '/:id/status',
  requirePermission('datarequest.write'),
  validate({ params: idParam, body: transitionDataRequestSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof privacy.transitionDataRequest>[3];
    ok(
      res,
      await privacy.transitionDataRequest(getContext(req), getSchoolId(req), req.params.id, input),
    );
  }),
);

/**
 * Assembling the subject access bundle. Answers with the manifest — including what was
 * withheld and why — so the person handling the request reads that before they send
 * anything to a family.
 */
dataRequests.post(
  '/:id/build-export',
  requirePermission('datarequest.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await subjectExport.buildSubjectExport(getContext(req), getSchoolId(req), req.params.id),
    );
  }),
);

dataRequests.get(
  '/:id/export',
  requirePermission('datarequest.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const file = await subjectExport.downloadSubjectExport(
      getContext(req),
      getSchoolId(req),
      req.params.id,
    );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.content.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(file.content);
  }),
);

// ─── Consent and lawful basis ────────────────────────────────────────────────

const consentRoutes = schoolRouter();

/** What the platform processes for, whether or not the school has answered yet. */
consentRoutes.get(
  '/purposes',
  requirePermission('consent.read'),
  asyncHandler(async (_req, res) => {
    ok(res, consent.PROCESSING_PURPOSES);
  }),
);

/** The register: every purpose, what is recorded against it, and the blanks. */
consentRoutes.get(
  '/register',
  requirePermission('consent.read'),
  asyncHandler(async (req, res) => {
    ok(res, await consent.consentRegister(getSchoolId(req)));
  }),
);

/** "What are we relying on for this, for this child, right now?" */
consentRoutes.get(
  '/effective',
  requirePermission('consent.read'),
  validate({ query: z.object({ purpose: text(120, 3), userId: idSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { purpose: string; userId?: string };
    ok(res, await consent.effectiveBasis(getSchoolId(req), query.purpose, query.userId));
  }),
);

consentRoutes.get(
  '/',
  requirePermission('consent.read'),
  validate({ query: consentListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof consent.listConsent>[2];
    const { items, totalItems } = await consent.listConsent(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Append-only: this withdraws the live row and writes a new one. */
consentRoutes.post(
  '/',
  requirePermission('consent.write'),
  validate({ body: recordConsentSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof consent.recordConsent>[2];
    created(res, await consent.recordConsent(getContext(req), getSchoolId(req), input));
  }),
);

consentRoutes.post(
  '/:id/withdraw',
  requirePermission('consent.write'),
  validate({ params: idParam, body: withdrawConsentSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof consent.withdrawConsent>[3];
    ok(
      res,
      await consent.withdrawConsent(getContext(req), getSchoolId(req), req.params.id, input),
    );
  }),
);

// ─── Retention ──────────────────────────────────────────────────────────────

const retentionRoutes = schoolRouter();

/** What a clock can be set on, what it is measured from, and the defaults. */
retentionRoutes.get(
  '/classes',
  requirePermission('retention.read'),
  asyncHandler(async (_req, res) => {
    ok(res, retention.retentionOptions());
  }),
);

retentionRoutes.get(
  '/',
  requirePermission('retention.read'),
  validate({ query: retentionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof retention.listPolicies>[2];
    const { items, totalItems } = await retention.listPolicies(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** PUT, not POST: one policy per school per data class, so setting it is idempotent. */
retentionRoutes.put(
  '/',
  requirePermission('retention.write'),
  validate({ body: upsertRetentionPolicySchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof retention.upsertPolicy>[2];
    ok(res, await retention.upsertPolicy(getContext(req), getSchoolId(req), input));
  }),
);

retentionRoutes.post(
  '/:id/pause',
  requirePermission('retention.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await retention.setPolicyActive(getContext(req), getSchoolId(req), req.params.id, false));
  }),
);

retentionRoutes.post(
  '/:id/resume',
  requirePermission('retention.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await retention.setPolicyActive(getContext(req), getSchoolId(req), req.params.id, true));
  }),
);

/**
 * Running one policy now, in one capped batch, so an administrator can watch what a
 * clock does before trusting it to a job at 3am. Same code path as the nightly run.
 */
retentionRoutes.post(
  '/:id/run',
  requirePermission('retention.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await retention.runPolicyNow(getContext(req), getSchoolId(req), req.params.id));
  }),
);

// ─── Audit trail ────────────────────────────────────────────────────────────

const auditRoutes = schoolRouter();

/** Denied attempts and impersonation first; that is the point of the page. */
auditRoutes.get(
  '/summary',
  requirePermission('audit.read.school'),
  validate({ query: z.object({ days: intQuery(1, 365, 30) }) }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { days: number };
    ok(res, await audit.auditSummary(getSchoolId(req), query.days));
  }),
);

/** The trail for one record: "who changed this, and when?" */
auditRoutes.get(
  '/target/:targetType/:targetId',
  requirePermission('audit.read.school'),
  validate({ params: z.object({ targetType: text(60, 2), targetId: text(32, 1) }) }),
  asyncHandler(async (req, res) => {
    ok(res, await audit.targetHistory(getSchoolId(req), req.params.targetType, req.params.targetId));
  }),
);

auditRoutes.get(
  '/',
  requirePermission('audit.read.school'),
  validate({ query: auditListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof audit.listAuditEntries>[2];
    const { items, totalItems } = await audit.listAuditEntries(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** The only place IP address and user agent are returned. */
auditRoutes.get(
  '/:id',
  requirePermission('audit.read.school'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await audit.getAuditEntry(getSchoolId(req), req.params.id));
  }),
);

export const dataRequestRouter = dataRequests;
export const consentRouter = consentRoutes;
export const retentionRouter = retentionRoutes;
export const auditRouter = auditRoutes;
