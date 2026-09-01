// ─────────────────────────────────────────────────────────────────────────────
// User, role, invitation and group routes
// Everything here operates inside the active school. `/me` is the self-service
// slice available to every signed-in user, learners included.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler';
import { created, noContent, ok, paginated } from '../../core/http/respond';
import { idParam, idSchema, validate } from '../../core/http/validate';
import { listQuerySchema } from '../../core/http/pagination';
import { authenticate, getContext, getSchoolId } from '../../core/middleware/authenticate';
import { heavyOperationRateLimit } from '../../core/middleware/rate-limit';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import * as invitations from './invitations.service';
import * as users from './users.service';
import {
  assignRoleSchema,
  bulkCreateStudentsSchema,
  createGroupSchema,
  createInvitationSchema,
  createUserSchema,
  groupMembersSchema,
  invitationListQuery,
  resetCredentialsSchema,
  revokeRoleSchema,
  updateGroupSchema,
  updateOwnProfileSchema,
  updateUserSchema,
  userListQuery,
  userStatusSchema,
} from './users.validation';

const router = Router();
router.use(authenticate, tenantContext);

// ── Self-service ────────────────────────────────────────────────────────────

router.patch(
  '/me',
  requirePermission('self.profile.update'),
  validate({ body: updateOwnProfileSchema }),
  asyncHandler(async (req, res) => {
    ok(res, await users.updateOwnProfile(getContext(req), req.body));
  }),
);

// ── Users ───────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireSchoolContext,
  requirePermission('user.read'),
  validate({ query: userListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof userListQuery>;
    const { items, totalItems } = await users.listUsers(getContext(req), getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

router.post(
  '/',
  requireSchoolContext,
  requirePermission('user.create'),
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const result = await users.createUser(getContext(req), getSchoolId(req), req.body);
    created(res, result, `/api/v1/users/${result.user.id}`);
  }),
);

router.post(
  '/bulk-students',
  requireSchoolContext,
  requirePermission('user.create'),
  heavyOperationRateLimit,
  validate({ body: bulkCreateStudentsSchema }),
  asyncHandler(async (req, res) => {
    const results = await users.bulkCreateStudents(getContext(req), getSchoolId(req), req.body);
    created(res, results);
  }),
);

router.get(
  '/:id',
  requireSchoolContext,
  requirePermission('user.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await users.getUser(getContext(req), getSchoolId(req), req.params.id));
  }),
);

router.patch(
  '/:id',
  requireSchoolContext,
  requirePermission('user.update'),
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await users.updateUser(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.post(
  '/:id/status',
  requireSchoolContext,
  requirePermission('user.suspend'),
  validate({ params: idParam, body: userStatusSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await users.setUserStatus(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.status,
        req.body.reason,
      ),
    );
  }),
);

router.post(
  '/:id/credentials',
  requireSchoolContext,
  requirePermission('user.credentials.reset'),
  validate({ params: idParam, body: resetCredentialsSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await users.resetCredentials(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

router.post(
  '/:id/roles',
  requireSchoolContext,
  requirePermission('role.assign'),
  validate({ params: idParam, body: assignRoleSchema }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await users.assignRole(getContext(req), getSchoolId(req), req.params.id, req.body),
    );
  }),
);

router.delete(
  '/roles/:assignmentId',
  requireSchoolContext,
  requirePermission('role.revoke'),
  validate({
    params: z.object({ assignmentId: idSchema }),
    body: revokeRoleSchema,
  }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await users.revokeRole(
        getContext(req),
        getSchoolId(req),
        req.params.assignmentId,
        req.body.reason,
      ),
    );
  }),
);

export const userRouter = router;

// ── Invitations ─────────────────────────────────────────────────────────────

const invitationRouter = Router();
invitationRouter.use(authenticate, tenantContext, requireSchoolContext);

invitationRouter.get(
  '/',
  requirePermission('invitation.read'),
  validate({ query: invitationListQuery }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof invitationListQuery>;
    const { items, totalItems } = await invitations.listInvitations(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

invitationRouter.post(
  '/',
  requirePermission('invitation.create'),
  validate({ body: createInvitationSchema }),
  asyncHandler(async (req, res) => {
    created(res, await invitations.createInvitation(getContext(req), getSchoolId(req), req.body));
  }),
);

invitationRouter.delete(
  '/:id',
  requirePermission('invitation.revoke'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await invitations.revokeInvitation(getContext(req), getSchoolId(req), req.params.id));
  }),
);

export const invitationRouterInstance = invitationRouter;

// ── Groups ──────────────────────────────────────────────────────────────────

const groupRouter = Router();
groupRouter.use(authenticate, tenantContext, requireSchoolContext);

groupRouter.get(
  '/',
  requirePermission('usergroup.read'),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const { items, totalItems } = await invitations.listGroups(getSchoolId(req), query);
    paginated(res, items, query.page, query.pageSize, totalItems);
  }),
);

groupRouter.post(
  '/',
  requirePermission('usergroup.write'),
  validate({ body: createGroupSchema }),
  asyncHandler(async (req, res) => {
    created(res, await invitations.createGroup(getContext(req), getSchoolId(req), req.body));
  }),
);

groupRouter.get(
  '/:id',
  requirePermission('usergroup.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await invitations.getGroup(getSchoolId(req), req.params.id));
  }),
);

groupRouter.patch(
  '/:id',
  requirePermission('usergroup.write'),
  validate({ params: idParam, body: updateGroupSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await invitations.updateGroup(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body,
      ),
    );
  }),
);

groupRouter.post(
  '/:id/members',
  requirePermission('usergroup.write'),
  validate({ params: idParam, body: groupMembersSchema }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await invitations.addGroupMembers(
        getContext(req),
        getSchoolId(req),
        req.params.id,
        req.body.userIds,
      ),
    );
  }),
);

groupRouter.delete(
  '/:id/members',
  requirePermission('usergroup.write'),
  validate({ params: idParam, body: groupMembersSchema }),
  asyncHandler(async (req, res) => {
    await invitations.removeGroupMembers(
      getContext(req),
      getSchoolId(req),
      req.params.id,
      req.body.userIds,
    );
    noContent(res);
  }),
);

export const userGroupRouter = groupRouter;
