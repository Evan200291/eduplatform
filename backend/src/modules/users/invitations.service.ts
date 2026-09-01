// ─────────────────────────────────────────────────────────────────────────────
// Staff invitations and user groups
// Blueprint 05: staff join by invitation. The platform has no mail transport, so
// the invitation URL is returned to the inviting administrator to pass on
// through whatever channel the school already uses. Only the token's hash is
// stored, so the link cannot be recovered from the database later.
// ─────────────────────────────────────────────────────────────────────────────

import { InvitationStatus, RoleKey, type Prisma } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env';
import { recordAudit } from '../../core/audit/audit.service';
import { toKey } from '../../core/auth/codes';
import { createOpaqueToken } from '../../core/auth/tokens';
import type { ActorContext } from '../../core/context';
import { assertFeatureEnabled } from '../../core/features/feature.service';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake, type ListQuery } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { addDays } from '../../core/utils/dates';
import { SCHOOL_BOUND_ROLES } from '../../core/rbac/permissions';
import type {
  createGroupSchema,
  createInvitationSchema,
  updateGroupSchema,
} from './users.validation';

type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
type CreateGroupInput = z.infer<typeof createGroupSchema>;
type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// ── Invitations ─────────────────────────────────────────────────────────────

export async function listInvitations(
  schoolId: string,
  query: ListQuery & { status?: InvitationStatus },
) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.InvitationWhereInput = {
    schoolId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { email: { contains: query.search } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.invitation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        roleKey: true,
        scopeType: true,
        status: true,
        message: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedBy: { select: { id: true, displayName: true } },
      },
    }),
    prisma.invitation.count({ where }),
  ]);

  return { items, totalItems };
}

export async function createInvitation(
  context: ActorContext,
  schoolId: string,
  input: CreateInvitationInput,
): Promise<{ id: string; email: string; expiresAt: Date; invitationUrl: string }> {
  if (input.roleKey === RoleKey.STUDENT) {
    throw badRequest('Learner accounts are created directly, not by invitation.');
  }
  if (!context.actor.isPlatformStaff && !SCHOOL_BOUND_ROLES.includes(input.roleKey)) {
    throw badRequest('Only platform staff can invite that role.');
  }

  const pending = await prisma.invitation.findFirst({
    where: { schoolId, email: input.email, status: InvitationStatus.PENDING },
    select: { id: true },
  });
  if (pending) throw conflict('There is already a pending invitation for that address.');

  const organizationId = (
    await prisma.school.findUnique({ where: { id: schoolId }, select: { organizationId: true } })
  )?.organizationId;

  const token = createOpaqueToken(32);
  const expiresAt = addDays(new Date(), input.expiresInDays);

  const invitation = await prisma.invitation.create({
    data: {
      schoolId,
      organizationId,
      email: input.email,
      roleKey: input.roleKey,
      scopeType: input.scopeType,
      message: input.message,
      tokenHash: token.hash,
      expiresAt,
      invitedById: context.actor.userId,
    },
    select: { id: true, email: true, expiresAt: true },
  });

  recordAudit(context, {
    action: 'invitation.create',
    targetType: 'Invitation',
    targetId: invitation.id,
    schoolId,
    summary: `Invited ${input.email} as ${input.roleKey}.`,
  });

  return {
    ...invitation,
    invitationUrl: `${env.webPublicUrl}/accept-invitation?token=${token.token}`,
  };
}

export async function revokeInvitation(context: ActorContext, schoolId: string, id: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { id, schoolId },
    select: { id: true, email: true, status: true },
  });
  if (!invitation) throw notFound('Invitation');
  if (invitation.status !== InvitationStatus.PENDING) {
    throw badRequest('Only a pending invitation can be revoked.');
  }

  const updated = await prisma.invitation.update({
    where: { id },
    data: { status: InvitationStatus.REVOKED, revokedAt: new Date() },
  });

  recordAudit(context, {
    action: 'invitation.revoke',
    targetType: 'Invitation',
    targetId: id,
    schoolId,
    summary: `Revoked the invitation for ${invitation.email}.`,
  });

  return updated;
}

