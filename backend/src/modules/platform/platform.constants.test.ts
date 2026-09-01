import { describe, expect, it } from 'vitest';
import {
  BREACH_NOTIFICATION_HOURS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TRANSITIONS,
  JOB_STATUSES,
  OPEN_INCIDENT_STATUSES,
  SETTING_SPECS,
  SEVERITY_POLICIES,
  STALLED_JOB_HOURS,
  breachNotificationDueAt,
  canTransitionIncident,
  incidentClosureCheck,
  incidentTargets,
  isIncidentSeverity,
  isIncidentStatus,
  isJobStatus,
  isKnownSettingKey,
  isStalledRun,
  jobHealth,
  settingSpec,
  severityPolicy,
} from './platform.constants';

const HOUR = 3_600_000;

// ── Severity bands ──────────────────────────────────────────────────────────

describe('severity policies', () => {
  it('covers every severity with criteria, targets and a notification route', () => {
    for (const severity of INCIDENT_SEVERITIES) {
      const policy = severityPolicy(severity);
      expect(policy.severity).toBe(severity);
      expect(policy.criteria.length).toBeGreaterThan(20);
      expect(policy.notifies.length).toBeGreaterThan(10);
      expect(policy.acknowledgeWithinMinutes).toBeGreaterThan(0);
      expect(policy.mitigateWithinHours).toBeGreaterThan(0);
    }
  });

  it('gets strictly slacker as severity drops', () => {
    for (let i = 1; i < INCIDENT_SEVERITIES.length; i += 1) {
      const tighter = severityPolicy(INCIDENT_SEVERITIES[i - 1]);
      const looser = severityPolicy(INCIDENT_SEVERITIES[i]);
      expect(looser.acknowledgeWithinMinutes).toBeGreaterThan(tighter.acknowledgeWithinMinutes);
      expect(looser.mitigateWithinHours).toBeGreaterThan(tighter.mitigateWithinHours);
    }
  });

  it('requires a post-incident review for the two top severities only', () => {
    expect(severityPolicy('SEV1').requiresPostReview).toBe(true);
    expect(severityPolicy('SEV2').requiresPostReview).toBe(true);
    expect(severityPolicy('SEV3').requiresPostReview).toBe(false);
    expect(severityPolicy('SEV4').requiresPostReview).toBe(false);
  });

  it('is keyed by the severity list itself, so a new band cannot be undefined', () => {
    expect(Object.keys(SEVERITY_POLICIES).sort()).toEqual([...INCIDENT_SEVERITIES].sort());
  });

  it('recognises only the declared strings', () => {
    expect(isIncidentSeverity('SEV1')).toBe(true);
    expect(isIncidentSeverity('sev1')).toBe(false);
    expect(isIncidentSeverity('CRITICAL')).toBe(false);
    expect(isIncidentStatus('POST_REVIEW')).toBe(true);
    expect(isIncidentStatus('DONE')).toBe(false);
    expect(isJobStatus('SUCCEEDED')).toBe(true);
    expect(isJobStatus('OK')).toBe(false);
  });
});

describe('incidentTargets', () => {
  const detectedAt = new Date('2026-04-01T10:00:00.000Z');

  it('counts every target from the moment of detection, not of reporting', () => {
    const targets = incidentTargets('SEV1', detectedAt, false);
    expect(targets.acknowledgeBy.toISOString()).toBe('2026-04-01T10:15:00.000Z');
    expect(targets.mitigateBy.toISOString()).toBe('2026-04-01T14:00:00.000Z');
    expect(targets.notifyBy).toBeNull();
  });

  it('starts the 72-hour notification clock when personal data is affected', () => {
    const targets = incidentTargets('SEV2', detectedAt, true);
    expect(BREACH_NOTIFICATION_HOURS).toBe(72);
    expect(targets.notifyBy?.getTime()).toBe(detectedAt.getTime() + 72 * HOUR);
    expect(breachNotificationDueAt(detectedAt).toISOString()).toBe('2026-04-04T10:00:00.000Z');
  });

  it('does not soften the notification window for a low severity', () => {
    // A small-looking incident can still expose data; the duty is the same.
    const targets = incidentTargets('SEV4', detectedAt, true);
    expect(targets.notifyBy?.getTime()).toBe(detectedAt.getTime() + 72 * HOUR);
  });
});

