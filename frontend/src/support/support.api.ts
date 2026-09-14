import { apiGet, apiGetPaged, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  SupportListQuery,
  SupportMessageRow,
  SupportPolicies,
  SupportRequestDetail,
  SupportRequestRow,
  SupportSummary,
} from './support.types';

/**
 * Support requests (blueprint §13).
 *
 * The permission split is the shape of the whole feature: `support.create` is
 * held by teachers and school admins so they can raise a ticket;
 * `support.read.all`, `support.respond` and `support.assign` are the agent side.
 * A requester listing tickets gets their own, decided server-side rather than by
 * a query flag — same pattern as content reports.
 *
 * Nothing here closes a request silently. Every state change carries a note or a
 * reason, because a ticket that changed hands with no explanation is the thing a
 * school complains about next.
 */

export function fetchSupportPolicies(): Promise<SupportPolicies> {
  return apiGet<SupportPolicies>('/support/policies');
}

export function fetchSupportSummary(): Promise<SupportSummary> {
  return apiGet<SupportSummary>('/support/summary');
}

export function fetchSupportRequests(
  query?: SupportListQuery,
): Promise<Paginated<SupportRequestRow>> {
  return apiGetPaged<SupportRequestRow>('/support/requests', query);
}

export function fetchSupportRequest(requestId: string): Promise<SupportRequestDetail> {
  return apiGet<SupportRequestDetail>(`/support/requests/${encodeURIComponent(requestId)}`);
}

export function createSupportRequest(input: {
  category: string;
  priority?: string;
  subject: string;
  description: string;
  contextPath?: string;
}): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>('/support/requests', input);
}

export function fetchSupportMessages(requestId: string): Promise<SupportMessageRow[]> {
  return apiGet<SupportMessageRow[]>(
    `/support/requests/${encodeURIComponent(requestId)}/messages`,
  );
}

/** `isInternal` is refused outright for a requester rather than quietly ignored. */
export function postSupportMessage(
  requestId: string,
  input: { body: string; isInternal?: boolean },
): Promise<SupportMessageRow> {
  return apiPost<SupportMessageRow>(
    `/support/requests/${encodeURIComponent(requestId)}/messages`,
    input,
  );
}

export function rateSupportRequest(
  requestId: string,
  input: { score: number; comment?: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/satisfaction`,
    input,
  );
}

// ── Agent side ──────────────────────────────────────────────────────────────

/** Re-cutting the response clock is deliberate and audited, so it is opt-in. */
export function triageSupportRequest(
  requestId: string,
  input: { category?: string; priority?: string; recalculateTargets?: boolean; note?: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/triage`,
    input,
  );
}

/** A null assignee hands the request back to the queue rather than orphaning it. */
export function assignSupportRequest(
  requestId: string,
  input: { assigneeId: string | null; note?: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/assign`,
    input,
  );
}

export function setSupportStatus(
  requestId: string,
  input: { status: string; note?: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/status`,
    input,
  );
}

export function escalateSupportRequest(
  requestId: string,
  input: { escalateTo: string; reason: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/escalate`,
    input,
  );
}

export function resolveSupportRequest(
  requestId: string,
  input: { resolutionNote: string; defectReference?: string; closeNow?: boolean },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/resolve`,
    input,
  );
}

export function closeSupportRequest(
  requestId: string,
  input: { note?: string },
): Promise<SupportRequestRow> {
  return apiPost<SupportRequestRow>(
    `/support/requests/${encodeURIComponent(requestId)}/close`,
    input,
  );
}