// ── User groups ─────────────────────────────────────────────────────────────

export async function listGroups(schoolId: string, query: ListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.UserGroupWhereInput = {
    schoolId,
    archivedAt: null,
    ...(query.search ? { name: { contains: query.search } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.userGroup.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        isSystem: true,
        createdAt: true,
        _count: { select: { members: true, entitlements: true } },
      },
    }),
    prisma.userGroup.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getGroup(schoolId: string, id: string) {
  const group = await prisma.userGroup.findFirst({
    where: { id, schoolId },
    include: {
      members: {
        select: {
          addedAt: true,
          user: {
            select: { id: true, displayName: true, primaryRole: true, status: true, email: true },
          },
        },
        orderBy: { addedAt: 'desc' },
      },
      entitlements: { select: { id: true, featureKey: true, enabled: true, reason: true } },
    },
  });
  if (!group) throw notFound('Group');
  return group;
}

export async function createGroup(
  context: ActorContext,
  schoolId: string,
  input: CreateGroupInput,
) {
  await assertFeatureEnabled('admin.userGroups', {
    organizationId: context.tenant.organizationId,
    schoolId,
  });

  const key = input.key ?? toKey(input.name);
  const existing = await prisma.userGroup.findFirst({
    where: { schoolId, key },
    select: { id: true },
  });
  if (existing) throw conflict('A group with that key already exists.');

  const group = await prisma.userGroup.create({
    data: {
      schoolId,
      name: input.name,
      key,
      description: input.description,
      createdById: context.actor.userId,
    },
  });

  recordAudit(context, {
    action: 'usergroup.create',
    targetType: 'UserGroup',
    targetId: group.id,
    schoolId,
    summary: `Created group "${group.name}".`,
  });

  return group;
}

export async function updateGroup(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateGroupInput,
) {
  const before = await prisma.userGroup.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Group');
  if (before.isSystem) throw badRequest('System groups cannot be edited.');

  const after = await prisma.userGroup.update({ where: { id }, data: input });

  recordAudit(context, {
    action: 'usergroup.update',
    targetType: 'UserGroup',
    targetId: id,
    schoolId,
    summary: `Updated group "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function addGroupMembers(
  context: ActorContext,
  schoolId: string,
  groupId: string,
  userIds: string[],
) {
  const group = await prisma.userGroup.findFirst({ where: { id: groupId, schoolId } });
  if (!group) throw notFound('Group');

  // Only users inside the same school can join; ids from elsewhere are dropped
  // silently rather than leaking whether they exist.
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, schoolId },
    select: { id: true },
  });

  const result = await prisma.userGroupMember.createMany({
    data: users.map((user) => ({
      groupId,
      userId: user.id,
      addedById: context.actor.userId,
    })),
    skipDuplicates: true,
  });

  recordAudit(context, {
    action: 'usergroup.member.add',
    targetType: 'UserGroup',
    targetId: groupId,
    schoolId,
    summary: `Added ${result.count} member(s) to "${group.name}".`,
  });

  return { added: result.count };
}

export async function removeGroupMembers(
  context: ActorContext,
  schoolId: string,
  groupId: string,
  userIds: string[],
) {
  const group = await prisma.userGroup.findFirst({ where: { id: groupId, schoolId } });
  if (!group) throw notFound('Group');

  const result = await prisma.userGroupMember.deleteMany({
    where: { groupId, userId: { in: userIds } },
  });

  recordAudit(context, {
    action: 'usergroup.member.remove',
    targetType: 'UserGroup',
    targetId: groupId,
    schoolId,
    summary: `Removed ${result.count} member(s) from "${group.name}".`,
  });

  return { removed: result.count };
}

/** Group ids a user belongs to, used when resolving user-group entitlements. */
export async function groupIdsForUser(userId: string): Promise<string[]> {
  const memberships = await prisma.userGroupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return memberships.map((membership) => membership.groupId);
}
