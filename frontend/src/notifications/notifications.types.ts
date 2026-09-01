import type { ListQuery } from '@/api/types';

export type NotificationCategory = string;
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type NotificationState = 'PENDING' | 'DELIVERED' | 'READ' | 'ACTIONED' | 'DISMISSED' | 'SUPPRESSED';

export interface NotificationRecord {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  state: NotificationState;
  title: string;
  body: string | null;
  actionPath: string | null;
  actionLabel: string | null;
  sourceType: string | null;
  sourceId: string | null;
  groupKey: string | null;
  scheduledFor: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  actionedAt: string | null;
  dismissedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface NotificationSummary {
  unread: number;
  byPriority: { priority: NotificationPriority; count: number }[];
  byCategory: { category: NotificationCategory; count: number }[];
}

export interface NotificationPreferences {
  userId: string;
  schoolId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  digestEnabled: boolean;
  digestFrequency: 'DAILY' | 'WEEKLY' | 'NONE';
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  categoryOverrides: Record<string, { inApp?: boolean; email?: boolean; push?: boolean }> | null;
}

export interface NotificationListQuery extends ListQuery {
  state?: NotificationState;
  category?: string;
}
