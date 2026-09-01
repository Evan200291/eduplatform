import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import { env } from '@/lib/env';
import { session } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  ReportDefinition,
  ReportExportJob,
  ReportListQuery,
  ReportRunResult,
  RunReportParams,
  StandardReportCatalogueEntry,
} from './reporting.types';

/** Reports — teacher's class/student summaries, admin's school-wide analytics. */

export function fetchReportCatalogue(): Promise<StandardReportCatalogueEntry[]> {
  return apiGet<StandardReportCatalogueEntry[]>('/reports/catalogue');
}

export function fetchReportDefinitions(query?: ReportListQuery): Promise<Paginated<ReportDefinition>> {
  return apiGetPaged<ReportDefinition>('/reports/definitions', query);
}

export function fetchReportDefinition(id: string): Promise<ReportDefinition> {
  return apiGet<ReportDefinition>(`/reports/definitions/${encodeURIComponent(id)}`);
}

export function createReportDefinition(input: Record<string, unknown>): Promise<ReportDefinition> {
  return apiPost<ReportDefinition>('/reports/definitions', input);
}

export function updateReportDefinition(id: string, input: Record<string, unknown>): Promise<ReportDefinition> {
  return apiPatch<ReportDefinition>(`/reports/definitions/${encodeURIComponent(id)}`, input);
}

export function archiveReportDefinition(id: string): Promise<ReportDefinition> {
  return apiPost<ReportDefinition>(`/reports/definitions/${encodeURIComponent(id)}/archive`);
}

/**
 * Runs a saved report by id — including a standard report, since every one of
 * those is also seeded as a system-owned `ReportDefinition` row (see
 * `ReportDefinition`'s doc comment for why this app never runs by dotted key).
 */
export function runReport(definitionId: string, params?: RunReportParams): Promise<ReportRunResult> {
  return apiGet<ReportRunResult>(`/reports/definitions/${encodeURIComponent(definitionId)}/run`, {
    params,
  });
}

/** 202 Accepted — the file is built after the response; poll `fetchReportExportStatus`. */
export function requestReportExport(input: {
  definitionId: string;
  format: 'CSV' | 'XLSX' | 'PDF';
  studentId?: string;
  classId?: string;
  gradeId?: string;
  subjectId?: string;
  from?: string;
  to?: string;
}): Promise<ReportExportJob> {
  return apiPost<ReportExportJob>('/reports/exports', input);
}

export function fetchReportExports(): Promise<Paginated<ReportExportJob>> {
  return apiGetPaged<ReportExportJob>('/reports/exports');
}

export function fetchReportExportStatus(exportId: string): Promise<ReportExportJob> {
  return apiGet<ReportExportJob>(`/reports/exports/${encodeURIComponent(exportId)}`);
}

/**
 * The download route returns file bytes, not the JSON envelope, and needs the
 * bearer token — so it can't be a plain `<a href>`. Fetch it as a blob and
 * hand the browser an object URL to click through.
 */
export async function downloadReportExport(exportId: string): Promise<{ blob: Blob; fileName: string }> {
  const token = session.getAccessToken();
  const response = await fetch(`${env.apiBaseUrl}/reports/exports/${encodeURIComponent(exportId)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Export is not ready yet.');
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob: await response.blob(), fileName: match?.[1] ?? 'report' };
}
