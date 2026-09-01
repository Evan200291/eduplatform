// ─────────────────────────────────────────────────────────────────────────────
// Notification inbox
// The recipient's side of blueprint 06: reading what arrived, acting on it, and
// controlling what arrives next. Staff-initiated sends live here too, because
// "a teacher told a class something" is an inbox event like any other.
//
// A recipient only ever reads their own inbox — every query is keyed on the
// authenticated user id, never on a `userId` parameter.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { NotificationState, RoleKey, UserStatus } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { assertCanAccessClass } from '../../core/rbac/scope.service';
import { enqueueMany, notifyUsers } from './notifications.service';
import type {
  BroadcastInput,
  MarkManyInput,
  NotificationListQuery,
  PreferenceInput,
  SendNotificationInput,
} from './notifications.validation';

const NOTIFICATION_SELECT = {
  id: true,
  category: true,
  priority: true,
  state: true,
  title: true,
  body: true,
  actionPath: true,
  actionLabel: true,
  sourceType: true,
  sourceId: true,
  groupKey: true,
  scheduledFor: true,
  deliveredAt: true,
  readAt: true,
  actionedAt: true,
  dismissedAt: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

const STAFF_ROLES: RoleKey[] = [
  RoleKey.SCHOOL_ADMIN,
  RoleKey.TEACHER,
  RoleKey.CURRICULUM_MANAGER,
  RoleKey.CONTENT_REVIEWER,
  RoleKey.SUPPORT_AGENT,
  RoleKey.REPORT_VIEWER,
  RoleKey.BILLING_ADMIN,
];

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listNotifications(context: ActorContext, query: NotificationListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.NotificationWhereInput = {
    userId: context.actor.userId,
    // A suppressed notification was never shown; it stays out of the inbox.
    state: query.state ?? { not: NotificationState.SUPPRESSED },
    ...(query.category ? { category: query.category } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.unreadOnly ? { readAt: null, dismissedAt: null } : {}),
    ...(query.includeDismissed ? {} : { dismissedAt: null }),
    ...(query.since ? { createdAt: { gte: query.since } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      select: NOTIFICATION_SELECT,
    }),
    prisma.notification.count({ where }),
  ]);

  return { items, totalItems };
}

/** The bell badge: unread totals, split by priority so urgency can be shown. */
export async function getUnreadSummary(context: ActorContext) {
  const base: Prisma.NotificationWhereInput = {
    userId: context.actor.userId,
    readAt: null,
    dismissedAt: null,
    state: { in: [NotificationState.PENDING, NotificationState.DELIVERED] },
  };

  const [total, byPriority, byCategory] = await Promise.all([
    prisma.notification.count({ where: base }),
    prisma.notification.groupBy({ by: ['priority'], where: base, _count: { _all: true } }),
    prisma.notification.groupBy({ by: ['category'], where: base, _count: { _all: true } }),
  ]);

  return {
    unread: total,
    byPriority: byPriority.map((row) => ({ priority: row.priority, count: row._count._all })),
    byCategory: byCategory.map((row) => ({ category: row.category, count: row._count._all })),
  };
}

// ── Acting ──────────────────────────────────────────────────────────────────

async function requireOwn(context: ActorContext, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, userId: context.actor.userId },
    select: { id: true, state: true, readAt: true },
  });
  if (!notification) throw notFound('Notification');
  return notification;
}

export async function markRead(context: ActorContext, id: string) {
  const existing = await requireOwn(context, id);
  const now = new Date();
  return prisma.notification.update({
    where: { id: existing.id },
    data: {
      readAt: existing.readAt ?? now,
      state: existing.state === NotificationState.ACTIONED ? undefined : NotificationState.READ,
    },
    select: NOTIFICATION_SELECT,
  });
}

/** Blueprint 06: every notification has an action, so "I did it" is a real state. */
export async function markActioned(context: ActorContext, id: string) {
  const existing = await requireOwn(context, id);
  const now = new Date();
  return prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: existing.readAt ?? now, actionedAt: now, state: NotificationState.ACTIONED },
    select: NOTIFICATION_SELECT,
  });
}

export async function dismiss(context: ActorContext, id: string) {
  const existing = await requireOwn(context, id);
  return prisma.notification.update({
    where: { id: existing.id },
    data: { dismissedAt: new Date(), state: NotificationState.DISMISSED },
    select: NOTIFICATION_SELECT,
  });
}

export async function markMany(context: ActorContext, input: MarkManyInput, action: 'READ' | 'DISMISS') {
  if (!input.all && (!input.ids || input.ids.length === 0)) {
    throw badRequest('Name the notifications to update, or set `all`.');
  }

  const now = new Date();
  const where: Prisma.NotificationWhereInput = {
    userId: context.actor.userId,
    dismissedAt: null,
    ...(input.all ? { readAt: null } : { id: { in: input.ids ?? [] } }),
  };

  const result = await prisma.notification.updateMany({
    where,
    data:
      action === 'READ'
        ? { readAt: now, state: NotificationState.READ }
        : { dismissedAt: now, state: NotificationState.DISMISSED },
  });

  return { updated: result.count };
}

// ── Preferences ─────────────────────────────────────────────────────────────

