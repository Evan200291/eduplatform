// ─────────────────────────────────────────────────────────────────────────────
// Notification machinery
// Blueprint 06: "Notifications must have a purpose, recipient, trigger, priority,
// and action." This file is the only way a notification enters the system, so
// every other module gets those five for free by calling `enqueueNotification`.
//
// Three rules are enforced here rather than at each call site:
//
//   • the recipient's preferences decide the channels, and a fully-disabled
//     recipient still gets a row — state SUPPRESSED with a reason, because
//     "we chose not to tell them" is information a support agent needs
//   • quiet hours delay delivery, they do not cancel it
//   • a notification sharing a `groupKey` with an undelivered one is collapsed
//     into it rather than stacking up
//
// Channel reality: this deployment delivers IN_APP. EMAIL and PUSH rows are
// recorded and then marked SUPPRESSED with a reason, because no transport is
// configured — the schema is ready for one, the process is not pretending to have
// sent anything.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  NotificationCategory,
  Prisma} from '@prisma/client';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationState
} from '@prisma/client';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';

const log = logger.child({ module: 'notifications' });

const NO_TRANSPORT = 'No email or push transport is configured on this deployment.';
const DISPATCH_BATCH = 500;

export interface NotificationInput {
  /** Null for a platform-level message that belongs to no single school. */
  schoolId: string | null;
  userId: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  body: string;
  actionPath?: string | null;
  actionLabel?: string | null;
  /** The trigger. Blueprint 06 requires every notification to name its source. */
  sourceType?: string | null;
  sourceId?: string | null;
  groupKey?: string | null;
  scheduledFor?: Date | null;
  expiresAt?: Date | null;
}

interface ResolvedPreference {
  inApp: boolean;
  email: boolean;
  push: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

// ── Preferences ─────────────────────────────────────────────────────────────

/**
 * The recipient's effective channel set for one category. A category override wins
 * over the global switch, so "everything except assignment reminders" is expressible
 * without turning notifications off wholesale.
 */
export async function resolvePreference(
  userId: string,
  category: NotificationCategory,
): Promise<ResolvedPreference> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
    select: {
      inAppEnabled: true,
      emailEnabled: true,
      pushEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
      categoryOverrides: true,
    },
  });

  // No row means defaults: in-app and email on, push off.
  if (!row) {
    return { inApp: true, email: true, push: false, quietHoursStart: null, quietHoursEnd: null };
  }

  const override = readOverride(row.categoryOverrides, category);
  return {
    inApp: override.inApp ?? row.inAppEnabled,
    email: override.email ?? row.emailEnabled,
    push: override.push ?? row.pushEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

function readOverride(
  overrides: Prisma.JsonValue | null,
  category: NotificationCategory,
): { inApp?: boolean; email?: boolean; push?: boolean } {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return {};
  const entry = (overrides as Record<string, unknown>)[category];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return {};
  const bag = entry as Record<string, unknown>;
  return {
    inApp: typeof bag.inApp === 'boolean' ? bag.inApp : undefined,
    email: typeof bag.email === 'boolean' ? bag.email : undefined,
    push: typeof bag.push === 'boolean' ? bag.push : undefined,
  };
}

/**
 * Moves a delivery time out of the recipient's quiet hours. A window that wraps
 * midnight (22 → 7) is handled; a CRITICAL notification ignores quiet hours, since
 * the only ones that reach that priority are safety and account-security events.
 */
export function shiftForQuietHours(
  when: Date,
  preference: ResolvedPreference,
  priority: NotificationPriority,
): Date {
  if (priority === NotificationPriority.CRITICAL) return when;
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  if (start === null || end === null || start === end) return when;

  const hour = when.getHours();
  const inWindow = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!inWindow) return when;

  const shifted = new Date(when);
  shifted.setMinutes(0, 0, 0);
  shifted.setHours(end);
  // A window that wraps midnight ends on the following day.
  if (shifted <= when) shifted.setDate(shifted.getDate() + 1);
  return shifted;
}

// ── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * The single entry point for creating a notification. Returns the row id, including
 * when the row was written as SUPPRESSED, and null only when it collapsed into an
 * existing undelivered notification with the same `groupKey`.
 */
