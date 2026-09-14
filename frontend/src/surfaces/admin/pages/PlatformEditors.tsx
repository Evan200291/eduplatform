import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconAdd,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  createReleaseNote,
  deletePlatformSetting,
  fetchIncidentSummary,
  fetchPlatformOverview,
  fetchPlatformSettingCatalogue,
  fetchPlatformSettings,
  updateIncident,
  updateReleaseNote,
  writePlatformSetting,
} from '@/platform/platform.api';
import type { IncidentRow, IncidentSeverity, ReleaseNoteRow } from '@/platform/platform.types';
import { qk } from '@/query/keys';

/**
 * The parts of platform operations that were read-only or missing: the
 * owner's overview, platform-wide settings, editing an incident's record, and
 * writing release notes. Kept apart from `PlatformOpsPage` so that file stays
 * the 2am "what is on fire" view.
 */

function Tile({ label, value, attention = false }: { label: string; value: number | string; attention?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${attention ? 'border-danger bg-danger-soft' : 'border-line'}`}>
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink-muted">
        {label}
        {attention ? ' — needs attention' : ''}
      </p>
    </div>
  );
}

/** Blueprint 05: adoption, commercial state and operational health in one place. */
export function OverviewPanel() {
  const query = useQuery({ queryKey: qk.platform.overview, queryFn: fetchPlatformOverview });
  const data = query.data;
  return (
    <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {data ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Health" description={`As of ${formatDateTime(data.generatedAt)}`} />
            <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Open incidents" value={data.operations.openIncidents} attention={data.operations.openIncidents > 0} />
              <Tile
                label="Incidents touching data"
                value={data.operations.dataAffectedIncidents}
                attention={data.operations.dataAffectedIncidents > 0}
              />
              <Tile label="Unhealthy jobs" value={data.operations.unhealthyJobs} attention={data.operations.unhealthyJobs > 0} />
              <Tile label="Open support requests" value={data.operations.openSupportRequests} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Adoption" />
            <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Organizations" value={formatNumber(data.tenancy.organizations)} />
              <Tile label={`Schools (${data.tenancy.activeSchools} active)`} value={formatNumber(data.tenancy.schools)} />
              <Tile label="Active learners" value={formatNumber(data.people.activeStudents)} />
              <Tile label="Active teachers" value={formatNumber(data.people.activeTeachers)} />
              <Tile label="Signed in, last 7 days" value={formatNumber(data.engagement.activeLast7Days)} />
              <Tile label="Lessons finished, last 7 days" value={formatNumber(data.engagement.lessonCompletionsLast7Days)} />
              <Tile label="Assignments open" value={formatNumber(data.engagement.assignmentsOpen)} />
              <Tile label="Classes" value={formatNumber(data.tenancy.classes)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Commercial and content" />
            <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Agreements ending in 30 days" value={data.commercial.expiringWithin30Days} />
              <Tile label="Past due" value={data.commercial.pastDue} attention={data.commercial.pastDue > 0} />
              <Tile label={`Lessons (${data.content.publishedLessons} published)`} value={formatNumber(data.content.lessons)} />
              <Tile label="Questions" value={formatNumber(data.content.questions)} />
            </CardBody>
            <CardBody className="flex flex-wrap gap-2 pt-0">
              {data.commercial.byPlan.map((entry) => (
                <Badge key={entry.plan} tone="neutral">
                  {entry.plan}: {entry.count}
                </Badge>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </QueryBoundary>
  );
}

/** The incident counts that matter most, above the list. */
export function IncidentSummaryStrip() {
  const query = useQuery({ queryKey: qk.platform.incidentSummary, queryFn: fetchIncidentSummary });
  if (!query.data) return null;
  const data = query.data;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Open" value={data.open} attention={data.open > 0} />
      <Tile label="Past the mitigation target" value={data.overdueMitigation} attention={data.overdueMitigation > 0} />
      <Tile label="Families or schools still to notify" value={data.awaitingNotification} attention={data.awaitingNotification > 0} />
      <Tile label="Open with data affected" value={data.dataAffected} attention={data.dataAffected > 0} />
    </div>
  );
}

/** Editing the incident's written record, which closure depends on. */
export function EditIncidentSection({ incident, onSaved }: { incident: IncidentRow; onSaved: (next: IncidentRow) => void }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [title, setTitle] = useState(incident.title);
  const [severity, setSeverity] = useState<IncidentSeverity>(incident.severity);
  const [summary, setSummary] = useState(incident.summary);
  const [impact, setImpact] = useState(incident.impactSummary ?? '');
  const [dataAffected, setDataAffected] = useState(incident.dataAffected);
  const [rootCause, setRootCause] = useState(incident.rootCause ?? '');
  const [preventive, setPreventive] = useState(incident.preventiveActions ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      updateIncident(incident.id, {
        ...(title.trim() !== incident.title ? { title: title.trim() } : {}),
        ...(severity !== incident.severity ? { severity } : {}),
        ...(summary.trim() !== incident.summary ? { summary: summary.trim() } : {}),
        ...(impact.trim() !== (incident.impactSummary ?? '') ? { impactSummary: impact.trim() } : {}),
        ...(dataAffected !== incident.dataAffected ? { dataAffected } : {}),
        ...(rootCause.trim() !== (incident.rootCause ?? '') ? { rootCause: rootCause.trim() } : {}),
        ...(preventive.trim() !== (incident.preventiveActions ?? '') ? { preventiveActions: preventive.trim() } : {}),
      }),
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.all });
      setOpen(false);
      onSaved(next);
    },
  });

  const changed =
    title.trim() !== incident.title ||
    severity !== incident.severity ||
    summary.trim() !== incident.summary ||
    impact.trim() !== (incident.impactSummary ?? '') ||
    dataAffected !== incident.dataAffected ||
    rootCause.trim() !== (incident.rootCause ?? '') ||
    preventive.trim() !== (incident.preventiveActions ?? '');

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2">
        {incident.closure && !incident.closure.allowed ? (
          <p className="text-sm text-ink-muted">Before it can close: {incident.closure.missing.join('; ')}.</p>
        ) : null}
        <div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Edit the record
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Severity">
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}
            options={[
              { value: 'SEV1', label: 'SEV1, critical' },
              { value: 'SEV2', label: 'SEV2, major' },
              { value: 'SEV3', label: 'SEV3, moderate' },
              { value: 'SEV4', label: 'SEV4, minor' },
            ]}
          />
        </Field>
      </div>
      <Field label="What happened">
        <Textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </Field>
      <Field label="Impact" hint="Who was affected and how.">
        <Textarea rows={2} value={impact} onChange={(event) => setImpact(event.target.value)} />
      </Field>
      <Checkbox
        label="Pupil or staff data was affected"
        hint="Setting this starts the notification clock."
        checked={dataAffected}
        onChange={(event) => setDataAffected(event.target.checked)}
      />
      <Field label="Root cause" hint="Needed before closure.">
        <Textarea rows={2} value={rootCause} onChange={(event) => setRootCause(event.target.value)} />
      </Field>
      <Field label="Preventive actions" hint="What stops it happening again.">
        <Textarea rows={2} value={preventive} onChange={(event) => setPreventive(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" isLoading={mutation.isPending} disabled={!changed} onClick={() => mutation.mutate()}>
          Save the record
        </Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Platform-wide settings. Every key the code reads is listed even if never
 * set, so nobody has to guess a key name. Values are JSON; a secret can be
 * replaced but never read back, and the table says so.
 */
export function SettingsPanel() {
  const canWrite = useCan('platform.settings.write');
  const settings = useQuery({ queryKey: qk.platform.settings, queryFn: () => fetchPlatformSettings() });
  const catalogue = useQuery({ queryKey: qk.platform.settingCatalogue, queryFn: fetchPlatformSettingCatalogue });
  const [editing, setEditing] = useState<{ key: string; description: string; isSecret: boolean; value: unknown } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const stored = settings.data ?? [];
  const known = catalogue.data ?? [];
  const rows = [
    ...known.map((spec) => {
      const row = stored.find((entry) => entry.key === spec.key);
      return { key: spec.key, description: spec.description, isSecret: spec.isSecret, row, known: true };
    }),
    ...stored
      .filter((entry) => !known.some((spec) => spec.key === entry.key))
      .map((row) => ({ key: row.key, description: row.description ?? '', isSecret: row.isSecret, row, known: false })),
  ];

  return (
    <Card>
      <CardHeader
        title="Platform settings"
        description="Values every school shares. Changes are audited."
        actions={
          canWrite ? (
            <Button
              size="sm"
              leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
              onClick={() => setEditing({ key: '', description: '', isSecret: false, value: '' })}
            >
              Add a setting
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <QueryBoundary
          isLoading={settings.isPending || catalogue.isPending}
          error={settings.error ?? catalogue.error}
          onRetry={() => {
            void settings.refetch();
            void catalogue.refetch();
          }}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No settings" />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="text-ink">{entry.key}</code>
                    {entry.isSecret ? <Badge tone="warning">Secret</Badge> : null}
                    {!entry.known ? <Badge tone="danger">Not read by any code</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-muted">{entry.description}</p>
                  <p className="mt-1 break-all text-ink">
                    {entry.row
                      ? entry.row.isRedacted || entry.isSecret
                        ? 'Set (hidden)'
                        : JSON.stringify(entry.row.value)
                      : <span className="text-ink-muted">Not set, the built-in default applies</span>}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({
                          key: entry.key,
                          description: entry.description,
                          isSecret: entry.isSecret,
                          value: entry.row && !entry.row.isRedacted ? entry.row.value : '',
                        })
                      }
                    >
                      {entry.row ? (entry.isSecret ? 'Replace' : 'Change') : 'Set'}
                    </Button>
                    {entry.row ? (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(entry.key)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {editing ? <SettingModal initial={editing} onClose={() => setEditing(null)} /> : null}
      {removing ? <RemoveSettingModal settingKey={removing} onClose={() => setRemoving(null)} /> : null}
    </Card>
  );
}

function SettingModal({
  initial,
  onClose,
}: {
  initial: { key: string; description: string; isSecret: boolean; value: unknown };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = initial.key === '';
  const [key, setKey] = useState(initial.key);
  const [raw, setRaw] = useState(initial.value === '' ? '' : JSON.stringify(initial.value, null, 2));
  const [description, setDescription] = useState(initial.description);
  const [isSecret, setSecret] = useState(initial.isSecret);

  let parsed: unknown;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parseError = 'Write the value as JSON: text in "quotes", numbers and true/false as they are.';
  }

  const mutation = useMutation({
    mutationFn: () =>
      writePlatformSetting({
        key: key.trim(),
        value: parsed,
        ...(description.trim() ? { description: description.trim() } : {}),
        isSecret,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.settings });
      onClose();
    },
  });

  const blocked = !/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(key.trim())
    ? 'A key looks like support.contactEmail.'
    : raw.trim() === ''
      ? 'Enter a value.'
      : parseError;

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title={isNew ? 'Add a setting' : `Change ${initial.key}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blocked !== null} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Key">
          <Input value={key} disabled={!isNew} onChange={(event) => setKey(event.target.value)} />
        </Field>
        <Field label="Value (JSON)" hint={initial.isSecret ? 'The current value is hidden. Whatever you enter replaces it.' : undefined}>
          <Textarea rows={4} value={raw} onChange={(event) => setRaw(event.target.value)} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Checkbox
          label="This is a secret"
          hint="Secrets are never shown again after saving, to anyone."
          checked={isSecret}
          onChange={(event) => setSecret(event.target.checked)}
        />
        {blocked ? <p className="text-sm text-ink-muted">{blocked}</p> : null}
      </div>
    </Modal>
  );
}

