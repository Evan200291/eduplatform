import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  type Column,
  DataTable,
  EmptyState,
  Field,
  IconModeration,
  IconSafety,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import { useCan } from '@/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/api';
import { fetchContentReports, resolveContentReport } from '@/content/content.api';
import type {
  ContentReportReason,
  ContentReportRow,
  ModerationDecision,
} from '@/content/content.types';

/**
 * The moderation queue (blueprint §05 safety, PRD v2.5).
 *
 * Reported content stays hidden from learners until an authorised reviewer
 * decides, so this screen is the other half of a rule the platform already
 * enforces server-side — until it existed, a report could be filed and never
 * acted on. Settings has advertised a "moderation required" toggle since launch
 * with nothing behind it; this is what it points at.
 *
 * Pending reports sort first because the queue's whole purpose is the backlog,
 * not the archive. The API orders by decision then recency, so the default view
 * already opens on the work.
 */

const DECISION_TONE: Record<ModerationDecision, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  ESCALATED: 'danger',
  REMOVED: 'danger',
};

/** Reviewer-facing wording. The enum names are blunt; these are what a person means. */
const DECISION_LABEL: Record<ModerationDecision, string> = {
  PENDING: 'Awaiting review',
  APPROVED: 'Keep visible',
  REJECTED: 'Dismissed',
  ESCALATED: 'Escalated',
  REMOVED: 'Removed',
};

const REASON_LABEL: Record<ContentReportReason, string> = {
  FACTUAL_ERROR: 'Factual error',
  INAPPROPRIATE_CONTENT: 'Inappropriate content',
  BROKEN_ACTIVITY: 'Broken activity',
  WRONG_ANSWER_KEY: 'Wrong answer key',
  AGE_UNSUITABLE: 'Not age appropriate',
  COPYRIGHT_CONCERN: 'Copyright concern',
  OTHER: 'Other',
};

/** The four outcomes a reviewer can record. PENDING is a state, not a decision. */
const DECISION_OPTIONS = [
  { value: 'APPROVED', label: 'Keep visible — no change needed' },
  { value: 'REJECTED', label: 'Dismiss — not a problem' },
  { value: 'REMOVED', label: 'Remove — take it out of circulation' },
  { value: 'ESCALATED', label: 'Escalate to platform safety' },
] as const;

const REASON_FILTER_OPTIONS = [
  { value: '', label: 'Any reason' },
  ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label })),
];

const DECISION_FILTER_OPTIONS = [
  { value: '', label: 'Any status' },
  ...Object.entries(DECISION_LABEL).map(([value, label]) => ({ value, label })),
];

