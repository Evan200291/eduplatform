// ─────────────────────────────────────────────────────────────────────────────
// Notification validation
// Blueprint 06: "Notifications must have a purpose, recipient, trigger, priority,
// and action." The create schemas below make all five mandatory in practice — a
// category names the purpose, `sourceType`/`sourceId` name the trigger, and an
// action path is required for anything above NORMAL priority, because a HIGH
// notification the recipient cannot act on is just an alarm.
// ─────────────────────────────────────────────────────────────────────────────

import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationState,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, optionalDate, optionalText, text } from '../../core/http/validate';

export const notificationListQuery = listQuerySchema.extend({
  category: z.nativeEnum(NotificationCategory).optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
  state: z.nativeEnum(NotificationState).optional(),
  /** The bell-icon view: everything not yet read or dismissed. */
  unreadOnly: boolQuery(false),
  includeDismissed: boolQuery(false),
  since: optionalDate,
});

const actionable = {
  title: text(200, 2),
  body: text(1000, 2),
  actionPath: optionalText(300),
  actionLabel: optionalText(80),
  category: z.nativeEnum(NotificationCategory),
  priority: z.nativeEnum(NotificationPriority).default(NotificationPriority.NORMAL),
  scheduledFor: optionalDate,
  expiresAt: optionalDate,
};

function requireActionForUrgent(
  value: { priority: NotificationPriority; actionPath?: string },
  ctx: z.RefinementCtx,
): void {
  const urgent =
    value.priority === NotificationPriority.HIGH || value.priority === NotificationPriority.CRITICAL;
  if (urgent && !value.actionPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['actionPath'],
      message: 'An urgent notification needs somewhere for the recipient to go.',
    });
  }
}

/** A member of staff sending to named recipients. */
export const sendNotificationSchema = z
  .object({
    ...actionable,
    userIds: z.array(idSchema).min(1).max(500),
    sourceType: optionalText(40),
    sourceId: idSchema.optional(),
    groupKey: optionalText(120),
  })
  .superRefine(requireActionForUrgent);

/**
 * A school-wide or role-wide announcement. Blueprint 06 keeps this behind its own
 * permission because the blast radius is the whole school.
 */
export const broadcastSchema = z
  .object({
    ...actionable,
    audience: z.enum(['SCHOOL', 'STAFF', 'STUDENTS', 'CLASS', 'GRADE']),
    classId: idSchema.optional(),
    gradeId: idSchema.optional(),
    groupKey: optionalText(120),
  })
  .superRefine((value, ctx) => {
    requireActionForUrgent(value, ctx);
    if (value.audience === 'CLASS' && !value.classId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Name the class.' });
    }
    if (value.audience === 'GRADE' && !value.gradeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gradeId'], message: 'Name the year group.' });
    }
  });

export const markManySchema = z.object({
  ids: z.array(idSchema).min(1).max(500).optional(),
  /** Omitting `ids` marks everything currently unread. */
  all: z.boolean().default(false),
});

const channelPreferences = z.object({
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
  push: z.boolean().optional(),
});

export const preferenceSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  digestEnabled: z.boolean().optional(),
  digestFrequency: z.enum(['DAILY', 'WEEKLY', 'NONE']).optional(),
  /** Local hours, 0-23. Blueprint 06: a child's evening is not a delivery window. */
  quietHoursStart: z.coerce.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).nullable().optional(),
  categoryOverrides: z.record(z.nativeEnum(NotificationCategory), channelPreferences).optional(),
});

export const deliveryListQuery = listQuerySchema.extend({
  channel: z.nativeEnum(NotificationChannel).optional(),
  state: z.nativeEnum(NotificationState).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuery>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type BroadcastInput = z.infer<typeof broadcastSchema>;
export type MarkManyInput = z.infer<typeof markManySchema>;
export type PreferenceInput = z.infer<typeof preferenceSchema>;
export type DeliveryListQuery = z.infer<typeof deliveryListQuery>;
