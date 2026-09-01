// ─────────────────────────────────────────────────────────────────────────────
// Companion routes
// The mount point for `/api/v1/companion`.
//
// The permission split is the blueprint's ownership rule made concrete:
//
//   • `companion.read`     — learners see their own, staff see the learners they
//                            are responsible for. That is the whole staff view.
//   • `companion.interact` — the learner's own actions: adopting, renaming,
//                            dressing, saying hello. Teachers do not hold it,
//                            because a teacher tapping a child's companion would
//                            put a visit on the child's streak that the child did
//                            not make.
//   • `companion.config`   — a school administrator granting growth for learning
//                            that happened away from a screen, and setting a
//                            companion up alongside a very young learner.
//
// There is no delete, no reset and no "take growth back" route anywhere in this
// file. That is deliberate: blueprint 03 gives a companion no death and no severe
// decay, and an endpoint that could undo a child's growth would be exactly that.
//
// `/summary`, `/events`, `/roster` and the rest are declared before any parameterised
// path so a word is never read as an id — there are no id paths here today, and
// keeping the order means adding one later cannot quietly break the others.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { created, ok, paginated } from '../../core/http/respond';
import { validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import {
  requireAnyPermission,
  requirePermission,
  requireSchoolContext,
} from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as companion from './companion.service';
import {
  companionEventListQuery,
  companionListQuery,
  companionQuery,
  createCompanionSchema,
  grantGrowthSchema,
  growthConfigSchema,
  interactSchema,
  SPECIES_KEYS,
  updateCompanionSchema,
  type GrowthConfigInput,
} from './companion.validation';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext);

// ── The learner's companion ─────────────────────────────────────────────────

/**
 * The creatures on offer. Static, but served from the API so the frontend never has
 * to keep its own copy of the list in sync with what the validator will accept.
 */
router.get(
  '/species',
  requirePermission('companion.read'),
  // eslint-disable-next-line @typescript-eslint/require-await -- asyncHandler expects an async handler shape.
  asyncHandler(async (_req, res) => {
    ok(res, { species: SPECIES_KEYS });
  }),
);

/**
 * The companion itself, mood brought up to date. A learner who has not adopted one
 * gets `companion: null` and a 200 — an empty state, not an error.
 */
router.get(
  '/',
  requirePermission('companion.read'),
  validate({ query: companionQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await companion.getCompanion(getContext(req), getSchoolId(req), studentId));
  }),
);

/** Enough for a dashboard card without loading the whole creature. */
router.get(
  '/summary',
  requirePermission('companion.read'),
  validate({ query: companionQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.query as unknown as { studentId?: string };
    ok(res, await companion.companionSummary(getContext(req), getSchoolId(req), studentId));
  }),
);

/** Adopting. One per learner; a second attempt is a 409, not a silent no-op. */
router.post(
  '/',
  requireAnyPermission('companion.interact', 'companion.config'),
  validate({ body: createCompanionSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof companion.createCompanion>[2];
    created(res, await companion.createCompanion(getContext(req), getSchoolId(req), input));
  }),
);

/** Renaming and redressing. Cosmetic only — species and growth are not writable. */
router.patch(
  '/',
  requireAnyPermission('companion.interact', 'companion.config'),
  validate({ body: updateCompanionSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof companion.updateCompanion>[2];
    ok(res, await companion.updateCompanion(getContext(req), getSchoolId(req), input));
  }),
);

/**
 * Saying hello, playing, praising. Always a 200: once the day's small allowance is
 * used up the visit still counts and the response says `growthAwarded: 0`, because
 * an error here would tell a child off for wanting to see their companion.
 */
router.post(
  '/interact',
  requirePermission('companion.interact'),
  validate({ body: interactSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof companion.interact>[2];
    ok(res, await companion.interact(getContext(req), getSchoolId(req), input));
  }),
);

// ── History ─────────────────────────────────────────────────────────────────

/** The story of how the companion got here, newest first. */
router.get(
  '/events',
  requirePermission('companion.read'),
  validate({ query: companionEventListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof companion.listEvents>[2];
    const { items, totalItems } = await companion.listEvents(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** Acknowledging the celebrations, so they are not replayed on the next visit. */
router.post(
  '/events/seen',
  requirePermission('companion.interact'),
  validate({ body: companionQuery }),
  asyncHandler(async (req, res) => {
    const { studentId } = req.body as { studentId?: string };
    const seen = await companion.markEventsSeen(getContext(req), getSchoolId(req), studentId);
    ok(res, { seen });
  }),
);

// ── Staff ───────────────────────────────────────────────────────────────────

/**
 * Who has a companion and who has gone quiet. Scoped by
 * `accessibleStudentIds`, so a teacher sees their classes and nobody else's.
 */
router.get(
  '/roster',
  requirePermission('companion.read'),
  validate({ query: companionListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof companion.listCompanions>[2];
    const { items, totalItems } = await companion.listCompanions(
      getContext(req),
      getSchoolId(req),
      query,
    );
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/**
 * Growth for learning that happened off-screen. The note is required and lands in
 * the audit trail; learners without a companion are reported as skipped rather than
 * having one chosen for them.
 */
router.post(
  '/grant',
  requirePermission('companion.config'),
  validate({ body: grantGrowthSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as Parameters<typeof companion.grantGrowth>[2];
    ok(res, await companion.grantGrowth(getContext(req), getSchoolId(req), input));
  }),
);

// ── Growth configuration ────────────────────────────────────────────────────

/**
 * The stage ladder this school currently uses. Declared after `/roster` and
 * `/grant`, both fixed paths, so it never risks being read as an id.
 */
router.get(
  '/growth-config',
  requirePermission('companion.config'),
  asyncHandler(async (req, res) => {
    ok(res, await companion.getGrowthConfig(getSchoolId(req)));
  }),
);

/** Replacing the ladder wholesale — see `growthConfigSchema` for why it is all-or-nothing. */
router.put(
  '/growth-config',
  requirePermission('companion.config'),
  validate({ body: growthConfigSchema }),
  asyncHandler(async (req, res) => {
    const { thresholds } = req.body as GrowthConfigInput;
    ok(res, await companion.updateGrowthConfig(getContext(req), getSchoolId(req), thresholds));
  }),
);

export const companionRouter = router;
