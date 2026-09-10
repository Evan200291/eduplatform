import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconOwnership,
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
import { fetchActivities, fetchLessons, fetchOwnershipRecords, fetchPublications, setOwnershipRecord } from '@/content/content.api';
import { fetchPrograms, fetchTopics, fetchUnits } from '@/curriculum/curriculum.api';
import type {
  ContentOwnership,
  ContentStatus,
  ContentTargetType,
  OwnershipRecord,
  PublicationRecord,
} from '@/content/content.types';
import { CONTENT_STATUS_TONE } from '@/content/content-lifecycle';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * Content ownership and publication history (blueprint 05 and 12, UX brief N3).
 *
 * Two questions a school gets asked and cannot otherwise answer: "who owns this
 * material, and may we share it?" and "what exactly was live, and when?". The
 * first is the ownership register; the second is the publication log, which the
 * server writes every time a lesson or activity is published.
 */

const OWNERSHIP_LABEL: Record<ContentOwnership, string> = {
  MIDAS_ORIGINAL: 'Midas original',
  SCHOOL_OWNED: 'School owned',
  SCHOOL_LICENSED: 'Licensed to the school',
  THIRD_PARTY_LICENSED: 'Third-party licence',
  CO_CREATED: 'Co-created',
};

const OWNERSHIP_HINT: Record<ContentOwnership, string> = {
  MIDAS_ORIGINAL: 'Written by Midas and supplied with the platform.',
  SCHOOL_OWNED: 'Written by the school’s own staff.',
  SCHOOL_LICENSED: 'Bought or licensed by the school from a publisher.',
  THIRD_PARTY_LICENSED: 'Used under someone else’s licence terms.',
  CO_CREATED: 'Made jointly by the school and Midas.',
};

/** Licensed categories are the ones where a holder and dates matter. */
const LICENSED: ContentOwnership[] = ['SCHOOL_LICENSED', 'THIRD_PARTY_LICENSED'];

const TARGET_LABEL: Record<ContentTargetType, string> = {
  CURRICULUM_PROGRAM: 'Programme',
  UNIT: 'Unit',
  TOPIC: 'Topic',
  LESSON: 'Lesson',
  ACTIVITY: 'Activity',
  MEDIA: 'Media file',
};

/** Media ownership is set when the file is uploaded, so it is not offered here. */
const RECORDABLE: ContentTargetType[] = ['CURRICULUM_PROGRAM', 'UNIT', 'TOPIC', 'LESSON', 'ACTIVITY'];

type TargetIndex = Record<ContentTargetType, { id: string; name: string }[]>;

/**
 * Names for every recordable target, so the register can say "Fractions" rather
 * than an id. One fetch per type at the page-size ceiling; a school with more
 * than that in one type will see ids for the rest, which is honest rather than
 * wrong.
 */
function useTargetIndex() {
  return useQuery({
    queryKey: qk.contentRights.targets,
    queryFn: async (): Promise<TargetIndex> => {
      const [programs, units, topics, lessons, activities] = await Promise.all([
        fetchPrograms({ pageSize: 100 }),
        fetchUnits({ pageSize: 100 }),
        fetchTopics({ pageSize: 100 }),
        fetchLessons({ pageSize: 100 }),
        fetchActivities({ pageSize: 100 }),
      ]);
      return {
        CURRICULUM_PROGRAM: programs.items.map((row) => ({ id: row.id, name: row.name })),
        UNIT: units.items.map((row) => ({ id: row.id, name: row.name })),
        TOPIC: topics.items.map((row) => ({ id: row.id, name: row.name })),
        LESSON: lessons.items.map((row) => ({ id: row.id, name: row.title })),
        ACTIVITY: activities.items.map((row) => ({ id: row.id, name: row.title })),
        MEDIA: [],
      };
    },
    staleTime: 60_000,
  });
}

type Tab = 'ownership' | 'publications';

