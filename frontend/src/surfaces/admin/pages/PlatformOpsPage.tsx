import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  type Column,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconOffline,
  IconSafety,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import {
  createIncident,
  fetchIncidents,
  fetchJobHealth,
  fetchJobRuns,
  fetchReleaseNotes,
  fetchSeverityPolicies,
  setIncidentStatus,
} from '@/platform/platform.api';
import type {
  IncidentRow,
  IncidentSeverity,
  IncidentStatus,
  JobRunRow,
  JobStatus,
} from '@/platform/platform.types';
import type { ReleaseNoteRow } from '@/platform/platform.types';
import {
  EditIncidentSection,
  IncidentSummaryStrip,
  OverviewPanel,
  ReleaseNoteModal,
  SettingsPanel,
} from './PlatformEditors';

/**
 * Platform operations (blueprint §13 and §17, UX brief N8–N12).
 *
 * Twenty-three routes with no client file: incidents, scheduled-job health,
 * release notes and platform settings were all implemented and unreachable.
 * This is Midas staff only and deliberately the least decorated screen in the
 * product — it is read at 2am by someone establishing whether something is on
 * fire, so it leads with what is wrong rather than what exists.
 *
 * Job health comes first for that reason. Nine jobs run in-process on a single
 * instance and a silent failure there is invisible everywhere else in the
 * product: overdue assignments stop sweeping, notifications stop dispatching,
 * and nothing tells anybody.
 */

const SEVERITY_TONE: Record<IncidentSeverity, BadgeTone> = {
  SEV1: 'danger',
  SEV2: 'danger',
  SEV3: 'warning',
  SEV4: 'neutral',
};

const INCIDENT_STATUS_TONE: Record<IncidentStatus, BadgeTone> = {
  OPEN: 'danger',
  MITIGATED: 'warning',
  RESOLVED: 'success',
  POST_REVIEW: 'info',
  CLOSED: 'neutral',
};

const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'Open',
  MITIGATED: 'Mitigated',
  RESOLVED: 'Resolved',
  POST_REVIEW: 'Post review',
  CLOSED: 'Closed',
};

const JOB_TONE: Record<JobStatus, BadgeTone> = {
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
};

type Tab = 'overview' | 'jobs' | 'incidents' | 'releases' | 'settings';

