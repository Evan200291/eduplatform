// ─────────────────────────────────────────────────────────────────────────────
// Notification routes
// One mount, two audiences: everybody reads and manages their own inbox, and staff
// with `notification.send` / `notification.broadcast` may originate messages.
//
// `/preferences` and `/summary` are declared before `/:id` so neither is ever read
// as a notification id.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { accepted, ok } from '../../core/http/respond';
import { idParam, validate } from '../../core/http/validate';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { paginated } from '../../core/http/respond';
import * as inbox from './notifications.inbox.service';
import {
  broadcastSchema,
  markManySchema,
  notificationListQuery,
  preferenceSchema,
  sendNotificationSchema,
} from './notifications.validation';

const router = Router();
router.use(authenticate, tenantContext);

router.get(
  '/',
  requirePermission('notification.read'),
  validate({ query: notificationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Parameters<typeof inbox.listNotifications>[1];
    const { items, totalItems } = await inbox.listNotifications(getContext(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

/** The bell badge. Cheap enough to poll. */
router.get(
  '/summary',
  requirePermission('notification.read'),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.getUnreadSummary(getContext(req)));
  }),
);

router.get(
  '/preferences',
  requirePermission('notification.read'),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.getPreferences(getContext(req)));
  }),
);

router.put(
  '/preferences',
  requirePermission('notification.preference.write'),
  validate({ body: preferenceSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.updatePreferences(getContext(req), req.body));
  }),
);

router.post(
  '/read',
  requirePermission('notification.read'),
  validate({ body: markManySchema }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.markMany(getContext(req), req.body, 'READ'));
  }),
);

router.post(
  '/dismiss',
  requirePermission('notification.read'),
  validate({ body: markManySchema }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.markMany(getContext(req), req.body, 'DISMISS'));
  }),
);

// ── Staff-initiated messages ────────────────────────────────────────────────

router.post(
  '/send',
  requireSchoolContext,
  requirePermission('notification.send'),
  validate({ body: sendNotificationSchema }),
  asyncHandler(async (req, res) => {
    // 202: the rows are written now, delivery is settled by the dispatch job.
    accepted(res, await inbox.sendNotification(getContext(req), getSchoolId(req), req.body));
  }),
);

router.post(
  '/broadcast',
  requireSchoolContext,
  requirePermission('notification.broadcast'),
  validate({ body: broadcastSchema }),
  asyncHandler(async (req, res) => {
    accepted(res, await inbox.broadcast(getContext(req), getSchoolId(req), req.body));
  }),
);

// ── Single notification actions ─────────────────────────────────────────────

router.post(
  '/:id/read',
  requirePermission('notification.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.markRead(getContext(req), req.params.id));
  }),
);

router.post(
  '/:id/actioned',
  requirePermission('notification.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.markActioned(getContext(req), req.params.id));
  }),
);

router.post(
  '/:id/dismiss',
  requirePermission('notification.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await inbox.dismiss(getContext(req), req.params.id));
  }),
);

export const notificationRouter = router;
