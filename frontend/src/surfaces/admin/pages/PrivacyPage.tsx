import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconSafety,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import {
  buildSubjectExport,
  createDataRequest,
  downloadSubjectExport,
  fetchConsentList,
  fetchConsentRegister,
  fetchDataRequests,
  fetchDataRequestSummary,
  fetchEffectiveBasis,
  fetchProcessingPurposes,
  recordConsent,
  transitionDataRequest,
  updateDataRequest,
  withdrawConsent,
} from '@/privacy/privacy.api';
import type {
  ConsentRegisterEntry,
  ConsentRow,
  DataRequestKind,
  DataRequestRow,
  DataRequestStatus,
  LawfulBasis,
  SubjectExportManifest,
} from '@/privacy/privacy.types';
import { fetchUsers } from '@/users/users.api';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * Data rights and consent (blueprint 10).
 *
 * Blueprint 10 turns data rights into a workflow with an owner and a deadline.
 * The requests tab is that workflow: every request has a statutory clock, moves
 * only through the transitions the server allows, and closes with a record of
 * what was done. The consent tab is the register a school is asked for when a
 * parent or regulator asks "on what basis are you processing this?".
 */

const KIND_LABEL: Record<DataRequestKind, string> = {
  EXPORT: 'Copy of data',
  DELETION: 'Deletion',
  CORRECTION: 'Correction',
};

