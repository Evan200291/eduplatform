// ─────────────────────────────────────────────────────────────────────────────
// Platform operations constants (blueprint 13 / 10 / 17)
// The schema stores severity, incident status and job status as VarChar rather
// than enums, because operational vocabularies change faster than a migration
// window allows. That decision moves the validation burden here: these lists are
// the only place a status string is defined, and every write is checked against
// them, so the columns cannot quietly accumulate typos that break every filter.
//
// Nothing in this file touches the database, so the rules below are unit-tested
// directly — see ./platform.constants.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;

// ── Incidents ───────────────────────────────────────────────────────────────

export const INCIDENT_SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  'OPEN',
  'MITIGATED',
  'RESOLVED',
  'POST_REVIEW',
  'CLOSED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface SeverityPolicy {
  severity: IncidentSeverity;
  label: string;
  /** What qualifies, in the words an operator would use at 2am. */
  criteria: string;
  acknowledgeWithinMinutes: number;
  mitigateWithinHours: number;
  /**
   * Blueprint 13 asks for "the learning captured afterwards". For the two top
   * severities that is mandatory: the incident cannot be closed without a root
   * cause and the actions taken to stop it happening again.
   */
  requiresPostReview: boolean;
  /** Who must be told, beyond the operations team. */
  notifies: string;
}

export const SEVERITY_POLICIES: Record<IncidentSeverity, SeverityPolicy> = {
  SEV1: {
    severity: 'SEV1',
    label: 'Critical',
    criteria: 'The platform is unusable for learners, or personal data may be exposed.',
    acknowledgeWithinMinutes: 15,
    mitigateWithinHours: 4,
    requiresPostReview: true,
    notifies: 'Platform owner immediately, and affected schools within the notification window.',
  },
  SEV2: {
    severity: 'SEV2',
    label: 'Major',
    criteria: 'A core journey is broken for a whole school or grade with no workaround.',
    acknowledgeWithinMinutes: 30,
    mitigateWithinHours: 8,
    requiresPostReview: true,
    notifies: 'Platform owner, and the school administrators affected.',
  },
  SEV3: {
    severity: 'SEV3',
    label: 'Degraded',
    criteria: 'A feature is impaired but a workaround exists and lessons continue.',
    acknowledgeWithinMinutes: 240,
    mitigateWithinHours: 72,
    requiresPostReview: false,
    notifies: 'Operations team; schools on request.',
  },
  SEV4: {
    severity: 'SEV4',
    label: 'Minor',
    criteria: 'Cosmetic or low-impact, tracked so it is not forgotten.',
    acknowledgeWithinMinutes: 1440,
    mitigateWithinHours: 240,
    requiresPostReview: false,
    notifies: 'Operations team.',
  },
};

export function isIncidentSeverity(value: string): value is IncidentSeverity {
  return (INCIDENT_SEVERITIES as readonly string[]).includes(value);
}

export function isIncidentStatus(value: string): value is IncidentStatus {
  return (INCIDENT_STATUSES as readonly string[]).includes(value);
}

export function severityPolicy(severity: IncidentSeverity): SeverityPolicy {
  return SEVERITY_POLICIES[severity];
}

/**
 * The timeline is intentionally forgiving in one direction only: an incident may
 * be resolved straight from OPEN when the fix and the mitigation are the same
 * act, but it can never skip backwards out of CLOSED.
 */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['MITIGATED', 'RESOLVED'],
  MITIGATED: ['RESOLVED', 'OPEN'],
  RESOLVED: ['POST_REVIEW', 'CLOSED', 'OPEN'],
  POST_REVIEW: ['CLOSED', 'OPEN'],
  CLOSED: [],
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

/** Statuses where the incident is still live work. */
export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['OPEN', 'MITIGATED'];

export interface ClosureCheck {
  allowed: boolean;
  /** Empty when closure is allowed; otherwise what is still missing. */
  missing: string[];
}

/**
 * Blueprint 13's closure criteria for an incident, as a checkable function.
 * A SEV1 with no root cause recorded is not a closed incident; it is an open
 * incident that someone stopped looking at.
 */
export function incidentClosureCheck(record: {
  severity: string;
  dataAffected: boolean;
  resolvedAt: Date | null;
  rootCause: string | null;
  preventiveActions: string | null;
  impactSummary: string | null;
}): ClosureCheck {
  const missing: string[] = [];
  if (!record.resolvedAt) missing.push('a resolution time');

  const requiresReview =
    isIncidentSeverity(record.severity) && severityPolicy(record.severity).requiresPostReview;

  if (requiresReview || record.dataAffected) {
    if (!record.rootCause) missing.push('a root cause');
    if (!record.preventiveActions) missing.push('the preventive actions taken');
  }
  // Blueprint 10: if personal data was affected, the impact must be written down
  // before the record is closed, because that text is what a notification uses.
  if (record.dataAffected && !record.impactSummary) missing.push('an impact summary');

  return { allowed: missing.length === 0, missing };
}

/** Blueprint 10 breach notification window, counted from detection. */
export const BREACH_NOTIFICATION_HOURS = 72;