export async function getPreferences(context: ActorContext) {
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId: context.actor.userId },
  });
  if (existing) return existing;

  // Defaults are described rather than written, so a user who never changes
  // anything carries no row.
  return {
    userId: context.actor.userId,
    schoolId: context.tenant.schoolId ?? null,
    inAppEnabled: true,
    emailEnabled: true,
    pushEnabled: false,
    digestEnabled: true,
    digestFrequency: 'DAILY',
    quietHoursStart: null,
    quietHoursEnd: null,
    categoryOverrides: null,
  };
}

export async function updatePreferences(context: ActorContext, input: PreferenceInput) {
  const data = {
    inAppEnabled: input.inAppEnabled ?? undefined,
    emailEnabled: input.emailEnabled ?? undefined,
    pushEnabled: input.pushEnabled ?? undefined,
    digestEnabled: input.digestEnabled ?? undefined,
    digestFrequency: input.digestFrequency ?? undefined,
    quietHoursStart: input.quietHoursStart === undefined ? undefined : input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd === undefined ? undefined : input.quietHoursEnd,
    categoryOverrides:
      input.categoryOverrides === undefined
        ? undefined
        : (input.categoryOverrides as Prisma.InputJsonValue),
  };

  return prisma.notificationPreference.upsert({
    where: { userId: context.actor.userId },
    create: {
      userId: context.actor.userId,
      schoolId: context.tenant.schoolId ?? null,
      ...data,
    },
    update: data,
  });
}

// ── Sending ─────────────────────────────────────────────────────────────────

/** A member of staff notifying named recipients inside their own school. */
export async function sendNotification(
  context: ActorContext,
  schoolId: string,
  input: SendNotificationInput,
) {
  const recipients = await prisma.user.findMany({
    where: { id: { in: input.userIds }, schoolId, status: UserStatus.ACTIVE },
    select: { id: true },
  });
  if (recipients.length === 0) throw badRequest('None of those recipients are active in this school.');

  const created = await enqueueMany(
    recipients.map((user) => ({
      schoolId,
      userId: user.id,
      category: input.category,
      priority: input.priority,
      title: input.title,
      body: input.body,
      actionPath: input.actionPath ?? null,
      actionLabel: input.actionLabel ?? null,
      sourceType: input.sourceType ?? 'manual',
      sourceId: input.sourceId ?? context.actor.userId,
      groupKey: input.groupKey ?? null,
      scheduledFor: input.scheduledFor ?? null,
      expiresAt: input.expiresAt ?? null,
    })),
  );

  recordAudit(context, {
    action: 'notification.send',
    targetType: 'Notification',
    schoolId,
    summary: `Sent a ${input.category} notification to ${created} recipient(s).`,
    afterData: { requested: input.userIds.length, created, priority: input.priority },
  });

  return { requested: input.userIds.length, created };
}

/**
 * A school-wide announcement. Behind its own permission because the blast radius is
 * everyone: the audience is resolved from the roster here rather than trusted from
 * a client-supplied recipient list.
 */
export async function broadcast(context: ActorContext, schoolId: string, input: BroadcastInput) {
  const userIds = await resolveAudience(context, schoolId, input);
  if (userIds.length === 0) throw badRequest('That audience has no active members.');

  const created = await notifyUsers(userIds, {
    schoolId,
    category: input.category,
    priority: input.priority,
    title: input.title,
    body: input.body,
    actionPath: input.actionPath ?? null,
    actionLabel: input.actionLabel ?? null,
    sourceType: 'broadcast',
    sourceId: context.actor.userId,
    groupKey: input.groupKey ?? null,
    scheduledFor: input.scheduledFor ?? null,
    expiresAt: input.expiresAt ?? null,
  });

  recordAudit(context, {
    action: 'notification.broadcast',
    targetType: 'Notification',
    schoolId,
    summary: `Broadcast to ${input.audience}: ${created} recipient(s).`,
    afterData: {
      audience: input.audience,
      classId: input.classId ?? null,
      gradeId: input.gradeId ?? null,
      created,
    },
  });

  return { audience: input.audience, resolved: userIds.length, created };
}

async function resolveAudience(
  context: ActorContext,
  schoolId: string,
  input: BroadcastInput,
): Promise<string[]> {
  const active = { schoolId, status: UserStatus.ACTIVE };

  if (input.audience === 'CLASS') {
    await assertCanAccessClass(context.actor, context.tenant, input.classId as string);
    const memberships = await prisma.classMembership.findMany({
      where: { classId: input.classId as string, isActive: true, user: active },
      select: { userId: true },
      distinct: ['userId'],
    });
    return memberships.map((row) => row.userId);
  }

  if (input.audience === 'GRADE') {
    const memberships = await prisma.classMembership.findMany({
      where: {
        isActive: true,
        user: active,
        class: { gradeId: input.gradeId as string, schoolId },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return memberships.map((row) => row.userId);
  }

  const where: Prisma.UserWhereInput = {
    ...active,
    ...(input.audience === 'STUDENTS' ? { primaryRole: RoleKey.STUDENT } : {}),
    ...(input.audience === 'STAFF' ? { primaryRole: { in: STAFF_ROLES } } : {}),
  };
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((user) => user.id);
}