export function ContentRightsPage() {
  useDocumentTitle('Content ownership');
  const [tab, setTab] = useState<Tab>('ownership');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Content ownership"
        description="Who owns each piece of material, on what terms, and a record of every version that went live."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Content ownership sections">
        {(
          [
            { id: 'ownership', label: 'Ownership & licences' },
            { id: 'publications', label: 'Publication history' },
          ] as { id: Tab; label: string }[]
        ).map((entry) => (
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

      {tab === 'ownership' ? <OwnershipPanel /> : <PublicationsPanel />}
    </div>
  );
}

// ── Ownership register ──────────────────────────────────────────────────────

function OwnershipPanel() {
  const canWrite = useCan('content.ownership.write');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState<ContentTargetType | ''>('');
  const [ownership, setOwnership] = useState<ContentOwnership | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<OwnershipRecord | 'new' | null>(null);

  const params = {
    page,
    pageSize: 20,
    ...(targetType ? { targetType } : {}),
    ...(ownership ? { ownership } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const query = useQuery({
    queryKey: qk.contentRights.ownership(params),
    queryFn: () => fetchOwnershipRecords(params),
  });
  const targets = useTargetIndex();

  const nameOf = (row: OwnershipRecord) =>
    targets.data?.[row.targetType]?.find((entry) => entry.id === row.targetId)?.name ?? null;

  const today = new Date();
  const columns: Column<OwnershipRecord>[] = [
    {
      key: 'target',
      header: 'Material',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink">
            {nameOf(row) ?? (
              <span className="text-ink-muted">
                {row.targetType === 'MEDIA' ? 'Uploaded file' : 'Item'} {row.targetId}
              </span>
            )}
          </span>
          <span className="text-xs text-ink-muted">{TARGET_LABEL[row.targetType]}</span>
        </div>
      ),
    },
    {
      key: 'ownership',
      header: 'Ownership',
      render: (row) => <Badge tone={LICENSED.includes(row.ownership) ? 'info' : 'neutral'}>{OWNERSHIP_LABEL[row.ownership]}</Badge>,
    },
    {
      key: 'licence',
      header: 'Licence',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (row) => {
        const expired = row.licenseEndsAt !== null && new Date(row.licenseEndsAt) < today;
        return row.licenseHolder || row.licenseEndsAt ? (
          <div className="flex flex-col text-sm">
            {row.licenseHolder ? <span>{row.licenseHolder}</span> : null}
            {row.licenseEndsAt ? (
              <span className={expired ? 'font-medium text-danger-strong' : 'text-ink-muted'}>
                {expired ? 'Expired ' : 'Until '}
                {formatDate(row.licenseEndsAt)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-ink-muted">—</span>
        );
      },
    },
    {
      key: 'share',
      header: 'May share outside school',
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (row) => (row.canRedistribute ? 'Yes' : 'No'),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            render: (row: OwnershipRecord) => (
              <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Kind of material">
            <Select
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as ContentTargetType | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'All kinds' },
                ...(Object.keys(TARGET_LABEL) as ContentTargetType[]).map((value) => ({ value, label: TARGET_LABEL[value] })),
              ]}
            />
          </Field>
          <Field label="Ownership">
            <Select
              value={ownership}
              onChange={(event) => {
                setOwnership(event.target.value as ContentOwnership | '');
                setPage(1);
              }}
              options={[
                { value: '', label: 'Any ownership' },
                ...(Object.keys(OWNERSHIP_LABEL) as ContentOwnership[]).map((value) => ({ value, label: OWNERSHIP_LABEL[value] })),
              ]}
            />
          </Field>
          <Field label="Licence holder or reference">
            <Input
              value={search}
              placeholder="Search"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          {canWrite ? (
            <div className="sm:ml-auto">
              <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setEditing('new')}>
                Record ownership
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        <Card>
          <DataTable
            caption="Ownership register"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<IconOwnership className="h-8 w-8" aria-hidden />}
                title="Nothing recorded yet"
                description={
                  targetType || ownership || search
                    ? 'No records match these filters.'
                    : 'Record who owns a programme, lesson or activity — especially anything licensed, so its terms are on file.'
                }
              />
            }
          />
        </Card>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>

      {editing ? (
        <OwnershipModal
          existing={editing === 'new' ? null : editing}
          targets={targets.data}
          targetsLoading={targets.isPending}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: qk.contentRights.all });
          }}
        />
      ) : null}
    </div>
  );
}

const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : '');

