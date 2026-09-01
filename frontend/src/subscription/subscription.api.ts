import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CurrentSubscription,
  PlanPackaging,
  SeatUsage,
  SubscriptionDetail,
  SubscriptionListQuery,
} from './subscription.types';

/**
 * Subscription and seat endpoints.
 *
 * `subscription.write` is deliberately not granted to a school admin — a
 * school cannot upgrade its own plan by pressing a button. Everything here is
 * readable by a school admin; only platform / billing staff can write.
 */

export function fetchPlans(): Promise<{ plans: PlanPackaging[] }> {
  return apiGet('/subscriptions/plans');
}

export function fetchCurrentSubscription(): Promise<CurrentSubscription> {
  return apiGet<CurrentSubscription>('/subscriptions/current');
}

export function fetchCurrentSeats(): Promise<{ seats: SeatUsage; licensed: boolean }> {
  return apiGet('/subscriptions/current/seats');
}

export function fetchSubscriptions(
  query?: SubscriptionListQuery,
): Promise<Paginated<SubscriptionDetail>> {
  return apiGetPaged<SubscriptionDetail>('/subscriptions', query);
}

export function fetchSubscription(id: string): Promise<SubscriptionDetail> {
  return apiGet<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}`);
}

export function fetchSubscriptionPackaging(id: string): Promise<PlanPackaging> {
  return apiGet<PlanPackaging>(`/subscriptions/${encodeURIComponent(id)}/packaging`);
}

export function createSubscription(input: Record<string, unknown>): Promise<SubscriptionDetail> {
  return apiPost<SubscriptionDetail>('/subscriptions', input);
}

export function updateSubscription(
  id: string,
  input: Record<string, unknown>,
): Promise<SubscriptionDetail> {
  return apiPatch<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}`, input);
}

export function cancelSubscription(
  id: string,
  input: Record<string, unknown>,
): Promise<SubscriptionDetail> {
  return apiPost<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}/cancel`, input);
}

export function renewSubscription(
  id: string,
  input: Record<string, unknown>,
): Promise<SubscriptionDetail> {
  return apiPost<SubscriptionDetail>(`/subscriptions/${encodeURIComponent(id)}/renew`, input);
}
