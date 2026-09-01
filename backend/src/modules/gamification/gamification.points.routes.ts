// ─────────────────────────────────────────────────────────────────────────────
// Gamification routes — points and badges
// One mount, `/api/v1/gamification`, split across two files: this one carries the
// ledger and the badge catalogue, `gamification.rewards.routes.ts` carries streaks
// and the reward shop. Both are attached to the same router in
// `gamification.routes.ts`, so the URL surface is one thing and the code is two
// readable halves.
//
// Permissions do the audience split, as everywhere else. `points.read` and
// `badge.read` are held by learners and staff alike; `points.award`, `points.adjust`,
// `badge.write` and `badge.award` are staff-only. Each service then narrows the data
// to whoever is asking, so a learner reading `/points/ledger` sees only their own
// entries without the route needing to know that.
//
// Collection sub-paths (`/badges/awards`, `/badges/progress`) are declared before
// `/badges/:id` so neither is ever read as a badge id.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission } from '../../core/middleware/require-permission';
import * as badges from './badges.service';
import * as gamification from './gamification.service';
import * as points from './points.service';
import {
  adjustPointsSchema,
  awardBadgeSchema,
  awardPointsSchema,
  badgeListQuery,
  createBadgeSchema,
  ledgerListQuery,
  reversePointsSchema,
  revokeBadgeSchema,
  studentBadgeListQuery,
  summaryQuery,
  updateBadgeSchema,
} from './gamification.validation';

export const pointsAndBadgesRouter = Router();

// ── Profile ─────────────────────────────────────────────────────────────────

/** The achievements screen in one call: points, badges, streaks, what is worn. */
pointsAndBadgesRouter.get(
  '/profile',
  requirePermission('gamification.read'),
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await gamification.gamificationProfile(getContext(req), getSchoolId(req), studentId));
  }),
);

/** Counts for the admin panel's gamification page. */
pointsAndBadgesRouter.get(
  '/config',
  requirePermission('gamification.config'),
  asyncHandler(async (req, res) => {
    ok(res, await gamification.gamificationConfigSummary(getSchoolId(req)));
  }),
);

// ── Points ──────────────────────────────────────────────────────────────────

pointsAndBadgesRouter.get(
  '/points/ledger',
  requirePermission('points.read'),
  validate({ query: ledgerListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof points.listLedger>[2];
    const { items, totalItems, filteredTotal } = await points.listLedger(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems, { filteredTotal });
  }),
);

pointsAndBadgesRouter.get(
  '/points/summary',
  requirePermission('points.read'),
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await points.pointsSummary(getContext(req), getSchoolId(req), studentId));
  }),
);

/** The balance on its own, for a header badge that should not fetch a whole summary. */
pointsAndBadgesRouter.get(
  '/points/balance',
  requirePermission('points.read'),
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { studentId: requested } = req.query as unknown as { studentId?: string };
    const studentId = await points.resolveStudent(getContext(req), getSchoolId(req), requested);
    ok(res, { studentId, balance: await points.balanceFor(studentId) });
  }),
);

pointsAndBadgesRouter.post(
  '/points/award',
  requirePermission('points.award'),
  validate({ body: awardPointsSchema }),
  asyncHandler(async (req, res) => {
    created(res, await points.awardPoints(getContext(req), getSchoolId(req), req.body));
  }),
);

/** A correction, either direction. The note is required by the schema. */
pointsAndBadgesRouter.post(
  '/points/adjust',
  requirePermission('points.adjust'),
  validate({ body: adjustPointsSchema }),
  asyncHandler(async (req, res) => {
    created(res, await points.adjustPoints(getContext(req), getSchoolId(req), req.body));
  }),
);

/**
 * Reverses one entry. Writes a mirror entry rather than editing the original, which
 * is the ledger principle the whole module is built on.
 */
pointsAndBadgesRouter.post(
  '/points/ledger/:id/reverse',
  requirePermission('points.adjust'),
  validate({ params: idParam, body: reversePointsSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await points.reverseEntry(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

// ── Badges: the learner's cabinet ───────────────────────────────────────────

pointsAndBadgesRouter.get(
  '/badges/awards',
  requirePermission('badge.read'),
  validate({ query: studentBadgeListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof badges.listStudentBadges>[2];
    const { items, totalItems } = await badges.listStudentBadges(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Clears the "new badge" marker, so a celebration is not lost to a glance. */
pointsAndBadgesRouter.post(
  '/badges/awards/seen',
  requirePermission('badge.read'),
  validate({ body: summaryQuery }),
  asyncHandler(async (req, res) => {
    const marked = await badges.markBadgesSeen(
      getContext(req),
      getSchoolId(req),
      req.body?.studentId,
    );
    ok(res, { marked });
  }),
);

pointsAndBadgesRouter.get(
  '/badges/progress',
  requirePermission('badge.read'),
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await badges.badgeProgressFor(getContext(req), getSchoolId(req), studentId));
  }),
);

// ── Badges: the catalogue ───────────────────────────────────────────────────

pointsAndBadgesRouter.get(
  '/badges',
  requirePermission('badge.read'),
  validate({ query: badgeListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof badges.listBadges>[2];
    const { items, totalItems } = await badges.listBadges(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

pointsAndBadgesRouter.post(
  '/badges',
  requirePermission('badge.write'),
  validate({ body: createBadgeSchema }),
  asyncHandler(async (req, res) => {
    created(res, await badges.createBadge(getContext(req), getSchoolId(req), req.body));
  }),
);

pointsAndBadgesRouter.get(
  '/badges/:id',
  requirePermission('badge.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await badges.getBadge(getContext(req), getSchoolId(req), req.params.id));
  }),
);

pointsAndBadgesRouter.patch(
  '/badges/:id',
  requirePermission('badge.write'),
  validate({ params: idParam, body: updateBadgeSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await badges.updateBadge(getContext(req), getSchoolId(req), req.params.id, req.body));
  }),
);

/** Archived, never deleted: awards point at it and an achievement should not vanish. */
pointsAndBadgesRouter.post(
  '/badges/:id/archive',
  requirePermission('badge.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await badges.archiveBadge(getContext(req), getSchoolId(req), req.params.id));
  }),
);

pointsAndBadgesRouter.post(
  '/badges/:id/award',
  requirePermission('badge.award'),
  validate({ params: idParam, body: awardBadgeSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await badges.awardBadge(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Withdraws an award and reverses its points. The row stays, stamped with who. */
pointsAndBadgesRouter.post(
  '/badges/:id/revoke',
  requirePermission('badge.award'),
  validate({ params: idParam, body: revokeBadgeSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await badges.revokeBadge(getContext(req), getSchoolId(req), req.params.id, req.body));
  }),
);
