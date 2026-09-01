import { apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  AuditDetailRow,
  AuditListQuery,
  AuditListRow,
  AuditSummary,
  ConsentListQuery,
  ConsentRegisterEntry,
  ConsentRow,
  DataRequestListQuery,
  DataRequestRow,
  DataRequestSummary,
  ProcessingPurpose,
  RetentionClassOption,
  RetentionListQuery,
  RetentionPolicyRow,
  RetentionRunOutcome,
} from './privacy.types';

/**
 * Privacy endpoints — data subject rights, consent, retention, audit trail.
 *
 * Four mount points with four different permissions; nothing here has a
 * delete route (see `backend/src/modules/privacy/privacy.routes.ts`).
 */

// ── Data subject rights ──────────────────────────────────────────────────────

export function fetchDataRequestSummary(): Promise<DataRequestSummary> {
  return apiGet<DataRequestSummary>('/data-requests/summary');
}
export function fetchDataRequests(query?: DataRequestListQuery): Promise<Paginated<DataRequestRow>> {
  return apiGetPaged<DataRequestRow>('/data-requests', query);
}
export function fetchDataRequest(id: string): Promise<DataRequestRow> {
  return apiGet<DataRequestRow>(`/data-requests/${encodeURIComponent(id)}`);
}
export function createDataRequest(input: Record<string, unknown>): Promise<DataRequestRow> {
  return apiPost<DataRequestRow>('/data-requests', input);
}
export function updateDataRequest(
  id: string,
  input: Record<string, unknown>,
): Promise<DataRequestRow> {
  return apiPatch<DataRequestRow>(`/data-requests/${encodeURIComponent(id)}`, input);
}
export function transitionDataRequest(
  id: string,
  input: Record<string, unknown>,
): Promise<DataRequestRow> {
  return apiPost<DataRequestRow>(`/data-requests/${encodeURIComponent(id)}/status`, input);
}
export function buildSubjectExport(id: string): Promise<unknown> {
  return apiPost(`/data-requests/${encodeURIComponent(id)}/build-export`);
}

// ── Consent and lawful basis ────────────────────────────────────────────────

export function fetchProcessingPurposes(): Promise<ProcessingPurpose[]> {
  return apiGet<ProcessingPurpose[]>('/consent/purposes');
}
export function fetchConsentRegister(): Promise<ConsentRegisterEntry[]> {
  return apiGet<ConsentRegisterEntry[]>('/consent/register');
}
export function fetchConsentList(query?: ConsentListQuery): Promise<Paginated<ConsentRow>> {
  return apiGetPaged<ConsentRow>('/consent', query);
}
export function recordConsent(input: Record<string, unknown>): Promise<ConsentRow> {
  return apiPost<ConsentRow>('/consent', input);
}
export function withdrawConsent(id: string, input?: Record<string, unknown>): Promise<ConsentRow> {
  return apiPost<ConsentRow>(`/consent/${encodeURIComponent(id)}/withdraw`, input ?? {});
}

// ── Retention ────────────────────────────────────────────────────────────────

export function fetchRetentionOptions(): Promise<RetentionClassOption[]> {
  return apiGet<RetentionClassOption[]>('/retention-policies/classes');
}
export function fetchRetentionPolicies(
  query?: RetentionListQuery,
): Promise<Paginated<RetentionPolicyRow>> {
  return apiGetPaged<RetentionPolicyRow>('/retention-policies', query);
}
export function upsertRetentionPolicy(input: Record<string, unknown>): Promise<RetentionPolicyRow> {
  return apiPut<RetentionPolicyRow>('/retention-policies', input);
}
export function pauseRetentionPolicy(id: string): Promise<RetentionPolicyRow> {
  return apiPost<RetentionPolicyRow>(`/retention-policies/${encodeURIComponent(id)}/pause`);
}
export function resumeRetentionPolicy(id: string): Promise<RetentionPolicyRow> {
  return apiPost<RetentionPolicyRow>(`/retention-policies/${encodeURIComponent(id)}/resume`);
}
export function runRetentionPolicyNow(id: string): Promise<RetentionRunOutcome> {
  return apiPost<RetentionRunOutcome>(`/retention-policies/${encodeURIComponent(id)}/run`);
}

// ── Audit trail (read-only) ──────────────────────────────────────────────────

export function fetchAuditSummary(days = 30): Promise<AuditSummary> {
  return apiGet<AuditSummary>('/audit/summary', { params: { days } });
}
export function fetchAuditEntries(query?: AuditListQuery): Promise<Paginated<AuditListRow>> {
  return apiGetPaged<AuditListRow>('/audit', query);
}
export function fetchAuditEntry(id: string): Promise<AuditDetailRow> {
  return apiGet<AuditDetailRow>(`/audit/${encodeURIComponent(id)}`);
}
export function fetchAuditTargetHistory(
  targetType: string,
  targetId: string,
): Promise<AuditListRow[]> {
  return apiGet<AuditListRow[]>(
    `/audit/target/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`,
  );
}
