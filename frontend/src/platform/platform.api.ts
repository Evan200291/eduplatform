import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  FeatureDefinitionRow,
  IncidentListQuery,
  IncidentRow,
  IncidentView,
  IncidentSummary,
  JobHealthEntry,
  JobRunListQuery,
  JobRunRow,
  PlatformOverview,
  PlatformSettingRow,
  PlatformSettingSpec,
  ReleaseNoteInput,
  ReleaseNoteRow,
  UpdateIncidentInput,
  SeverityPolicy,
} from './platform.types';

/**
 * The platform operations console (blueprint §05, §13, §17).
 *
 * Everything here is Midas staff only — each route carries its own
 * `platform.*` permission, and none of it is tenant-scoped, because the whole
 * point is the view across tenants.
 *
 * Note the read/write split on the feature registry: keys, defaults and the
 * safety flag come from code (`core/features/feature-keys.ts`) and are synced,
 * not authored. Only presentation and visibility are editable, which is why
 * there is a `syncFeatureRegistry` call and no create or delete.
 */

export function fetchPlatformOverview(): Promise<PlatformOverview> {
  return apiGet<PlatformOverview>('/platform/overview');
}

// ── Feature registry ────────────────────────────────────────────────────────

export function fetchFeatureDefinitions(query?: {
  category?: string;
  includeHidden?: boolean;
}): Promise<FeatureDefinitionRow[]> {
  return apiGet<FeatureDefinitionRow[]>('/platform/features', { params: query });
}

/** Re-reads the registry declared in code and writes any new keys into the table. */
export function syncFeatureRegistry(): Promise<unknown> {
  return apiPost('/platform/features/sync');
}

export function updateFeatureDefinition(
  key: string,
  input: { name?: string; description?: string; category?: string; isVisible?: boolean; sortOrder?: number },
): Promise<FeatureDefinitionRow> {
  return apiPatch<FeatureDefinitionRow>(`/platform/features/${encodeURIComponent(key)}`, input);
}

// ── Platform settings ───────────────────────────────────────────────────────

export function fetchPlatformSettings(knownOnly?: boolean): Promise<PlatformSettingRow[]> {
  return apiGet<PlatformSettingRow[]>('/platform/settings', { params: { knownOnly } });
}

export function fetchPlatformSettingCatalogue(): Promise<PlatformSettingSpec[]> {
  return apiGet<PlatformSettingSpec[]>('/platform/settings/catalogue');
}

export function writePlatformSetting(input: {
  key: string;
  value: unknown;
  description?: string;
  isSecret?: boolean;
}): Promise<PlatformSettingRow> {
  return apiPut<PlatformSettingRow>('/platform/settings', input);
}

export function deletePlatformSetting(key: string): Promise<void> {
  return apiDelete(`/platform/settings/${encodeURIComponent(key)}`);
}

// ── Incidents ───────────────────────────────────────────────────────────────

export function fetchSeverityPolicies(): Promise<SeverityPolicy[]> {
  return apiGet<SeverityPolicy[]>('/platform/incidents/severities');
}

export function fetchIncidentSummary(): Promise<IncidentSummary> {
  return apiGet<IncidentSummary>('/platform/incidents/summary');
}

/** Every incident route wraps the row; screens get one flat shape. */
function flatten(view: IncidentView): IncidentRow {
  return { ...view.incident, overdue: view.overdue, closure: view.closure };
}

export async function fetchIncidents(query?: IncidentListQuery): Promise<Paginated<IncidentRow>> {
  const page = await apiGetPaged<IncidentView>('/platform/incidents', query);
  return { ...page, items: page.items.map(flatten) };
}

export async function fetchIncident(incidentId: string): Promise<IncidentRow> {
  return flatten(await apiGet<IncidentView>(`/platform/incidents/${encodeURIComponent(incidentId)}`));
}

export function createIncident(input: {
  title: string;
  severity: string;
  summary: string;
  detectedAt: string;
  dataAffected?: boolean;
  impactSummary?: string;
}): Promise<IncidentRow> {
  return apiPost<IncidentView>('/platform/incidents', input).then(flatten);
}

export async function updateIncident(incidentId: string, input: UpdateIncidentInput): Promise<IncidentRow> {
  return flatten(await apiPatch<IncidentView>(`/platform/incidents/${encodeURIComponent(incidentId)}`, input));
}

/**
 * Status moves through its own endpoint, not the generic patch, because the
 * server checks the timeline — an incident cannot be closed before it has a
 * root cause, and the refusal explains what is still missing.
 */
export function setIncidentStatus(
  incidentId: string,
  input: { status: string; note?: string },
): Promise<IncidentRow> {
  return apiPost<IncidentView>(`/platform/incidents/${encodeURIComponent(incidentId)}/status`, input).then(flatten);
}

// ── Scheduled jobs ──────────────────────────────────────────────────────────

export function fetchJobHealth(): Promise<JobHealthEntry[]> {
  return apiGet<JobHealthEntry[]>('/platform/jobs/health');
}

export function fetchJobRuns(query?: JobRunListQuery): Promise<Paginated<JobRunRow>> {
  return apiGetPaged<JobRunRow>('/platform/jobs', query);
}

// ── Release notes ───────────────────────────────────────────────────────────

export function fetchReleaseNotes(): Promise<Paginated<ReleaseNoteRow>> {
  return apiGetPaged<ReleaseNoteRow>('/platform/releases');
}

export function createReleaseNote(input: ReleaseNoteInput): Promise<ReleaseNoteRow> {
  return apiPost<ReleaseNoteRow>('/platform/releases', input);
}

export function updateReleaseNote(
  version: string,
  input: Partial<ReleaseNoteInput>,
): Promise<ReleaseNoteRow> {
  return apiPatch<ReleaseNoteRow>(`/platform/releases/${encodeURIComponent(version)}`, input);
}
