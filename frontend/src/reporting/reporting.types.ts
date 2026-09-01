import type { ListQuery } from '@/api/types';

/**
 * `GET /reports/definitions` — mirrors `DEFINITION_SELECT` in `reporting.service.ts`.
 * Every standard report is also a system-owned definition row with a real `id`,
 * which is what running or exporting one actually needs: `/reports/standard/:key/run`
 * and the `reportKey` export field both validate the key against `keySchema`
 * (`^[a-z0-9][a-z0-9_-]*$`), which rejects the dotted keys the catalogue itself
 * uses (`engagement.activity-summary`) — so this app runs and exports every
 * report by definition id, never by key, to avoid that 422.
 */
export interface ReportDefinition {
  id: string;
  schoolId: string | null;
  key: string;
  name: string;
  description: string | null;
  scopeLevel: 'STUDENT' | 'CLASS' | 'GRADE' | 'SUBJECT' | 'SCHOOL';
  audience: string[];
  measureNotes: string;
  limitationNotes: string;
  evidenceSources: string[];
  configuration: unknown;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * `GET /reports/definitions/:id/run` and `/reports/standard/:key/run` — mirrors
 * the backend's `RunReportResult` (`reporting.service.ts`), which carries a
 * report/measure/window/cohort envelope around the rows, not the flatter
 * `{ definitionId, summary }` shape this type previously declared.
 */
export interface ReportRunResult {
  report: { key: string; name: string; description: string | null; scopeLevel: string };
  measure: {
    measureNotes: string;
    limitationNotes: string;
    evidenceSources: unknown;
    builder?: { key: string; measureNotes: string; limitationNotes: string };
  };
  window: { from: string; to: string; days: number };
  cohort: { size: number; scope: string; scopeId: string | null; truncated: boolean };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  generatedAt: string;
}

/** Mirrors `EXPORT_SELECT` in `exports.service.ts`. The file is built after the 202 response. */
export interface ReportExportJob {
  id: string;
  schoolId: string;
  definitionId: string;
  requestedById: string;
  format: 'CSV' | 'JSON' | 'XLSX' | 'PDF';
  status: 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';
  parameters: unknown;
  rowCount: number | null;
  fileName: string | null;
  byteSize: number | null;
  failureReason: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface ReportListQuery extends ListQuery {
  scopeLevel?: 'STUDENT' | 'CLASS' | 'GRADE' | 'SUBJECT' | 'SCHOOL';
  includeSystem?: boolean;
  activeOnly?: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'percent' | 'date';
}

/** `GET /reports/catalogue` — the platform's built-in reports, mirrors `standardReportCatalogue()`. */
export interface StandardReportCatalogueEntry {
  key: string;
  name: string;
  scopeLevel: 'STUDENT' | 'CLASS' | 'GRADE' | 'SUBJECT' | 'SCHOOL';
  description: string;
  audience: string[];
  measureNotes: string;
  limitationNotes: string;
  evidenceSources: string[];
  columns: ReportColumn[];
}

export interface RunReportParams {
  studentId?: string;
  classId?: string;
  gradeId?: string;
  subjectId?: string;
  from?: string;
  to?: string;
  limit?: number;
}
