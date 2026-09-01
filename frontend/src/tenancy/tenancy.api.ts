import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  OrganizationDetail,
  OrganizationListQuery,
  OrganizationSummary,
  SchoolDetail,
  SchoolListQuery,
  SchoolSettings,
  SchoolSummary,
} from './tenancy.types';

/**
 * Tenancy endpoints — organizations and schools.
 *
 * `/organizations` is platform-facing; `/schools` is shared, with a school
 * admin seeing exactly one school and platform staff seeing all of them.
 */

// ── Organizations ───────────────────────────────────────────────────────────

export function fetchOrganizations(
  query?: OrganizationListQuery,
): Promise<Paginated<OrganizationSummary>> {
  return apiGetPaged<OrganizationSummary>('/organizations', query);
}
export function fetchOrganization(id: string): Promise<OrganizationDetail> {
  return apiGet<OrganizationDetail>(`/organizations/${encodeURIComponent(id)}`);
}
export function createOrganization(input: Record<string, unknown>): Promise<OrganizationSummary> {
  return apiPost<OrganizationSummary>('/organizations', input);
}
export function updateOrganization(
  id: string,
  input: Record<string, unknown>,
): Promise<OrganizationSummary> {
  return apiPatch<OrganizationSummary>(`/organizations/${encodeURIComponent(id)}`, input);
}
export function setOrganizationStatus(
  id: string,
  status: string,
  reason: string,
): Promise<OrganizationSummary> {
  return apiPost<OrganizationSummary>(`/organizations/${encodeURIComponent(id)}/status`, {
    status,
    reason,
  });
}

// ── Schools ─────────────────────────────────────────────────────────────────

export function fetchSchools(query?: SchoolListQuery): Promise<Paginated<SchoolSummary>> {
  return apiGetPaged<SchoolSummary>('/schools', query);
}
export function fetchCurrentSchool(): Promise<SchoolDetail> {
  return apiGet<SchoolDetail>('/schools/current');
}
export function fetchSchool(id: string): Promise<SchoolDetail> {
  return apiGet<SchoolDetail>(`/schools/${encodeURIComponent(id)}`);
}
export function createSchool(input: Record<string, unknown>): Promise<SchoolSummary> {
  return apiPost<SchoolSummary>('/schools', input);
}
export function updateSchool(id: string, input: Record<string, unknown>): Promise<SchoolDetail> {
  return apiPatch<SchoolDetail>(`/schools/${encodeURIComponent(id)}`, input);
}
export function setSchoolStatus(id: string, status: string, reason: string): Promise<SchoolDetail> {
  return apiPost<SchoolDetail>(`/schools/${encodeURIComponent(id)}/status`, { status, reason });
}

// ── School settings ─────────────────────────────────────────────────────────

export function fetchCurrentSchoolSettings(): Promise<SchoolSettings> {
  return apiGet<SchoolSettings>('/schools/current/settings');
}
export function updateCurrentSchoolSettings(
  input: Record<string, unknown>,
): Promise<SchoolSettings> {
  return apiPatch<SchoolSettings>('/schools/current/settings', input);
}
export function fetchSchoolSettings(id: string): Promise<SchoolSettings> {
  return apiGet<SchoolSettings>(`/schools/${encodeURIComponent(id)}/settings`);
}
export function updateSchoolSettings(
  id: string,
  input: Record<string, unknown>,
): Promise<SchoolSettings> {
  return apiPatch<SchoolSettings>(`/schools/${encodeURIComponent(id)}/settings`, input);
}