export function breachNotificationDueAt(detectedAt: Date): Date {
  return new Date(detectedAt.getTime() + BREACH_NOTIFICATION_HOURS * HOUR_MS);
}

export interface IncidentTargets {
  acknowledgeBy: Date;
  mitigateBy: Date;
  /** Only set where personal data was or may have been affected. */
  notifyBy: Date | null;
}

export function incidentTargets(
  severity: IncidentSeverity,
  detectedAt: Date,
  dataAffected: boolean,
): IncidentTargets {
  const policy = severityPolicy(severity);
  return {
    acknowledgeBy: new Date(detectedAt.getTime() + policy.acknowledgeWithinMinutes * 60_000),
    mitigateBy: new Date(detectedAt.getTime() + policy.mitigateWithinHours * HOUR_MS),
    notifyBy: dataAffected ? breachNotificationDueAt(detectedAt) : null,
  };
}

// ── Job runs ────────────────────────────────────────────────────────────────

export const JOB_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export const TERMINAL_JOB_STATUSES: JobStatus[] = ['SUCCEEDED', 'FAILED', 'SKIPPED'];

/**
 * A run that started long ago and never finished is not "running", it is lost —
 * the process died without writing a terminal status. Twelve hours is well past
 * any scheduled job in this platform, so anything older is reported as stalled
 * rather than silently inflating the healthy count.
 */
export const STALLED_JOB_HOURS = 12;

export function isStalledRun(
  run: { status: string; startedAt: Date; finishedAt: Date | null },
  now = new Date(),
): boolean {
  if (run.status !== 'RUNNING' || run.finishedAt) return false;
  return now.getTime() - run.startedAt.getTime() > STALLED_JOB_HOURS * HOUR_MS;
}

export interface JobHealth {
  jobKey: string;
  lastStatus: JobStatus | 'STALLED' | 'NEVER_RUN';
  lastRunAt: Date | null;
  consecutiveFailures: number;
  isHealthy: boolean;
}

/**
 * Summarises one job's recent runs, newest first. `consecutiveFailures` is what
 * an operator actually reacts to: a single failure is noise, four in a row is a
 * broken job.
 */
export function jobHealth(
  jobKey: string,
  runsNewestFirst: { status: string; startedAt: Date; finishedAt: Date | null }[],
  now = new Date(),
): JobHealth {
  if (runsNewestFirst.length === 0) {
    return {
      jobKey,
      lastStatus: 'NEVER_RUN',
      lastRunAt: null,
      consecutiveFailures: 0,
      isHealthy: false,
    };
  }

  const latest = runsNewestFirst[0];
  const lastStatus: JobHealth['lastStatus'] = isStalledRun(latest, now)
    ? 'STALLED'
    : isJobStatus(latest.status)
      ? latest.status
      : 'NEVER_RUN';

  let consecutiveFailures = 0;
  for (const run of runsNewestFirst) {
    if (run.status === 'FAILED' || isStalledRun(run, now)) consecutiveFailures += 1;
    else break;
  }

  return {
    jobKey,
    lastStatus,
    lastRunAt: latest.startedAt,
    consecutiveFailures,
    isHealthy: consecutiveFailures === 0 && lastStatus !== 'NEVER_RUN',
  };
}

// ── Settings ────────────────────────────────────────────────────────────────

/**
 * Keys the platform reads at runtime. Declaring them means a typo in the admin
 * panel creates a visible unknown key rather than a setting the code never sees.
 * `isSecret` keys are redacted for anyone who is not platform staff.
 */
export interface SettingSpec {
  key: string;
  description: string;
  isSecret: boolean;
}

export const SETTING_SPECS: readonly SettingSpec[] = [
  {
    key: 'support.contactEmail',
    description: 'Address shown to schools when they need a human.',
    isSecret: false,
  },
  {
    key: 'support.escalationRota',
    description: 'Current on-call name or rota reference for escalations.',
    isSecret: false,
  },
  {
    key: 'platform.maintenanceBanner',
    description: 'Banner text shown to every signed-in user. Empty means hidden.',
    isSecret: false,
  },
  {
    key: 'platform.registrationOpen',
    description: 'Whether new school self-registration is accepted.',
    isSecret: false,
  },
  {
    key: 'privacy.dataProtectionContact',
    description: 'Named contact for data protection requests (blueprint 10).',
    isSecret: false,
  },
  {
    key: 'privacy.defaultRetentionDays',
    description: 'Retention default applied when a school states no preference.',
    isSecret: false,
  },
  {
    key: 'commercial.defaultCurrency',
    description: 'Three-letter currency used when a subscription states none.',
    isSecret: false,
  },
  {
    key: 'integrations.smtpCredentialRef',
    description: 'Reference to the mail credential held in the host secret store.',
    isSecret: true,
  },
] as const;

export function settingSpec(key: string): SettingSpec | undefined {
  return SETTING_SPECS.find((spec) => spec.key === key);
}

export function isKnownSettingKey(key: string): boolean {
  return settingSpec(key) !== undefined;
}

/** The redacted stand-in for a secret value. Never the value itself. */
export const REDACTED = '__redacted__';