// ── Timeline ────────────────────────────────────────────────────────────────

describe('incident transitions', () => {
  it('declares a move list for every status', () => {
    for (const status of INCIDENT_STATUSES) {
      expect(INCIDENT_TRANSITIONS[status]).toBeDefined();
    }
  });

  it('treats closed as terminal', () => {
    expect(INCIDENT_TRANSITIONS.CLOSED).toEqual([]);
    for (const status of INCIDENT_STATUSES) {
      expect(canTransitionIncident('CLOSED', status)).toBe(false);
    }
  });

  it('lets an incident be resolved straight from open', () => {
    expect(canTransitionIncident('OPEN', 'RESOLVED')).toBe(true);
  });

  it('refuses to close anything that was never resolved', () => {
    expect(canTransitionIncident('OPEN', 'CLOSED')).toBe(false);
    expect(canTransitionIncident('MITIGATED', 'CLOSED')).toBe(false);
    expect(canTransitionIncident('RESOLVED', 'CLOSED')).toBe(true);
    expect(canTransitionIncident('POST_REVIEW', 'CLOSED')).toBe(true);
  });

  it('allows reopening from every state except closed', () => {
    expect(canTransitionIncident('MITIGATED', 'OPEN')).toBe(true);
    expect(canTransitionIncident('RESOLVED', 'OPEN')).toBe(true);
    expect(canTransitionIncident('POST_REVIEW', 'OPEN')).toBe(true);
  });

  it('counts only open and mitigated as live work', () => {
    expect(OPEN_INCIDENT_STATUSES).toEqual(['OPEN', 'MITIGATED']);
  });
});

// ── Closure criteria ────────────────────────────────────────────────────────

describe('incidentClosureCheck', () => {
  const resolved = {
    severity: 'SEV3',
    dataAffected: false,
    resolvedAt: new Date('2026-04-02T09:00:00.000Z'),
    rootCause: null,
    preventiveActions: null,
    impactSummary: null,
  };

  it('closes a low-severity incident on the resolution alone', () => {
    expect(incidentClosureCheck(resolved)).toEqual({ allowed: true, missing: [] });
  });

  it('will not close anything that has no resolution time', () => {
    const check = incidentClosureCheck({ ...resolved, resolvedAt: null });
    expect(check.allowed).toBe(false);
    expect(check.missing).toContain('a resolution time');
  });

  it('demands the learning for a critical incident', () => {
    const check = incidentClosureCheck({ ...resolved, severity: 'SEV1' });
    expect(check.allowed).toBe(false);
    expect(check.missing).toEqual(['a root cause', 'the preventive actions taken']);
  });

  it('demands the learning whenever personal data was affected, at any severity', () => {
    const check = incidentClosureCheck({ ...resolved, severity: 'SEV4', dataAffected: true });
    expect(check.allowed).toBe(false);
    expect(check.missing).toEqual([
      'a root cause',
      'the preventive actions taken',
      'an impact summary',
    ]);
  });

  it('closes once the review is written down', () => {
    const check = incidentClosureCheck({
      ...resolved,
      severity: 'SEV1',
      dataAffected: true,
      rootCause: 'A migration dropped an index and a report timed out.',
      preventiveActions: 'Index added to the migration checklist and a smoke test added.',
      impactSummary: 'Two schools could not open reports for 40 minutes. No data was exposed.',
    });
    expect(check).toEqual({ allowed: true, missing: [] });
  });

  it('treats an unrecognised severity as not needing a review, but still needing a resolution', () => {
    // Defensive: the column is VarChar, so an old value must not crash closure.
    const check = incidentClosureCheck({ ...resolved, severity: 'SEV9' });
    expect(check.allowed).toBe(true);
  });
});