export async function enqueueNotification(input: NotificationInput): Promise<string | null> {
  const priority = input.priority ?? NotificationPriority.NORMAL;
  const preference = await resolvePreference(input.userId, input.category);
  const now = new Date();

  if (input.groupKey) {
    const collapsed = await collapseIntoExisting(input, now);
    if (collapsed) return null;
  }

  const channels: NotificationChannel[] = [];
  if (preference.inApp) channels.push(NotificationChannel.IN_APP);
  if (preference.email) channels.push(NotificationChannel.EMAIL);
  if (preference.push) channels.push(NotificationChannel.PUSH);

  const suppressed = channels.length === 0;
  const scheduledFor = suppressed
    ? null
    : shiftForQuietHours(input.scheduledFor ?? now, preference, priority);

  const notification = await prisma.notification.create({
    data: {
      schoolId: input.schoolId,
      userId: input.userId,
      category: input.category,
      priority,
      state: suppressed ? NotificationState.SUPPRESSED : NotificationState.PENDING,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      actionPath: input.actionPath ?? null,
      actionLabel: input.actionLabel ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      groupKey: input.groupKey ?? null,
      scheduledFor,
      expiresAt: input.expiresAt ?? null,
      suppressedReason: suppressed ? 'The recipient has every channel turned off.' : null,
      ...(channels.length > 0
        ? { deliveries: { create: channels.map((channel) => ({ channel })) } }
        : {}),
    },
    select: { id: true },
  });

  return notification.id;
}

/**
 * Blueprint 06: notifications sharing a group key collapse into one line. An
 * undelivered notification in the same group is refreshed rather than joined by a
 * near-duplicate, so five new assignments do not produce five bells.
 */
async function collapseIntoExisting(input: NotificationInput, now: Date): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      groupKey: input.groupKey,
      state: NotificationState.PENDING,
      readAt: null,
      dismissedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!existing) return false;

  await prisma.notification.update({
    where: { id: existing.id },
    data: {
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      actionPath: input.actionPath ?? undefined,
      actionLabel: input.actionLabel ?? undefined,
      scheduledFor: input.scheduledFor ?? now,
      updatedAt: now,
    },
  });
  return true;
}

/** Fan-out helper for the many-recipients case. Returns how many rows were written. */
export async function enqueueMany(inputs: readonly NotificationInput[]): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    try {
      const id = await enqueueNotification(input);
      if (id) created += 1;
    } catch (error) {
      log.error({ err: error, userId: input.userId, category: input.category }, 'enqueue failed');
    }
  }
  return created;
}

/** The same message to many recipients, without repeating the body at each call site. */
export async function notifyUsers(
  userIds: readonly string[],
  template: Omit<NotificationInput, 'userId'>,
): Promise<number> {
  const unique = [...new Set(userIds)];
  return enqueueMany(unique.map((userId) => ({ ...template, userId })));
}

// ── Dispatch (scheduled) ────────────────────────────────────────────────────

/**
 * Moves due notifications from PENDING to DELIVERED and settles their per-channel
 * delivery rows. Runs every couple of minutes; returns how many notifications it
 * moved so the job log shows real throughput.
 *
 * In-app delivery is just "visible in the inbox", so it succeeds here. Email and
 * push are recorded as SUPPRESSED with a reason rather than silently dropped.
 */
export async function dispatchDueNotifications(): Promise<number> {
  const now = new Date();

  const due = await prisma.notification.findMany({
    where: {
      state: NotificationState.PENDING,
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    take: DISPATCH_BATCH,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, deliveries: { select: { id: true, channel: true, state: true } } },
  });

  let delivered = 0;
  for (const notification of due) {
    const inApp = notification.deliveries.filter(
      (row) => row.channel === NotificationChannel.IN_APP && row.state === NotificationState.PENDING,
    );
    const offPlatform = notification.deliveries.filter(
      (row) => row.channel !== NotificationChannel.IN_APP && row.state === NotificationState.PENDING,
    );

    try {
      await prisma.$transaction(async (tx) => {
        if (inApp.length > 0) {
          await tx.notificationDelivery.updateMany({
            where: { id: { in: inApp.map((row) => row.id) } },
            data: {
              state: NotificationState.DELIVERED,
              deliveredAt: now,
              lastAttemptAt: now,
              attemptCount: { increment: 1 },
            },
          });
        }
        if (offPlatform.length > 0) {
          await tx.notificationDelivery.updateMany({
            where: { id: { in: offPlatform.map((row) => row.id) } },
            data: {
              state: NotificationState.SUPPRESSED,
              lastAttemptAt: now,
              attemptCount: { increment: 1 },
              failureReason: NO_TRANSPORT,
            },
          });
        }
        await tx.notification.update({
          where: { id: notification.id },
          data: { state: NotificationState.DELIVERED, deliveredAt: now },
        });
      });
      delivered += 1;
    } catch (error) {
      log.error({ err: error, notificationId: notification.id }, 'dispatch failed');
    }
  }

  // Anything that outlived its usefulness is closed off rather than left ringing.
  const expired = await prisma.notification.updateMany({
    where: {
      expiresAt: { not: null, lte: now },
      state: { in: [NotificationState.PENDING, NotificationState.DELIVERED] },
      readAt: null,
    },
    data: { state: NotificationState.DISMISSED, dismissedAt: now },
  });

  if (expired.count > 0) log.debug({ expired: expired.count }, 'expired notifications closed');

  return delivered;
}