export function PlatformOpsPage() {
  useDocumentTitle('Platform operations');
  const canOverview = useCan('platform.overview.read');
  const canSettings = useCan('platform.settings.read');
  const [tab, setTab] = useState<Tab>(canOverview ? 'overview' : 'jobs');

  const tabs: { id: Tab; label: string }[] = [
    ...(canOverview ? [{ id: 'overview' as const, label: 'Overview' }] : []),
    { id: 'jobs', label: 'Jobs & health' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'releases', label: 'Releases' },
    ...(canSettings ? [{ id: 'settings' as const, label: 'Settings' }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform operations"
        description="Scheduled work, incidents and releases across every tenant."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Platform operations sections">
        {tabs.map((entry) => (
          <Button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            variant={tab === entry.id ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewPanel /> : null}
      {tab === 'jobs' ? <JobsPanel /> : null}
      {tab === 'incidents' ? <IncidentsPanel /> : null}
      {tab === 'releases' ? <ReleasesPanel /> : null}
      {tab === 'settings' ? <SettingsPanel /> : null}
    </div>
  );
}

/**
 * Scheduled job health.
 *
 * A failing job is the quietest kind of outage in this product: nothing in the
 * learner or teacher experience says "the overdue sweep stopped running four
 * days ago". So health leads, and the run log sits underneath it.
 */
function JobsPanel() {
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const health = useQuery({ queryKey: qk.platform.jobHealth, queryFn: () => fetchJobHealth() });
  const runs = useQuery({
    queryKey: qk.platform.jobRuns({ problemsOnly, page }),
    queryFn: () => fetchJobRuns({ problemsOnly: problemsOnly || undefined, page, pageSize: 20 }),
  });

  const columns: Column<JobRunRow>[] = [
    { key: 'jobKey', header: 'Job', render: (row) => <code className="text-xs">{row.jobKey}</code> },
    {
      key: 'status',
      header: 'Result',
      render: (row) => <Badge tone={JOB_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    { key: 'startedAt', header: 'Started', render: (row) => formatDateTime(row.startedAt) },
    {
      key: 'duration',
      header: 'Took',
      render: (row) => (row.durationMs === null ? '—' : `${(row.durationMs / 1000).toFixed(1)}s`),
    },
    {
      key: 'error',
      header: 'Error',
      className: 'hidden lg:table-cell',
      render: (row) => (row.error ? <span className="text-danger-strong">{row.error}</span> : '—'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Job health" description="Nine jobs run in-process on one instance." />
        <CardBody>
          <QueryBoundary
            isLoading={health.isPending}
            error={health.error}
            onRetry={() => void health.refetch()}
          >
            {(health.data ?? []).length === 0 ? (
              <EmptyState title="No job history yet" />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(health.data ?? []).map((entry) => {
                  const failing = entry.isHealthy === false || entry.lastStatus === 'FAILED';
                  return (
                    <li
                      key={entry.jobKey}
                      className={`rounded-md border p-3 ${
                        failing ? 'border-danger bg-danger-soft' : 'border-border'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <code className="text-xs text-ink">{entry.jobKey}</code>
                        {entry.lastStatus ? (
                          <Badge tone={JOB_TONE[entry.lastStatus] ?? 'neutral'}>
                            {entry.lastStatus}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Never run</Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted">
                        {entry.lastRunAt ? `Last run ${formatDateTime(entry.lastRunAt)}` : 'No runs recorded'}
                      </p>
                      {entry.consecutiveFailures ? (
                        <p className="mt-1 text-xs text-danger-strong">
                          {entry.consecutiveFailures} failures in a row
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryBoundary>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Run log"
          actions={
            <Checkbox
              label="Problems only"
              checked={problemsOnly}
              onChange={(event) => {
                setProblemsOnly(event.target.checked);
                setPage(1);
              }}
            />
          }
        />
        <CardBody className="p-0">
          <QueryBoundary
            isLoading={runs.isPending}
            error={runs.error}
            onRetry={() => void runs.refetch()}
          >
            <DataTable
              caption="Scheduled job runs"
              rows={runs.data?.items ?? []}
              columns={columns}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  icon={<IconOffline className="h-8 w-8" aria-hidden />}
                  title={problemsOnly ? 'Nothing has failed' : 'No runs recorded'}
                />
              }
            />
            {runs.data ? <Pagination meta={runs.data.meta} onPageChange={setPage} /> : null}
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}

function IncidentsPanel() {
  const queryClient = useQueryClient();
  const canWrite = useCan('platform.incidents.write');
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [isCreating, setCreating] = useState(false);
  const [detail, setDetail] = useState<IncidentRow | null>(null);

  const policies = useQuery({
    queryKey: qk.platform.severities,
    queryFn: () => fetchSeverityPolicies(),
  });

  const query = useQuery({
    queryKey: qk.platform.incidents({ openOnly, page }),
    queryFn: () => fetchIncidents({ openOnly: openOnly || undefined, page, pageSize: 20 }),
  });

  const move = useMutation({
    mutationFn: (input: { id: string; status: string; note?: string }) =>
      setIncidentStatus(input.id, { status: input.status, note: input.note }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.all });
      setDetail(null);
    },
  });

  const columns: Column<IncidentRow>[] = [
    {
      key: 'severity',
      header: 'Sev',
      render: (row) => <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge>,
    },
    {
      key: 'title',
      header: 'Incident',
      render: (row) => (
        <span>
          <span className="text-ink">{row.title}</span>
          {row.dataAffected ? (
            <span className="ml-2 inline-block">
              <Badge tone="danger">Data affected</Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={INCIDENT_STATUS_TONE[row.status]}>{INCIDENT_STATUS_LABEL[row.status]}</Badge>
      ),
    },
    {
      key: 'detectedAt',
      header: 'Detected',
      className: 'hidden sm:table-cell',
      render: (row) => formatDateTime(row.detectedAt),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => setDetail(row)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <IncidentSummaryStrip />
      {policies.data && policies.data.length > 0 ? (
        <Card>
          <CardHeader title="Severity policy" description="What each level commits Midas to." />
          <CardBody>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {policies.data.map((policy) => (
                <li key={policy.severity} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone={SEVERITY_TONE[policy.severity]}>{policy.severity}</Badge>
                    <span className="text-sm font-medium text-ink">{policy.label}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{policy.criteria}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Acknowledge within {policy.acknowledgeWithinMinutes} min · mitigate within{' '}
                    {policy.mitigateWithinHours} h
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Incidents"
          actions={
            <div className="flex items-center gap-3">
              <Checkbox
                label="Open only"
                checked={openOnly}
                onChange={(event) => {
                  setOpenOnly(event.target.checked);
                  setPage(1);
                }}
              />
              {canWrite ? (
                <Button
                  size="sm"
                  leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
                  onClick={() => setCreating(true)}
                >
                  Record one
                </Button>
              ) : null}
            </div>
          }
        />
        <CardBody className="p-0">
          <QueryBoundary
            isLoading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
          >
            <DataTable
              caption="Incidents"
              rows={query.data?.items ?? []}
              columns={columns}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  icon={<IconSafety className="h-8 w-8" aria-hidden />}
                  title={openOnly ? 'Nothing open' : 'No incidents recorded'}
                />
              }
            />
            {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
          </QueryBoundary>
        </CardBody>
      </Card>

      {isCreating ? <RecordIncidentModal onClose={() => setCreating(false)} /> : null}

      {detail ? (
        <IncidentDetailModal
          incident={detail}
          canWrite={canWrite}
          isMoving={move.isPending}
          error={move.error}
          onMove={(status, note) => move.mutate({ id: detail.id, status, note })}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function IncidentDetailModal({
  incident,
  canWrite,
  isMoving,
  error,
  onMove,
  onClose,
}: {
  incident: IncidentRow;
  canWrite: boolean;
  isMoving: boolean;
  error: unknown;
  onMove: (status: string, note?: string) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(incident);
  const [status, setStatus] = useState<string>(current.status);
  const [note, setNote] = useState('');

  return (
    <Modal isOpen onClose={onClose} title={current.title} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SEVERITY_TONE[current.severity]}>{current.severity}</Badge>
          <Badge tone={INCIDENT_STATUS_TONE[current.status]}>
            {INCIDENT_STATUS_LABEL[current.status]}
          </Badge>
          {current.dataAffected ? <Badge tone="danger">Data affected</Badge> : null}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-muted">Detected</dt>
          <dd className="text-ink">{formatDateTime(current.detectedAt)}</dd>
          {current.mitigatedAt ? (
            <>
              <dt className="text-ink-muted">Mitigated</dt>
              <dd className="text-ink">{formatDateTime(current.mitigatedAt)}</dd>
            </>
          ) : null}
          {current.resolvedAt ? (
            <>
              <dt className="text-ink-muted">Resolved</dt>
              <dd className="text-ink">{formatDateTime(current.resolvedAt)}</dd>
            </>
          ) : null}
        </dl>

        <div className="rounded-md bg-surface-sunken p-3 text-sm text-ink">{current.summary}</div>

        {current.rootCause ? (
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Root cause</p>
            <p className="text-sm text-ink-muted">{current.rootCause}</p>
          </div>
        ) : null}

        {canWrite ? <EditIncidentSection incident={current} onSaved={setCurrent} /> : null}

        {canWrite ? (
          <div className="border-t border-border pt-4">
            {error ? <ErrorState error={error} /> : null}
            <p className="mb-2 text-sm font-medium text-ink">Move this on</p>
            <p className="mb-3 text-xs text-ink-muted">
              The server checks the timeline — an incident cannot be closed before it has a root
              cause, and it will say what is still missing.
            </p>
            <div className="flex flex-col gap-3">
              <Field label="Status">
                <Select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  options={(Object.keys(INCIDENT_STATUS_LABEL) as IncidentStatus[]).map((key) => ({
                    value: key,
                    label: INCIDENT_STATUS_LABEL[key],
                  }))}
                />
              </Field>
              <Field label="Note" hint="Optional, but it is what makes the timeline readable later.">
                <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
              <div>
                <Button
                  isLoading={isMoving}
                  disabled={status === current.status}
                  onClick={() => onMove(status, note.trim() || undefined)}
                >
                  Update status
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function RecordIncidentModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<string>('SEV3');
  const [summary, setSummary] = useState('');
  const [dataAffected, setDataAffected] = useState(false);
  const [detectedAt, setDetectedAt] = useState(() => new Date().toISOString().slice(0, 16));

  const create = useMutation({
    mutationFn: () =>
      createIncident({
        title: title.trim(),
        severity,
        summary: summary.trim(),
        detectedAt: new Date(detectedAt).toISOString(),
        dataAffected,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.all });
      onClose();
    },
  });

  const canSubmit = title.trim().length >= 6 && summary.trim().length >= 20;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Record an incident"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button isLoading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error ? <ErrorState error={create.error} /> : null}

        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Severity">
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              options={[
                { value: 'SEV1', label: 'SEV1 — critical' },
                { value: 'SEV2', label: 'SEV2 — major' },
                { value: 'SEV3', label: 'SEV3 — moderate' },
                { value: 'SEV4', label: 'SEV4 — minor' },
              ]}
            />
          </Field>
          <Field label="Detected at">
            <Input
              type="datetime-local"
              value={detectedAt}
              onChange={(event) => setDetectedAt(event.target.value)}
            />
          </Field>
        </div>

        <Field label="What happened" hint="At least twenty characters.">
          <Textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>

        <Checkbox
          label="Pupil or staff data was affected"
          hint="This starts the notification clock. Set it if there is any doubt."
          checked={dataAffected}
          onChange={(event) => setDataAffected(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

function ReleasesPanel() {
  const canWrite = useCan('platform.releases.write');
  const [editing, setEditing] = useState<ReleaseNoteRow | 'new' | null>(null);
  const query = useQuery({ queryKey: qk.platform.releases, queryFn: () => fetchReleaseNotes() });

  return (
    <Card>
      <CardHeader
        title="Releases"
        description="What shipped, and what it changed."
        actions={
          canWrite ? (
            <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New release note
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          {(query.data?.items ?? []).length === 0 ? (
            <EmptyState title="No releases recorded" />
          ) : (
            <ul className="flex flex-col gap-4">
              {(query.data?.items ?? []).map((release) => (
                <li key={release.version} className="rounded-md border border-border p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <code className="text-sm text-ink">{release.version}</code>
                    <span className="text-sm font-medium text-ink">{release.title}</span>
                    {release.affectsEvidenceInterpretation ? (
                      <Badge tone="warning">Changes how evidence reads</Badge>
                    ) : null}
                    {release.isPublished ? null : <Badge tone="neutral">Draft</Badge>}
                    {canWrite ? (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(release)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                  <p className="mb-2 text-sm text-ink-muted">{release.summary}</p>
                  {(['added', 'changed', 'fixed', 'removed'] as const).map((group) => {
                    const items = release.changes?.[group] ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div key={group} className="mt-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                          {group}
                        </p>
                        <ul className="list-inside list-disc text-sm text-ink">
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      </CardBody>
      {editing ? (
        <ReleaseNoteModal existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}
