import { apiGet, apiGetPaged, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  NotificationListQuery,
  NotificationPreferences,
  NotificationRecord,
  NotificationSummary,
} from './notifications.types';

/** The notification inbox — shared by all three surfaces via the TopBar bell. */

export function fetchNotifications(query?: NotificationListQuery): Promise<Paginated<NotificationRecord>> {
  return apiGetPaged<NotificationRecord>('/notifications', query);
}

export function fetchNotificationSummary(): Promise<NotificationSummary> {
  return apiGet<NotificationSummary>('/notifications/summary');
}

export function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  return apiGet<NotificationPreferences>('/notifications/preferences');
}

export function updateNotificationPreferences(
  input: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiPut<NotificationPreferences>('/notifications/preferences', input);
}

export function markNotificationsRead(input: { ids?: string[]; all?: boolean }): Promise<{ updated: number }> {
  return apiPost('/notifications/read', input);
}

export function dismissNotifications(input: { ids?: string[]; all?: boolean }): Promise<{ updated: number }> {
  return apiPost('/notifications/dismiss', input);
}

export function markNotificationRead(id: string): Promise<NotificationRecord> {
  return apiPost<NotificationRecord>(`/notifications/${encodeURIComponent(id)}/read`);
}

export function markNotificationActioned(id: string): Promise<NotificationRecord> {
  return apiPost<NotificationRecord>(`/notifications/${encodeURIComponent(id)}/actioned`);
}

export function dismissNotification(id: string): Promise<NotificationRecord> {
  return apiPost<NotificationRecord>(`/notifications/${encodeURIComponent(id)}/dismiss`);
}

/** 202: rows are written now, delivery is settled by the dispatch job. */
export function sendNotification(input: Record<string, unknown>): Promise<{ requested: number; created: number }> {
  return apiPost('/notifications/send', input);
}

export function broadcastNotification(
  input: Record<string, unknown>,
): Promise<{ audience: string; resolved: number; created: number }> {
  return apiPost('/notifications/broadcast', input);
}
