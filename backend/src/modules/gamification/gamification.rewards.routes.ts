// ─────────────────────────────────────────────────────────────────────────────
// Gamification routes — streaks and rewards
// The second half of the `/api/v1/gamification` surface. Kept separate from the
// points and badge routes so neither file grows past comfortable reading length.
//
// `reward.redeem` is the learner's permission; `reward.write` is the school's. That
// is the whole authorisation story here — a learner unlocks and wears things, staff
// define what exists and may grant it outright. Blueprint 03 keeps the shop
// cosmetic, so nothing on these routes can gate learning content.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { getContext, getSchoolId } from '../../core/middleware/authenticate';
import {
  requireAnyPermission,
  requirePermission,
} from '../../core/middleware/require-permission';
import * as rewards from './rewards.service';
import * as streaks from './streaks.service';
import {
  createRewardSchema,
  equipRewardSchema,
  grantFreezeSchema,
  grantRewardSchema,
  redeemRewardSchema,
  rewardListQuery,
  streakConfigSchema,
  streakListQuery,
  studentRewardListQuery,
  summaryQuery,
  updateRewardSchema,
  type StreakConfigInput,
} from './gamification.validation';

export const streaksAndRewardsRouter = Router();

// ── Streaks ─────────────────────────────────────────────────────────────────

/** A teacher's habit view across their classes, or a learner's own row. */
streaksAndRewardsRouter.get(
  '/streaks',
  requirePermission('gamification.read'),
  validate({ query: streakListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof streaks.listStreaks>[2];
    const { items, totalItems } = await streaks.listStreaks(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Every streak kind, with a zero row where none exists yet, so the UI is stable. */
streaksAndRewardsRouter.get(
  '/streaks/mine',
  requirePermission('gamification.read'),
  validate({ query: summaryQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await streaks.streaksFor(getContext(req), getSchoolId(req), studentId));
  }),
);

/**
 * Restores grace after an authorised absence. Either gamification config or the
 * points-adjust permission is enough: both are held by the people who would make
 * this call, and requiring both would put it out of a class teacher's reach.
 */
streaksAndRewardsRouter.post(
  '/streaks/freeze',
  requireAnyPermission('gamification.config', 'points.adjust'),
  validate({ body: grantFreezeSchema }),
  asyncHandler(async (req, res) => {
    created(res, await streaks.grantFreeze(getContext(req), getSchoolId(req), req.body));
  }),
);

/** The grace-period, weekend and freeze-cap knobs for this school's streaks. */
streaksAndRewardsRouter.get(
  '/streaks/config',
  requirePermission('gamification.config'),
  asyncHandler(async (req, res) => {
    ok(res, await streaks.getStreakConfig(getSchoolId(req)));
  }),
);

streaksAndRewardsRouter.put(
  '/streaks/config',
  requirePermission('gamification.config'),
  validate({ body: streakConfigSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as StreakConfigInput;
    ok(res, await streaks.updateStreakConfig(getContext(req), getSchoolId(req), input));
  }),
);

// ── Rewards a learner owns ──────────────────────────────────────────────────

streaksAndRewardsRouter.get(
  '/rewards/mine',
  requirePermission('reward.read'),
  validate({ query: studentRewardListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof rewards.listStudentRewards>[2];
    const { items, totalItems } = await rewards.listStudentRewards(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

// ── The catalogue ───────────────────────────────────────────────────────────

streaksAndRewardsRouter.get(
  '/rewards',
  requirePermission('reward.read'),
  validate({ query: rewardListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof rewards.listRewards>[2];
    const result = await rewards.listRewards(getContext(req), getSchoolId(req), query);
    paginated(res, result.items, query.page, query.pageSize, result.totalItems, result.meta);
  }),
);

streaksAndRewardsRouter.post(
  '/rewards',
  requirePermission('reward.write'),
  validate({ body: createRewardSchema }),
  asyncHandler(async (req, res) => {
    created(res, await rewards.createReward(getContext(req), getSchoolId(req), req.body));
  }),
);

streaksAndRewardsRouter.get(
  '/rewards/:id',
  requirePermission('reward.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await rewards.getReward(getContext(req), getSchoolId(req), req.params.id));
  }),
);

streaksAndRewardsRouter.patch(
  '/rewards/:id',
  requirePermission('reward.write'),
  validate({ params: idParam, body: updateRewardSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await rewards.updateReward(getContext(req), getSchoolId(req), req.params.id, req.body));
  }),
);

/** Withdrawn from the shop. Learners who already own it keep it. */
streaksAndRewardsRouter.post(
  '/rewards/:id/archive',
  requirePermission('reward.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await rewards.archiveReward(getContext(req), getSchoolId(req), req.params.id));
  }),
);

// ── Unlocking and wearing ───────────────────────────────────────────────────

/** A learner unlocking something their balance reaches. No ledger debit — see the
 *  header of `rewards.service.ts` for why a spend is not a negative entry. */
streaksAndRewardsRouter.post(
  '/rewards/:id/redeem',
  requirePermission('reward.redeem'),
  validate({ params: idParam, body: redeemRewardSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await rewards.redeemReward(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

/** Staff giving a reward outright. Costs nothing: recognition should not need a balance. */
streaksAndRewardsRouter.post(
  '/rewards/:id/grant',
  requirePermission('reward.write'),
  validate({ params: idParam, body: grantRewardSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await rewards.grantReward(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

streaksAndRewardsRouter.post(
  '/rewards/:id/equip',
  requirePermission('reward.redeem'),
  validate({ params: idParam, body: equipRewardSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await rewards.equipReward(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);
