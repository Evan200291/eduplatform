import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/platform` — the operations console for Midas staff. */

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

export type IncidentStatus = 'OPEN' | 'MITIGATED' | 'RESOLVED' | 'POST_REVIEW' | 'CLOSED';

export type JobStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

/** What each severity commits Midas to, in the words an operator would use at 2am. */
export interface SeverityPolicy {
  severity: IncidentSeverity;
  label: string;
  criteria: string;
  acknowledgeWithinMinutes: number;
  mitigateWithinHours: number;
  notifySchools?: boolean;
  requiresPostReview?: boolean;
}

export interface IncidentRow {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  impactSummary: string | null;
  /** Blueprint §10: this flag starts the notification clock. */
  dataAffected: boolean;
  schoolId: string | null;
  ownerUserId: string | null;
  owner?: { id: string; displayName: string } | null;
  rootCause: string | null;
  preventiveActions: string | null;
  detectedAt: string;
  mitigatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentSummary {
  open: number;
  bySeverity?: { severity: IncidentSeverity; count: number }[];
  dataAffected?: number;
}

export interface JobRunRow {
  id: string;
  jobKey: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  detail?: unknown;
}

/** One scheduled job's current health, as the console's traffic light. */
export interface JobHealthEntry {
  jobKey: string;
  lastStatus: JobStatus | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures?: number;
  isHealthy?: boolean;
}

export interface PlatformSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  /** Secret values are never returned in full; the server sends a placeholder. */
  isSecret: boolean;
  isKnown?: boolean;
  updatedAt?: string;
}

export interface FeatureDefinitionRow {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  isVisible: boolean;
  sortOrder: number;
  /** Not editable: a safety-critical feature cannot be switched off by a school. */
  isSafetyCritical?: boolean;
  defaultEnabled?: boolean;
}

export interface ReleaseNoteRow {
  version: string;
  title: string;
  summary: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
  };
  /** Blueprint §05: a change that alters how evidence reads must say so. */
  affectsEvidenceInterpretation: boolean;
  publishedAt: string | null;
  createdAt: string;
}

export interface PlatformOverview {
  schools?: { total: number; active: number; suspended?: number };
  users?: { total: number; active?: number };
  incidents?: IncidentSummary;
  jobs?: { failing: number; total: number };
  support?: { open: number };
  [key: string]: unknown;
}

export interface IncidentListQuery extends ListQuery {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  openOnly?: boolean;
  dataAffected?: boolean;
}

export interface JobRunListQuery extends ListQuery {
  jobKey?: string;
  status?: JobStatus;
  problemsOnly?: boolean;
}