const STATUS_LABEL: Record<DataRequestStatus, string> = {
  REQUESTED: 'Requested',
  IN_REVIEW: 'In review',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE = {
  REQUESTED: 'warning',
  IN_REVIEW: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
} as const;

/** Mirrors `TRANSITIONS` in `privacy.service.ts`, so only legal moves are offered. */
const TRANSITIONS: Record<DataRequestStatus, DataRequestStatus[]> = {
  REQUESTED: ['IN_REVIEW', 'IN_PROGRESS', 'REJECTED', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'REJECTED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const BASIS_LABEL: Record<LawfulBasis, string> = {
  CONSENT: 'Consent',
  CONTRACT: 'Contract',
  LEGAL_OBLIGATION: 'Legal obligation',
  PUBLIC_TASK: 'Public task',
  LEGITIMATE_INTEREST: 'Legitimate interest',
  VITAL_INTERESTS: 'Vital interests',
};

type Tab = 'requests' | 'consent';

export function PrivacyPage() {
  useDocumentTitle('Privacy & consent');
  const canRequests = useCan('datarequest.read');
  const canConsent = useCan('consent.read');
  const [tab, setTab] = useState<Tab>(canRequests ? 'requests' : 'consent');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Privacy & consent"
        description="Requests from families about their data, and the basis the school relies on for each use of it."
      />
      {canRequests && canConsent ? (
        <div className="flex gap-2" role="tablist" aria-label="Privacy sections">
          {(
            [
              ['requests', 'Data requests'],
              ['consent', 'Consent register'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              role="tab"
              aria-selected={tab === id}
              size="sm"
              variant={tab === id ? 'primary' : 'outline'}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      {tab === 'requests' && canRequests ? <RequestsPanel /> : null}
      {tab === 'consent' && canConsent ? <ConsentPanel /> : null}
    </div>
  );
}

// ── Data requests ───────────────────────────────────────────────────────────

function RequestsPanel() {
  const queryClient = useQueryClient();
  const canWrite = useCan('datarequest.write');
  const [page, setPage] = useState(1);
  const [openOnly, setOpenOnly] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<DataRequestRow | null>(null);
  const [isCreating, setCreating] = useState(false);

  const params = { page, pageSize: 20, openOnly, overdueOnly };
  const query = useQuery({ queryKey: qk.privacy.requests(params), queryFn: () => fetchDataRequests(params) });
  const summary = useQuery({ queryKey: qk.privacy.summary, queryFn: fetchDataRequestSummary });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.privacy.all });

  const now = Date.now();
  const columns: Column<DataRequestRow>[] = [
    {
      key: 'subject',
      header: 'About',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink">{row.subjectUser.displayName}</span>
          <span className="text-xs text-ink-muted">Raised by {row.requestedBy.displayName}</span>
        </div>
      ),
    },
    { key: 'kind', header: 'Request', render: (row) => KIND_LABEL[row.kind] },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
    {
      key: 'due',
      header: 'Due',
      render: (row) => {
        const open = TRANSITIONS[row.status].length > 0;
        const overdue = open && new Date(row.dueAt).getTime() < now;
        return (
          <span className={overdue ? 'font-medium text-danger-strong' : 'text-ink'}>
            {formatDate(row.dueAt)}
            {overdue ? ' · overdue' : ''}
          </span>
        );
      },
    },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {summary.data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Open" value={summary.data.open} />
          <Tile label="Overdue" value={summary.data.overdue} emphasis={summary.data.overdue > 0} />
          <Tile label="Closed, last 90 days" value={summary.data.closedLast90Days} />
          <Tile
            label="Median days to close"
            value={summary.data.medianDaysToClose === null ? '—' : summary.data.medianDaysToClose}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <Checkbox
            label="Open requests only"
            checked={openOnly}
            onChange={(event) => {
              setOpenOnly(event.target.checked);
              setPage(1);
            }}
          />
          <Checkbox
            label="Overdue only"
            checked={overdueOnly}
            onChange={(event) => {
              setOverdueOnly(event.target.checked);
              setPage(1);
            }}
          />
        </div>
        {canWrite ? (
          <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Log a request
          </Button>
        ) : null}
      </div>

      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        <Card>
          <DataTable
            caption="Data requests"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<IconSafety className="h-8 w-8" aria-hidden />}
                title={openOnly || overdueOnly ? 'Nothing open' : 'No requests yet'}
                description="When a family asks for a copy of their data, a correction or deletion, log it here so it has an owner and a deadline."
              />
            }
          />
        </Card>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>

      {selected ? (
        <RequestModal
          request={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onChanged={(next) => {
            setSelected(next);
            refresh();
          }}
        />
      ) : null}
      {isCreating ? (
        <CreateRequestModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({ label, value, emphasis = false }: { label: string; value: number | string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'border-danger bg-danger-soft' : 'border-line bg-surface'}`}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function RequestModal({
  request,
  canWrite,
  onClose,
  onChanged,
}: {
  request: DataRequestRow;
  canWrite: boolean;
  onClose: () => void;
  onChanged: (next: DataRequestRow) => void;
}) {
  const next = TRANSITIONS[request.status];
  const [status, setStatus] = useState<DataRequestStatus | ''>('');
  const [note, setNote] = useState('');
  const [manifest, setManifest] = useState<SubjectExportManifest | null>(null);

  const transition = useMutation({
    mutationFn: () =>
      transitionDataRequest(request.id, {
        status,
        ...(status === 'REJECTED' ? { rejectionReason: note.trim() } : {}),
        ...(status === 'COMPLETED' ? { outcomeNote: note.trim() } : {}),
      }),
    onSuccess: (updated) => {
      setStatus('');
      setNote('');
      onChanged(updated);
    },
  });
  const build = useMutation({
    mutationFn: () => buildSubjectExport(request.id),
    onSuccess: (result) => {
      setManifest(result);
      onChanged({ ...request, exportStorageKey: result.storageKey });
    },
  });
  const download = useMutation({ mutationFn: () => downloadSubjectExport(request.id) });
  const [isEditing, setEditing] = useState(false);
  const [details, setDetails] = useState(request.details ?? '');
  const [dueAt, setDueAt] = useState(request.dueAt.slice(0, 10));
  const edit = useMutation({
    mutationFn: () =>
      updateDataRequest(request.id, {
        ...(details.trim() !== (request.details ?? '') ? { details: details.trim() } : {}),
        ...(dueAt !== request.dueAt.slice(0, 10) ? { dueAt: new Date(`${dueAt}T23:59:00`).toISOString() } : {}),
      }),
    onSuccess: (updated) => {
      setEditing(false);
      onChanged(updated);
    },
  });
  const editChanged = details.trim() !== (request.details ?? '') || dueAt !== request.dueAt.slice(0, 10);

  const needsNote = status === 'REJECTED' || status === 'COMPLETED';
  const isExport = request.kind === 'EXPORT';
  const isOpen = next.length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`${KIND_LABEL[request.kind]} — ${request.subjectUser.displayName}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          <span className="text-ink-muted">
            Raised {formatDate(request.createdAt)} by {request.requestedBy.displayName} · due {formatDate(request.dueAt)}
          </span>
        </div>
        {isEditing ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
            {edit.error ? <ErrorState error={edit.error} /> : null}
            <Field label="Details" hint="What the family asked for, in their words where possible.">
              <Textarea rows={3} maxLength={4000} value={details} onChange={(event) => setDetails(event.target.value)} />
            </Field>
            <Field label="Due" hint="Moving the deadline is recorded in the audit log with who moved it.">
              <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" isLoading={edit.isPending} disabled={!editChanged || !dueAt} onClick={() => edit.mutate()}>
                Save
              </Button>
              <Button size="sm" variant="outline" disabled={edit.isPending} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            {request.details ? <p className="min-w-0 flex-1 text-ink">{request.details}</p> : <span />}
            {canWrite && isOpen ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit details or due date
              </Button>
            ) : null}
          </div>
        )}
        {request.outcomeNote ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-ink">
            <span className="font-medium">Outcome: </span>
            {request.outcomeNote}
          </p>
        ) : null}
        {request.rejectionReason ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-ink">
            <span className="font-medium">Rejected: </span>
            {request.rejectionReason}
          </p>
        ) : null}

        {isExport ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <p className="font-medium text-ink">The file</p>
            {build.error ? <ErrorState error={build.error} /> : null}
            {download.error ? <ErrorState error={download.error} /> : null}
            <p className="text-ink-muted">
              Build the file, read what it contains and what was withheld, then download it to send to the family.
            </p>
            <div className="flex flex-wrap gap-2">
              {canWrite && isOpen ? (
                <Button size="sm" variant="outline" isLoading={build.isPending} onClick={() => build.mutate()}>
                  {request.exportStorageKey ? 'Rebuild the file' : 'Build the file'}
                </Button>
              ) : null}
              {request.exportStorageKey ? (
                <Button size="sm" isLoading={download.isPending} onClick={() => download.mutate()}>
                  Download
                </Button>
              ) : null}
            </div>
            {manifest ? (
              <div className="flex flex-col gap-2">
                <p className="text-ink">Contains:</p>
                <ul className="list-disc pl-5 text-ink-muted">
                  {manifest.sections.map((entry) => (
                    <li key={entry.key}>
                      {entry.label}: {entry.rowCount}
                      {entry.truncated ? ' (capped — more exist)' : ''}
                    </li>
                  ))}
                </ul>
                {manifest.withheld.length > 0 ? (
                  <>
                    <p className="font-medium text-ink">Withheld:</p>
                    <ul className="list-disc pl-5 text-ink-muted">
                      {manifest.withheld.map((entry) => (
                        <li key={entry.key}>
                          {entry.label} ({entry.rowCount}) — {entry.reason}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {canWrite && isOpen ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-3">
            {transition.error ? <ErrorState error={transition.error} /> : null}
            <Field label="Move to">
              <Select
                value={status}
                placeholder="Choose the next step"
                onChange={(event) => setStatus(event.target.value as DataRequestStatus)}
                options={next.map((value) => ({ value, label: STATUS_LABEL[value] }))}
              />
            </Field>
            {needsNote ? (
              <Field
                label={status === 'REJECTED' ? 'Why it is refused' : 'What was done'}
                isRequired
                hint={
                  status === 'REJECTED'
                    ? 'A reason the school could stand behind if the family or regulator asks.'
                    : 'What was sent, deleted or corrected — and anything lawfully kept.'
                }
              >
                <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
            ) : null}
            <div className="flex justify-end">
              <Button
                size="sm"
                isLoading={transition.isPending}
                disabled={!status || (needsNote && !note.trim())}
                onClick={() => transition.mutate()}
              >
                Update request
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function CreateRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [subjectUserId, setSubjectUserId] = useState('');
  const [kind, setKind] = useState<DataRequestKind>('EXPORT');
  const [details, setDetails] = useState('');
  const [dueAt, setDueAt] = useState('');

  const people = useQuery({
    queryKey: qk.users.list({ search: search.trim(), pageSize: 20 }),
    queryFn: () => fetchUsers({ search: search.trim(), pageSize: 20 }),
    enabled: search.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createDataRequest({
        subjectUserId,
        kind,
        ...(details.trim() ? { details: details.trim() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Log a data request"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!subjectUserId} onClick={() => mutation.mutate()}>
            Log request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Who it is about" hint="Search by name, at least two letters.">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
        </Field>
        {people.error ? <ErrorState error={people.error} /> : null}
        {search.trim().length >= 2 ? (
          <Field label="Person" isRequired>
            <Select
              value={subjectUserId}
              placeholder={people.isPending ? 'Searching…' : (people.data?.items.length ?? 0) === 0 ? 'Nobody found' : 'Choose'}
              onChange={(event) => setSubjectUserId(event.target.value)}
              options={(people.data?.items ?? []).map((person) => ({
                value: person.id,
                label: `${person.displayName} (${person.primaryRole.toLowerCase().replace('_', ' ')})`,
              }))}
            />
          </Field>
        ) : null}
        <Field label="What they asked for">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as DataRequestKind)}
            options={(Object.keys(KIND_LABEL) as DataRequestKind[]).map((value) => ({ value, label: KIND_LABEL[value] }))}
          />
        </Field>
        <Field label="Details" hint="In the requester's words where possible.">
          <Textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} />
        </Field>
        <Field label="Due by" hint="The statutory deadline. Left empty, it is set 30 days from today.">
          <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Consent register ────────────────────────────────────────────────────────

function ConsentPanel() {
  const queryClient = useQueryClient();
  const canWrite = useCan('consent.write');
  const [recording, setRecording] = useState<ConsentRegisterEntry | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const register = useQuery({ queryKey: qk.privacy.register, queryFn: fetchConsentRegister });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.privacy.all });

  return (
    <div className="flex flex-col gap-4">
      <QueryBoundary isLoading={register.isPending} error={register.error} onRetry={() => void register.refetch()}>
        <div className="flex flex-col gap-3">
          {(register.data ?? []).map((entry) => (
            <Card key={entry.purpose}>
              <CardHeader
                title={entry.label}
                description={entry.description}
                actions={
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(entry.purpose)}>
                      Records
                    </Button>
                    {canWrite ? (
                      <Button size="sm" variant="outline" onClick={() => setRecording(entry)}>
                        Record basis
                      </Button>
                    ) : null}
                  </div>
                }
              />
              <CardBody className="flex flex-wrap items-center gap-2 text-sm">
                {entry.recorded.basis ? (
                  <>
                    <Badge tone={entry.recorded.granted ? 'success' : 'danger'}>
                      {entry.recorded.granted ? 'Relied on' : 'Refused'}
                    </Badge>
                    <span className="text-ink">{BASIS_LABEL[entry.recorded.basis]}</span>
                    <span className="text-ink-muted">since {formatDate(entry.recorded.recordedAt)}</span>
                  </>
                ) : (
                  <>
                    <Badge tone="warning">Nothing recorded</Badge>
                    <span className="text-ink-muted">Suggested: {BASIS_LABEL[entry.suggestedBasis]}</span>
                  </>
                )}
                {entry.optional ? <Badge tone="neutral">Optional use</Badge> : null}
                {entry.learnerOverrides > 0 ? (
                  <span className="text-ink-muted">
                    · {entry.learnerOverrides} learner-level record{entry.learnerOverrides === 1 ? '' : 's'}
                  </span>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      </QueryBoundary>

      <EffectiveBasisChecker />

      {recording ? (
        <RecordConsentModal
          entry={recording}
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null);
            refresh();
          }}
        />
      ) : null}
      {historyFor ? (
        <ConsentRecordsModal purpose={historyFor} canWrite={canWrite} onClose={() => setHistoryFor(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}

function RecordConsentModal({
  entry,
  onClose,
  onDone,
}: {
  entry: ConsentRegisterEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const [basis, setBasis] = useState<LawfulBasis>(entry.recorded.basis ?? entry.suggestedBasis);
  const [granted, setGranted] = useState(true);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [policyVersion, setPolicyVersion] = useState('');
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');

  const people = useQuery({
    queryKey: qk.users.list({ search: search.trim(), pageSize: 20 }),
    queryFn: () => fetchUsers({ search: search.trim(), pageSize: 20 }),
    enabled: search.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () =>
      recordConsent({
        purpose: entry.purpose,
        lawfulBasis: basis,
        granted,
        ...(userId ? { userId } : {}),
        ...(evidenceNote.trim() ? { evidenceNote: evidenceNote.trim() } : {}),
        ...(policyVersion.trim() ? { policyVersion: policyVersion.trim() } : {}),
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Record basis — ${entry.label}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Lawful basis">
          <Select
            value={basis}
            onChange={(event) => setBasis(event.target.value as LawfulBasis)}
            options={(Object.keys(BASIS_LABEL) as LawfulBasis[]).map((value) => ({ value, label: BASIS_LABEL[value] }))}
          />
        </Field>
        <Field label="Decision">
          <Select
            value={granted ? 'yes' : 'no'}
            onChange={(event) => setGranted(event.target.value === 'yes')}
            options={[
              { value: 'yes', label: 'Relied on / consent given' },
              { value: 'no', label: 'Refused / not relied on' },
            ]}
          />
        </Field>
        <Field label="For one learner only" hint="Leave empty for the whole school. Search by name.">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
        </Field>
        {search.trim().length >= 2 ? (
          <Select
            aria-label="Learner"
            value={userId}
            placeholder={people.isPending ? 'Searching…' : 'Whole school'}
            onChange={(event) => setUserId(event.target.value)}
            options={(people.data?.items ?? []).map((person) => ({ value: person.id, label: person.displayName }))}
          />
        ) : null}
        <Field label="How the school knows" hint="A signed form, a policy acceptance, a meeting note.">
          <Textarea rows={2} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} />
        </Field>
        <Field label="Policy version">
          <Input value={policyVersion} onChange={(event) => setPolicyVersion(event.target.value)} placeholder="2026-09" />
        </Field>
      </div>
    </Modal>
  );
}

function ConsentRecordsModal({
  purpose,
  canWrite,
  onClose,
  onChanged,
}: {
  purpose: string;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [activeOnly, setActiveOnly] = useState(true);
  const params = { purpose, activeOnly, pageSize: 50 };
  const query = useQuery({ queryKey: qk.privacy.consent(params), queryFn: () => fetchConsentList(params) });
  const withdraw = useMutation({
    mutationFn: (row: ConsentRow) => withdrawConsent(row.id, {}),
    onSuccess: () => {
      void query.refetch();
      onChanged();
    },
  });
  const rows = query.data?.items ?? [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Records — ${purpose}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Checkbox label="Current records only" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
        {withdraw.error ? <ErrorState error={withdraw.error} /> : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No records" />}
        >
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-ink">
                    {row.userId ? 'One learner' : 'Whole school'} · {BASIS_LABEL[row.lawfulBasis]} ·{' '}
                    {row.granted ? 'relied on' : 'refused'}
                  </span>
                  <span className="text-xs text-ink-muted">
                    From {formatDate(row.effectiveFrom)}
                    {row.withdrawnAt ? ` · withdrawn ${formatDate(row.withdrawnAt)}` : ''}
                    {row.evidenceNote ? ` · ${row.evidenceNote}` : ''}
                  </span>
                </div>
                {canWrite && !row.withdrawnAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={withdraw.isPending && withdraw.variables?.id === row.id}
                    onClick={() => withdraw.mutate(row)}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </div>
    </Modal>
  );
}

/**
 * "What are we relying on for this, for this child, right now?" A learner-level
 * record wins over the school's; no record at all is reported as such, which
 * is different from a recorded refusal.
 */
function EffectiveBasisChecker() {
  const purposes = useQuery({ queryKey: qk.privacy.purposes, queryFn: fetchProcessingPurposes });
  const [purpose, setPurpose] = useState('');
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');

  const people = useQuery({
    queryKey: qk.users.list({ search: search.trim(), pageSize: 20 }),
    queryFn: () => fetchUsers({ search: search.trim(), pageSize: 20 }),
    enabled: search.trim().length >= 2,
  });
  const result = useQuery({
    queryKey: qk.privacy.effective(purpose, userId),
    queryFn: () => fetchEffectiveBasis(purpose, userId || undefined),
    enabled: purpose.length > 0,
  });

  return (
    <Card>
      <CardHeader title="Check a basis" description="What the school is relying on for one use of data, for one learner, today." />
      <CardBody className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Use of data">
            <Select
              value={purpose}
              placeholder="Choose"
              onChange={(event) => setPurpose(event.target.value)}
              options={(purposes.data ?? []).map((entry) => ({ value: entry.purpose, label: entry.label }))}
            />
          </Field>
          <Field label="Learner" hint="Optional. Search by name.">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
          </Field>
        </div>
        {search.trim().length >= 2 ? (
          <Select
            aria-label="Learner"
            value={userId}
            placeholder="School level"
            onChange={(event) => setUserId(event.target.value)}
            options={(people.data?.items ?? []).map((person) => ({ value: person.id, label: person.displayName }))}
          />
        ) : null}
        {result.error ? <ErrorState error={result.error} /> : null}
        {result.data ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-sm text-ink" role="status">
            {result.data.level === 'NONE'
              ? 'Nothing is recorded for this use. That is not a refusal — the school has not decided.'
              : `${result.data.granted ? 'Relied on' : 'Refused'}: ${BASIS_LABEL[result.data.basis as LawfulBasis]}, from a ${
                  result.data.level === 'LEARNER' ? 'record for this learner' : 'school-wide record'
                } dated ${formatDate(result.data.recordedAt)}.`}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
