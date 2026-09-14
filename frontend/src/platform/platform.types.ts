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
  /** `INC-2026-0007`. */
  reference?: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  impactSummary: string | null;
  /** Blueprint §10: this flag starts the notification clock. */
  dataAffected: boolean;
  schoolId: string | null;
  ownerUserId: string | null;
  rootCause: string | null;
  preventiveActions: string | null;
  detectedAt: string;
  mitigatedAt: string | null;
  resolvedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** From the server's view wrapper: which response targets have passed. */
  overdue?: { acknowledge: boolean; mitigate: boolean; notify: boolean };
  /** From the server's view wrapper: whether it could be closed, and what is missing. */
  closure?: { allowed: boolean; missing: string[] };
}

/**
 * What every incident route actually returns: the row wrapped with its policy,
 * targets and closure check. `platform.api.ts` flattens this into `IncidentRow`
 * so screens read one shape.
 */
export interface IncidentView {
  incident: Omit<IncidentRow, 'overdue' | 'closure'>;
  isOpen: boolean;
  overdue: { acknowledge: boolean; mitigate: boolean; notify: boolean };
  closure: { allowed: boolean; missing: string[] };
}

/** Mirrors `updateIncidentSchema`. */
export interface UpdateIncidentInput {
  title?: string;
  severity?: IncidentSeverity;
  summary?: string;
  impactSummary?: string;
  dataAffected?: boolean;
  rootCause?: string;
  preventiveActions?: string;
}

export interface IncidentSummary {
  byStatus: { status: IncidentStatus; count: number }[];
  openBySeverity: { severity: IncidentSeverity; count: number }[];
  open: number;
  overdueMitigation: number;
  awaitingNotification: number;
  dataAffected: number;
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
  /** A secret comes back as a placeholder; it can be replaced, never read. */
  value: unknown;
  description: string | null;
  isSecret: boolean;
  /** False when the key is stored but nothing in code reads it. */
  declaredInCode?: boolean;
  isRedacted?: boolean;
  updatedAt?: string;
}

/** `GET /platform/settings/catalogue` — the keys the code knows about. */
export interface PlatformSettingSpec {
  key: string;
  description: string;
  isSecret: boolean;
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
  id?: string;
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
  audience?: string[] | null;
  releasedAt: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** Mirrors `releaseNoteSchema`. */
export interface ReleaseNoteInput {
  version: string;
  title: string;
  summary: string;
  changes: { added?: string[]; changed?: string[]; fixed?: string[]; removed?: string[] };
  affectsEvidenceInterpretation?: boolean;
  releasedAt: string;
  isPublished?: boolean;
}

/** Mirrors `PlatformOverview` in `platform.overview.service.ts`. */
export interface PlatformOverview {
  generatedAt: string;
  tenancy: { organizations: number; schools: number; activeSchools: number; classes: number };
  people: {
    total: number;
    byStatus: { status: string; count: number }[];
    activeStudents: number;
    activeTeachers: number;
  };
  commercial: {
    byPlan: { plan: string; count: number }[];
    byStatus: { status: string; count: number }[];
    expiringWithin30Days: number;
    pastDue: number;
  };
  content: { lessons: number; publishedLessons: number; activities: number; questions: number };
  engagement: { activeLast7Days: number; lessonCompletionsLast7Days: number; assignmentsOpen: number };
  operations: {
    openIncidents: number;
    dataAffectedIncidents: number;
    openSupportRequests: number;
    unhealthyJobs: number;
  };
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
