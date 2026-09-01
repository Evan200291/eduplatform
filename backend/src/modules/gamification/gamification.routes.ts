// ─────────────────────────────────────────────────────────────────────────────
// Gamification router
// The mount point for `/api/v1/gamification`. The endpoints themselves live in two
// files — points and badges in one, streaks and rewards in the other — and both are
// attached here so the URL surface stays a single, reviewable thing.
//
// Authentication and tenancy are applied once, at the top, so no individual route
// can forget them.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authenticate } from '../../core/middleware/authenticate';
import { requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { pointsAndBadgesRouter } from './gamification.points.routes';
import { streaksAndRewardsRouter } from './gamification.rewards.routes';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

router.use(pointsAndBadgesRouter);
router.use(streaksAndRewardsRouter);

export const gamificationRouter = router;
