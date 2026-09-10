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
  EmptyState,
  Field,
  IconDownload,
  Input,
  Modal,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { formatDateTime } from '@/lib/format';
import {
  archiveReportDefinition,
  createReportDefinition,
  downloadReportExport,
  fetchReportCatalogue,
  fetchReportExports,
  updateReportDefinition,
} from '@/reporting/reporting.api';
import type { ReportDefinition, ReportExportJob } from '@/reporting/reporting.types';
import { saveBlob } from '@/api';
import { qk } from '@/query/keys';

/**
 * Saved reports and export history (blueprint 04).
 *
 * A school's own report is a standard report with its own name and — the part
 * blueprint 04 insists on — its own statement of what it measures and what it
 * does not prove. Both notes need a real sentence (40 characters); the form
 * counts down to that rather than failing on submit.
 */

const AUDIENCES = [
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'SCHOOL_ADMIN', label: 'School leaders' },
  { value: 'ORG_ADMIN', label: 'Trust or district' },
  { value: 'PARENT', label: 'Parents' },
];

const NOTE_MIN = 40;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function baseReportOf(definition: ReportDefinition | undefined): string {
  const config = definition?.configuration;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const base = (config as Record<string, unknown>).baseReport;
    if (typeof base === 'string') return base;
  }
  return '';
}

