// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard routes
// The mount point for `/api/v1/leaderboards`.
//
// Two permissions, and the split matters: `leaderboard.read` is held by learners and
// staff, `leaderboard.config` only by a school administrator. Teachers can look at a
// board but cannot create one or turn one on, because publishing a ranking of
// children is a school-level decision with a school-level blast radius.
//
// The opt-out route is the exception to the usual pattern — it takes no `studentId`
// and refuses to act on anybody but the caller. An opt-out an adult performs on a
// child's behalf is not an opt-out, so the service checks the actor is the learner
// and 403s otherwise, even for an administrator.
//
// Every route beyond the list goes through `assertEnabled`, so a school that has not
// turned leaderboards on gets a clean "feature disabled" rather than an empty board
// that looks broken.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as leaderboard from './leaderboard.service';
import {
  boardQuery,
  createLeaderboardSchema,
  leaderboardListQuery,
  optOutSchema,
  updateLeaderboardSchema,
} from './leaderboard.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

/** Where the learner stands across every published board. Declared before `/:id`. */
router.get(
  '/mine',
  requirePermission('leaderboard.read'),
  validate({ query: boardQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await leaderboard.myStandings(getContext(req), getSchoolId(req), studentId));
  }),
);

/** The boards a school has defined, including the ones still switched off. */
router.get(
  '/',
  requirePermission('leaderboard.read'),
  validate({ query: leaderboardListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof leaderboard.listBoards>[2];
    const { items, totalItems } = await leaderboard.listBoards(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Defining a board. It arrives inactive; publishing is a separate decision. */
router.post(
  '/',
  requirePermission('leaderboard.config'),
  validate({ body: createLeaderboardSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof leaderboard.createBoard>[2];
    created(res, await leaderboard.createBoard(getContext(req), getSchoolId(req), input));
  }),
);

/**
 * The standing itself. Too few participants and it publishes nothing; beyond the top
 * N the caller sees only their own row.
 */
router.get(
  '/:id',
  requirePermission('leaderboard.read'),
  validate({ params: idParam, query: boardQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof leaderboard.getBoard>[3];
    ok(
      res,
      await leaderboard.getBoard(getContext(req), getSchoolId(req), req.params.id, query),
    );
  }),
);

/** Editing, including the switch that publishes it. Recomputes when meaning changes. */
router.patch(
  '/:id',
  requirePermission('leaderboard.config'),
  validate({ params: idParam, body: updateLeaderboardSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof leaderboard.updateBoard>[3];
    ok(
      res,
      await leaderboard.updateBoard(getContext(req), getSchoolId(req), req.params.id, input),
    );
  }),
);

/** Archiving. The standings are kept — a position somebody was proud of survives. */
router.post(
  '/:id/archive',
  requirePermission('leaderboard.config'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await leaderboard.archiveBoard(getContext(req), getSchoolId(req), req.params.id));
  }),
);

/**
 * The learner's own choice about appearing. No `studentId` is accepted: this is the
 * one route on the platform an administrator cannot perform on somebody's behalf.
 */
router.post(
  '/:id/opt-out',
  requirePermission('leaderboard.read'),
  validate({ params: idParam, body: optOutSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof leaderboard.setOptOut>[3];
    ok(res, await leaderboard.setOptOut(getContext(req), getSchoolId(req), req.params.id, input));
  }),
);

/**
 * Recomputing now rather than waiting for the hourly job — for the administrator who
 * has just changed a setting and wants to see the effect before publishing.
 */
router.post(
  '/:id/recompute',
  requirePermission('leaderboard.config'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const ranked = await leaderboard.recomputeOne(
      getContext(req),
      getSchoolId(req),
      req.params.id,
    );
    ok(res, { ranked });
  }),
);

export const leaderboardRouter = router;