export function ModerationPage() {
  useDocumentTitle('Moderation');
  const queryClient = useQueryClient();
  const canReview = useCan('content.report.review');

  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<ContentReportRow | null>(null);

  const filters = {
    decision: (decision || undefined) as ModerationDecision | undefined,
    reason: (reason || undefined) as ContentReportReason | undefined,
    page,
    pageSize: 20,
  };

  const query = useQuery({
    queryKey: qk.moderation.reports(filters),
    queryFn: () => fetchContentReports(filters),
  });

  const reports = query.data?.items ?? [];
  const pendingCount = reports.filter((row) => row.decision === 'PENDING').length;

  const columns: Column<ContentReportRow>[] = [
    {
      key: 'createdAt',
      header: 'Reported',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'target',
      header: 'What was reported',
      render: (row) => <ReportTarget report={row} />,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => REASON_LABEL[row.reason],
    },
    {
      key: 'reporter',
      header: 'Raised by',
      className: 'hidden lg:table-cell',
      render: (row) => row.reporter?.displayName ?? 'Unknown',
    },
    {
      key: 'decision',
      header: 'Status',
      render: (row) => <Badge tone={DECISION_TONE[row.decision]}>{DECISION_LABEL[row.decision]}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canReview && row.decision === 'PENDING' ? (
          <Button size="sm" variant="outline" onClick={() => setReviewing(row)}>
            Review
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Moderation"
        description="Content reported by learners and staff, and what was decided about it."
      />

      {pendingCount > 0 ? (
        <Card>
          <CardBody className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong">
              <IconSafety aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold text-ink tabular-nums">{pendingCount}</p>
              <p className="text-xs text-ink-muted">
                {pendingCount === 1 ? 'report awaiting review on this page' : 'reports awaiting review on this page'}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Filters" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select
              options={DECISION_FILTER_OPTIONS}
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Reason">
            <Select
              options={REASON_FILTER_OPTIONS}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            <DataTable
              caption="Content reports"
              rows={reports}
              columns={columns}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  icon={<IconModeration className="h-8 w-8" aria-hidden />}
                  title="Nothing reported"
                  description="Reports raised by learners or staff appear here for review."
                />
              }
            />
            {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
          </QueryBoundary>
        </CardBody>
      </Card>

      <ReviewDialog
        report={reviewing}
        onClose={() => setReviewing(null)}
        onResolved={() => {
          setReviewing(null);
          void queryClient.invalidateQueries({ queryKey: qk.moderation.all });
        }}
      />
    </div>
  );
}

/** What the report points at — a lesson, an activity, or a free target reference. */
function ReportTarget({ report }: { report: ContentReportRow }) {
  if (report.activity) {
    return (
      <span>
        <span className="text-ink">{report.activity.title}</span>
        <span className="block text-xs text-ink-muted">Activity</span>
      </span>
    );
  }
  if (report.lesson) {
    return (
      <span>
        <span className="text-ink">{report.lesson.title}</span>
        <span className="block text-xs text-ink-muted">Lesson</span>
      </span>
    );
  }
  if (report.targetType) {
    return (
      <span>
        <span className="text-ink">{report.targetId?.slice(0, 12) ?? 'Unknown'}</span>
        <span className="block text-xs text-ink-muted">{report.targetType.replace(/_/g, ' ').toLowerCase()}</span>
      </span>
    );
  }
  return <span className="text-ink-muted">Deleted content</span>;
}

/**
 * The decision itself. Notes are required on anything but a plain dismissal —
 * a removal that nobody explained is impossible to review later, and the
 * blueprint asks for an auditable moderation history.
 */
function ReviewDialog({
  report,
  onClose,
  onResolved,
}: {
  report: ContentReportRow | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<string>('APPROVED');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: (input: { reportId: string; decision: ModerationDecision; resolutionNotes?: string }) =>
      resolveContentReport(input.reportId, {
        decision: input.decision,
        resolutionNotes: input.resolutionNotes,
      }),
    onSuccess: () => {
      setNotes('');
      setDecision('APPROVED');
      onResolved();
    },
  });

  if (!report) return null;

  const notesRequired = decision !== 'REJECTED';
  const canSubmit = !notesRequired || notes.trim().length > 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Review this report"
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                reportId: report.id,
                decision: decision as ModerationDecision,
                resolutionNotes: notes.trim() || undefined,
              })
            }
          >
            {mutation.isPending ? 'Recording…' : 'Record decision'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-muted">Reported</dt>
          <dd className="text-ink">
            <ReportTarget report={report} />
          </dd>
          <dt className="text-ink-muted">Reason</dt>
          <dd className="text-ink">{REASON_LABEL[report.reason]}</dd>
          <dt className="text-ink-muted">Raised by</dt>
          <dd className="text-ink">{report.reporter?.displayName ?? 'Unknown'}</dd>
          <dt className="text-ink-muted">When</dt>
          <dd className="text-ink">{formatDateTime(report.createdAt)}</dd>
        </dl>

        {report.details ? (
          <div className="rounded-md bg-surface-sunken p-3 text-sm text-ink">{report.details}</div>
        ) : (
          <p className="text-sm text-ink-muted">The reporter left no further detail.</p>
        )}

        <Field label="Decision">
          <Select
            options={DECISION_OPTIONS}
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          />
        </Field>

        <Field
          label="Notes"
          hint={notesRequired ? 'Required — say why, so this decision can be reviewed later.' : 'Optional.'}
        >
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>

        {mutation.error ? (
          <p className="text-sm text-danger-strong">{toApiError(mutation.error).message}</p>
        ) : null}
      </div>
    </Modal>
  );
}