export function ReportDefinitionModal({
  existing,
  onClose,
}: {
  existing?: ReportDefinition;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const catalogue = useQuery({ queryKey: qk.reports.catalogue, queryFn: fetchReportCatalogue });
  const [baseReport, setBaseReport] = useState(baseReportOf(existing));
  const [name, setName] = useState(existing?.name ?? '');
  const [key, setKey] = useState(existing?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(Boolean(existing));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [audience, setAudience] = useState<string[]>(existing?.audience ?? ['TEACHER', 'SCHOOL_ADMIN']);
  const [measureNotes, setMeasureNotes] = useState(existing?.measureNotes ?? '');
  const [limitationNotes, setLimitationNotes] = useState(existing?.limitationNotes ?? '');
  const [evidence, setEvidence] = useState((existing?.evidenceSources ?? []).join(', '));
  const [isActive, setActive] = useState(existing?.isActive ?? true);

  const base = catalogue.data?.find((entry) => entry.key === baseReport);

  const chooseBase = (value: string) => {
    setBaseReport(value);
    const entry = catalogue.data?.find((row) => row.key === value);
    if (!entry || existing) return;
    if (!measureNotes) setMeasureNotes(entry.measureNotes);
    if (!limitationNotes) setLimitationNotes(entry.limitationNotes);
    if (!evidence) setEvidence(entry.evidenceSources.join(', '));
  };

  const evidenceList = evidence
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> => {
      const shared = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        scopeLevel: base?.scopeLevel ?? existing?.scopeLevel ?? 'CLASS',
        audience,
        measureNotes: measureNotes.trim(),
        limitationNotes: limitationNotes.trim(),
        evidenceSources: evidenceList,
        configuration: { baseReport },
      };
      return existing
        ? updateReportDefinition(existing.id, { ...shared, isActive })
        : createReportDefinition({ ...shared, key });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.reports.all });
      onClose();
    },
  });

  const blockedReason = !baseReport
    ? 'Choose the standard report it is built on.'
    : name.trim().length < 3
      ? 'Name it — at least three characters.'
      : !existing && !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(key)
        ? 'The key uses lowercase letters, numbers, hyphens or underscores.'
        : audience.length === 0
          ? 'Say who it is for.'
          : measureNotes.trim().length < NOTE_MIN
            ? `Say what it measures — ${NOTE_MIN - measureNotes.trim().length} more characters.`
            : limitationNotes.trim().length < NOTE_MIN
              ? `Say what it does not prove — ${NOTE_MIN - limitationNotes.trim().length} more characters.`
              : evidenceList.length === 0
                ? 'Name at least one evidence source.'
                : evidenceList.some((part) => part.length < 2 || part.length > 60)
                  ? 'Each evidence source is 2 to 60 characters.'
                  : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title={existing ? 'Edit report' : 'New report'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            {existing ? 'Save' : 'Create report'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        {catalogue.error ? <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} /> : null}
        <Field label="Built on" isRequired hint="The standard report whose figures this one uses.">
          <Select
            value={baseReport}
            placeholder={catalogue.isPending ? 'Loading…' : 'Choose a standard report'}
            onChange={(event) => chooseBase(event.target.value)}
            options={(catalogue.data ?? []).map((entry) => ({ value: entry.key, label: entry.name }))}
          />
        </Field>
        {base ? (
          <p className="text-sm text-ink-muted">
            {base.description} Runs at {base.scopeLevel.toLowerCase()} level.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" isRequired>
            <Input
              value={name}
              maxLength={180}
              onChange={(event) => {
                setName(event.target.value);
                if (!keyTouched) setKey(slug(event.target.value));
              }}
            />
          </Field>
          <Field label="Key" hint={existing ? 'Fixed once created, so exports stay traceable.' : 'Used in exports.'}>
            <Input
              value={key}
              disabled={Boolean(existing)}
              onChange={(event) => {
                setKeyTouched(true);
                setKey(event.target.value);
              }}
            />
          </Field>
        </div>
        <Field label="Description" hint="Optional.">
          <Textarea rows={2} maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Written for</legend>
          <div className="flex flex-wrap gap-4">
            {AUDIENCES.map((option) => (
              <Checkbox
                key={option.value}
                label={option.label}
                checked={audience.includes(option.value)}
                onChange={(event) =>
                  setAudience((current) =>
                    event.target.checked ? [...current, option.value] : current.filter((v) => v !== option.value),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Field label="What it measures" isRequired hint={`At least ${NOTE_MIN} characters.`}>
          <Textarea rows={3} maxLength={1000} value={measureNotes} onChange={(event) => setMeasureNotes(event.target.value)} />
        </Field>
        <Field label="What it does not prove" isRequired hint={`At least ${NOTE_MIN} characters.`}>
          <Textarea
            rows={3}
            maxLength={1000}
            value={limitationNotes}
            onChange={(event) => setLimitationNotes(event.target.value)}
          />
        </Field>
        <Field label="Evidence sources" isRequired hint="Comma separated, for example ProgressRecord, AssignmentAttempt.">
          <Input value={evidence} onChange={(event) => setEvidence(event.target.value)} />
        </Field>
        {existing ? (
          <Checkbox
            label="Available to run"
            hint="Clear to hide it from the list without archiving it."
            checked={isActive}
            onChange={(event) => setActive(event.target.checked)}
          />
        ) : null}
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

export function ArchiveReportModal({ definition, onClose }: { definition: ReportDefinition; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveReportDefinition(definition.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.reports.all });
      onClose();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Archive “${definition.name}”?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Keep it
          </Button>
          <Button variant="danger" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Archive
          </Button>
        </>
      }
    >
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <p className="text-ink">
        It leaves the list and can no longer be run. Exports made from it stay, and can still be traced back to it.
      </p>
    </Modal>
  );
}

const EXPORT_TONE: Record<ReportExportJob['status'], BadgeTone> = {
  QUEUED: 'info',
  RUNNING: 'info',
  READY: 'success',
  FAILED: 'danger',
  EXPIRED: 'neutral',
};

const EXPORT_LABEL: Record<ReportExportJob['status'], string> = {
  QUEUED: 'Waiting',
  RUNNING: 'Building',
  READY: 'Ready',
  FAILED: 'Failed',
  EXPIRED: 'Expired',
};

/** Recent exports, so a file that took a while can be fetched later. */
export function ExportsCard({ definitions, canDownload }: { definitions: ReportDefinition[]; canDownload: boolean }) {
  const [page, setPage] = useState(1);
  const [mineOnly, setMineOnly] = useState(true);
  const params = { page, pageSize: 10, mineOnly };
  const query = useQuery({
    queryKey: qk.reports.exportList(params),
    queryFn: () => fetchReportExports(params),
    refetchInterval: (q) =>
      q.state.data?.items.some((row) => row.status === 'QUEUED' || row.status === 'RUNNING') ? 3000 : false,
  });
  const download = useMutation({
    mutationFn: async (job: ReportExportJob) => {
      const { blob, fileName } = await downloadReportExport(job.id);
      saveBlob(blob, job.fileName ?? fileName);
    },
  });
  const nameOf = (id: string) => definitions.find((d) => d.id === id)?.name ?? 'Report';
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Exports"
        description="Files are kept for a limited time, then expire."
        actions={
          <Checkbox
            label="Only mine"
            checked={mineOnly}
            onChange={(event) => {
              setMineOnly(event.target.checked);
              setPage(1);
            }}
          />
        }
      />
      <CardBody>
        {download.error ? <ErrorState error={download.error} /> : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No exports yet" description="Export a report and it appears here." />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {nameOf(job.definitionId)} <span className="text-ink-muted">· {job.format}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(job.requestedAt)}
                    {job.rowCount !== null ? ` · ${job.rowCount} rows` : ''}
                    {job.expiresAt && job.status === 'READY' ? ` · until ${formatDateTime(job.expiresAt)}` : ''}
                    {job.failureReason ? ` · ${job.failureReason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={EXPORT_TONE[job.status]}>{EXPORT_LABEL[job.status]}</Badge>
                  {canDownload && job.status === 'READY' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      leadingIcon={<IconDownload aria-hidden className="h-4 w-4" />}
                      isLoading={download.isPending && download.variables?.id === job.id}
                      onClick={() => download.mutate(job)}
                    >
                      Download
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}
