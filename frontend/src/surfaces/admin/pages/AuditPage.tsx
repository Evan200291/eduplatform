import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  IconAudit,
  IconOffline,
  IconSafety,
  Input,
  PageHeader,
  Pagination,
  type Column,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import { fetchAuditEntries, fetchAuditSummary } from '@/privacy/privacy.api';
import type { AuditListRow } from '@/privacy/privacy.types';

const RESULT_TONE: Record<AuditListRow['result'], BadgeTone> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  DENIED: 'warning',
};

/** The trail an inspection asks for: who did what, filtered by actor, action and date. */
export function AuditPage() {
  useDocumentTitle('Audit & safety');

  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const summary = useQuery({ queryKey: qk.audit.summary(30), queryFn: () => fetchAuditSummary(30) });

  const filters = {
    action: action || undefined,
    actorUserId: actorUserId || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 20,
  };
  const query = useQuery({
    queryKey: qk.audit.list(filters),
    queryFn: () => fetchAuditEntries(filters),
  });

  const entries = query.data?.items ?? [];

  const columns: Column<AuditListRow>[] = [
    {
      key: 'occurredAt',
      header: 'When',
      render: (row) => formatDateTime(row.occurredAt),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (row.actor ? row.actor.displayName : 'System'),
    },
    { key: 'action', header: 'Action', render: (row) => <code className="text-xs">{row.action}</code> },
    { key: 'target', header: 'Target', render: (row) => `${row.targetType}${row.targetId ? ` · ${row.targetId.slice(0, 8)}` : ''}` },
    { key: 'summary', header: 'Summary', className: 'hidden lg:table-cell', render: (row) => row.summary },
    {
      key: 'result',
      header: 'Result',
      render: (row) => <Badge tone={RESULT_TONE[row.result]}>{row.result}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit & safety" description="Administrative actions and the record they leave behind." />

      {summary.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label={`Events (${summary.data.window.days}d)`} value={summary.data.total} icon={IconAudit} tone="brand" />
          <StatTile label="Denied" value={summary.data.denied} icon={IconSafety} tone="warning" />
          <StatTile label="Failed" value={summary.data.failed} icon={IconOffline} tone="danger" />
          <StatTile label="Impersonated" value={summary.data.impersonated} icon={IconAudit} tone="info" />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Filters" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Action" hint="e.g. user.suspend">
            <Input
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Actor user id">
            <Input
              value={actorUserId}
              onChange={(event) => {
                setActorUserId(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
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
              caption="Audit log entries"
              rows={entries}
              columns={columns}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState icon={<IconAudit className="h-8 w-8" aria-hidden />} title="No matching events" />
              }
            />
            {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof IconAudit;
  tone: BadgeTone;
}) {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-surface-sunken text-ink-muted',
    info: 'bg-secondary-soft text-secondary-strong',
    success: 'bg-success-soft text-success-strong',
    warning: 'bg-warning-soft text-warning-strong',
    danger: 'bg-danger-soft text-danger-strong',
    brand: 'bg-primary-soft text-primary-strong',
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses[tone]}`}>
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink tabular-nums">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}