function OwnershipModal({
  existing,
  targets,
  targetsLoading,
  onClose,
  onDone,
}: {
  existing: OwnershipRecord | null;
  targets: TargetIndex | undefined;
  targetsLoading: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [targetType, setTargetType] = useState<ContentTargetType>(existing?.targetType ?? 'LESSON');
  const [targetId, setTargetId] = useState(existing?.targetId ?? '');
  const [ownership, setOwnership] = useState<ContentOwnership>(existing?.ownership ?? 'SCHOOL_OWNED');
  const [licenseHolder, setLicenseHolder] = useState(existing?.licenseHolder ?? '');
  const [licenseReference, setLicenseReference] = useState(existing?.licenseReference ?? '');
  const [startsAt, setStartsAt] = useState(toDateInput(existing?.licenseStartsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDateInput(existing?.licenseEndsAt ?? null));
  const [canRedistribute, setCanRedistribute] = useState(existing?.canRedistribute ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const isLicensed = LICENSED.includes(ownership);
  const options = useMemo(
    () => (targets?.[targetType] ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
    [targets, targetType],
  );

  // Mirrors the server's own check, so the reason appears beside the button.
  const blockedReason = !targetId
    ? 'Choose the material this record is about.'
    : startsAt && endsAt && endsAt <= startsAt
      ? 'The licence end date must be after its start date.'
      : null;

  const mutation = useMutation({
    mutationFn: () =>
      setOwnershipRecord({
        targetType,
        targetId,
        ownership,
        canRedistribute,
        licenseHolder: licenseHolder.trim() || undefined,
        licenseReference: licenseReference.trim() || undefined,
        licenseStartsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        licenseEndsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit ownership record' : 'Record ownership'}
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            Save record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kind of material" isRequired>
            <Select
              value={targetType}
              disabled={existing !== null}
              onChange={(event) => {
                setTargetType(event.target.value as ContentTargetType);
                setTargetId('');
              }}
              options={RECORDABLE.map((value) => ({ value, label: TARGET_LABEL[value] }))}
            />
          </Field>
          <Field
            label={TARGET_LABEL[targetType]}
            isRequired
            hint={existing ? 'To record a different item, start a new record.' : 'One record per item; saving again replaces it.'}
          >
            <Select
              value={targetId}
              disabled={existing !== null}
              placeholder={targetsLoading ? 'Loading…' : options.length === 0 ? 'None yet' : 'Choose one'}
              onChange={(event) => setTargetId(event.target.value)}
              options={
                existing && !options.some((option) => option.value === existing.targetId)
                  ? [{ value: existing.targetId, label: existing.targetId }, ...options]
                  : options
              }
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">Ownership</legend>
          {(Object.keys(OWNERSHIP_LABEL) as ContentOwnership[]).map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                ownership === value ? 'border-primary bg-primary-soft' : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="ownership"
                value={value}
                checked={ownership === value}
                onChange={() => setOwnership(value)}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-ink">{OWNERSHIP_LABEL[value]}</span>
                <span className="text-xs text-ink-muted">{OWNERSHIP_HINT[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {isLicensed ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Licence holder">
              <Input value={licenseHolder} onChange={(event) => setLicenseHolder(event.target.value)} />
            </Field>
            <Field label="Licence reference" hint="Contract or order number.">
              <Input value={licenseReference} onChange={(event) => setLicenseReference(event.target.value)} />
            </Field>
            <Field label="Licence starts">
              <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </Field>
            <Field label="Licence ends" hint="Leave empty if it does not expire.">
              <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
            </Field>
          </div>
        ) : null}

        <Checkbox
          label="The school may share this outside its own account"
          hint="Leave off unless the terms allow it."
          checked={canRedistribute}
          onChange={(event) => setCanRedistribute(event.target.checked)}
        />

        <Field label="Notes">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>

        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

// ── Publication history ─────────────────────────────────────────────────────

const PUBLICATION_STATUSES: ContentStatus[] = ['APPROVED', 'PUBLISHED', 'REVISED', 'ARCHIVED'];

function PublicationsPanel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ContentStatus | ''>('');

  const params = { page, pageSize: 20, ...(status ? { status } : {}) };
  const query = useQuery({
    queryKey: qk.contentRights.publications(params),
    queryFn: () => fetchPublications(params),
  });

  const columns: Column<PublicationRecord>[] = [
    {
      key: 'item',
      header: 'Material',
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink">{row.lesson?.title ?? row.activity?.title ?? 'Removed item'}</span>
          <span className="text-xs text-ink-muted">{row.lesson ? 'Lesson' : 'Activity'}</span>
        </div>
      ),
    },
    { key: 'version', header: 'Version', isNumeric: true, render: (row) => `v${row.version}` },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={CONTENT_STATUS_TONE[row.status]}>{row.status.charAt(0) + row.status.slice(1).toLowerCase().replace('_', ' ')}</Badge>,
    },
    {
      key: 'change',
      header: 'What changed',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (row) => row.changeSummary ?? <span className="text-ink-muted">No summary given</span>,
    },
    {
      key: 'live',
      header: 'Live',
      render: (row) => (
        <span className="text-sm">
          {formatDate(row.publishedAt ?? row.effectiveFrom)}
          {row.retiredAt ? ` – ${formatDate(row.retiredAt)}` : ' onward'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | '');
              setPage(1);
            }}
            options={[
              { value: '', label: 'Any status' },
              ...PUBLICATION_STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() })),
            ]}
          />
        </Field>
      </div>
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        <Card>
          <DataTable
            caption="Publication history"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<IconOwnership className="h-8 w-8" aria-hidden />}
                title="Nothing published yet"
                description="Each time a lesson or activity is published, the version and its change summary are recorded here."
              />
            }
          />
        </Card>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>
    </div>
  );
}