function RemoveSettingModal({ settingKey, onClose }: { settingKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deletePlatformSetting(settingKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.settings });
      onClose();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Remove ${settingKey}?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Keep it
          </Button>
          <Button variant="danger" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Remove
          </Button>
        </>
      }
    >
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <p className="text-ink">The stored value is deleted and the built-in default applies again.</p>
    </Modal>
  );
}

const GROUPS = ['added', 'changed', 'fixed', 'removed'] as const;

/** Writing or correcting a release note. Each change is one line. */
export function ReleaseNoteModal({ existing, onClose }: { existing?: ReleaseNoteRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState(existing?.version ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [lines, setLines] = useState<Record<(typeof GROUPS)[number], string>>({
    added: (existing?.changes.added ?? []).join('\n'),
    changed: (existing?.changes.changed ?? []).join('\n'),
    fixed: (existing?.changes.fixed ?? []).join('\n'),
    removed: (existing?.changes.removed ?? []).join('\n'),
  });
  const [affects, setAffects] = useState(existing?.affectsEvidenceInterpretation ?? false);
  const [releasedAt, setReleasedAt] = useState((existing?.releasedAt ?? new Date().toISOString()).slice(0, 10));
  const [isPublished, setPublished] = useState(existing?.isPublished ?? false);

  const changes = Object.fromEntries(
    GROUPS.map((group) => [
      group,
      lines[group]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ]),
  ) as Record<(typeof GROUPS)[number], string[]>;
  const changeCount = GROUPS.reduce((sum, group) => sum + changes[group].length, 0);

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> => {
      const input = {
        title: title.trim(),
        summary: summary.trim(),
        changes,
        affectsEvidenceInterpretation: affects,
        releasedAt,
        isPublished,
      };
      return existing ? updateReleaseNote(existing.version, input) : createReleaseNote({ ...input, version: version.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.releases });
      onClose();
    },
  });

  const blocked = !existing && !/^[0-9A-Za-z][0-9A-Za-z.\-+]*$/.test(version.trim())
    ? 'Use a version like 1.4.0.'
    : title.trim().length < 4
      ? 'The title needs four characters.'
      : summary.trim().length < 10
        ? 'The summary needs a sentence.'
        : changeCount === 0
          ? 'List at least one change.'
          : GROUPS.some((group) => changes[group].some((line) => line.length < 3 || line.length > 300))
            ? 'Each change is 3 to 300 characters.'
            : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title={existing ? `Edit release ${existing.version}` : 'New release note'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blocked !== null} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Version" isRequired>
            <Input value={version} disabled={Boolean(existing)} onChange={(event) => setVersion(event.target.value)} />
          </Field>
          <Field label="Released on">
            <Input type="date" value={releasedAt} onChange={(event) => setReleasedAt(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Checkbox label="Published" checked={isPublished} onChange={(event) => setPublished(event.target.checked)} />
          </div>
        </div>
        <Field label="Title" isRequired>
          <Input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Summary" isRequired>
          <Textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <Field key={group} label={group.charAt(0).toUpperCase() + group.slice(1)} hint="One change per line.">
              <Textarea
                rows={3}
                value={lines[group]}
                onChange={(event) => setLines({ ...lines, [group]: event.target.value })}
              />
            </Field>
          ))}
        </div>
        <Checkbox
          label="Changes how evidence should be read"
          hint="Tick if a teacher comparing before and after this release needs to know."
          checked={affects}
          onChange={(event) => setAffects(event.target.checked)}
        />
        {blocked ? <p className="text-sm text-ink-muted">{blocked}</p> : null}
      </div>
    </Modal>
  );
}