// ── Job health ──────────────────────────────────────────────────────────────

describe('job health', () => {
  const now = new Date('2026-04-05T12:00:00.000Z');
  const run = (status: string, hoursAgo: number, finished = true) => ({
    status,
    startedAt: new Date(now.getTime() - hoursAgo * HOUR),
    finishedAt: finished ? new Date(now.getTime() - hoursAgo * HOUR + 1000) : null,
  });

  it('calls a long-running unfinished run stalled rather than healthy', () => {
    expect(STALLED_JOB_HOURS).toBe(12);
    expect(isStalledRun(run('RUNNING', 13, false), now)).toBe(true);
    expect(isStalledRun(run('RUNNING', 1, false), now)).toBe(false);
    // A finished row is never stalled, whatever its start time.
    expect(isStalledRun(run('RUNNING', 99, true), now)).toBe(false);
    expect(isStalledRun(run('SUCCEEDED', 99, true), now)).toBe(false);
  });

  it('reports a job that has never run as unhealthy rather than fine', () => {
    const health = jobHealth('retention.purge', [], now);
    expect(health).toEqual({
      jobKey: 'retention.purge',
      lastStatus: 'NEVER_RUN',
      lastRunAt: null,
      consecutiveFailures: 0,
      isHealthy: false,
    });
  });

  it('is healthy after a success, whatever happened before it', () => {
    const health = jobHealth('digest', [run('SUCCEEDED', 1), run('FAILED', 25)], now);
    expect(health.lastStatus).toBe('SUCCEEDED');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.isHealthy).toBe(true);
  });

  it('counts a run of failures, stopping at the first success', () => {
    const health = jobHealth(
      'leaderboard.recompute',
      [run('FAILED', 1), run('FAILED', 2), run('FAILED', 3), run('SUCCEEDED', 4), run('FAILED', 5)],
      now,
    );
    expect(health.consecutiveFailures).toBe(3);
    expect(health.isHealthy).toBe(false);
  });

  it('counts a stalled run as a failure, because nothing finished', () => {
    const health = jobHealth('digest', [run('RUNNING', 20, false), run('FAILED', 44)], now);
    expect(health.lastStatus).toBe('STALLED');
    expect(health.consecutiveFailures).toBe(2);
  });

  it('does not count a currently-running job as failing', () => {
    const health = jobHealth('digest', [run('RUNNING', 1, false), run('SUCCEEDED', 25)], now);
    expect(health.lastStatus).toBe('RUNNING');
    expect(health.consecutiveFailures).toBe(0);
    expect(health.isHealthy).toBe(true);
  });

  it('treats a skipped run as a non-failure', () => {
    const health = jobHealth('digest', [run('SKIPPED', 1)], now);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.isHealthy).toBe(true);
  });

  it('lists exactly the four job statuses the schema comment names', () => {
    expect([...JOB_STATUSES]).toEqual(['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']);
  });
});

// ── Settings ────────────────────────────────────────────────────────────────

describe('setting specs', () => {
  it('declares a unique key with a description for each setting', () => {
    const keys = SETTING_SPECS.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of SETTING_SPECS) {
      expect(spec.description.length).toBeGreaterThan(10);
      expect(spec.key).toMatch(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/);
    }
  });

  it('marks the credential reference secret and the contact addresses not', () => {
    expect(settingSpec('integrations.smtpCredentialRef')?.isSecret).toBe(true);
    expect(settingSpec('support.contactEmail')?.isSecret).toBe(false);
  });

  it('reports an undeclared key as unknown rather than guessing', () => {
    expect(isKnownSettingKey('support.contactEmail')).toBe(true);
    expect(isKnownSettingKey('support.contactEmial')).toBe(false);
    expect(settingSpec('nope.nothing')).toBeUndefined();
  });
});
