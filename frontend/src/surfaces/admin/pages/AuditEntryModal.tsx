import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, type BadgeTone, Button, EmptyState, Modal } from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { formatDateTime } from '@/lib/format';
import { fetchAuditEntry, fetchAuditTargetHistory } from '@/privacy/privacy.api';
import type { AuditListRow } from '@/privacy/privacy.types';
import { qk } from '@/query/keys';

/**
 * One audit entry in full: who, as what role, from where, and exactly what
 * changed. Before and after are laid out field by field, with changed fields
 * marked in words as well as colour. "Everything that happened to this" pulls
 * the target's whole history, which is the question an inspection usually asks.
 */

const RESULT_TONE: Record<AuditListRow['result'], BadgeTone> = {
  SUCCESS: 'success',
  FAILURE: 'danger',
  DENIED: 'warning',
};

function show(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'empty';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function AuditEntryModal({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const [currentId, setCurrentId] = useState(entryId);
  const [showHistory, setShowHistory] = useState(false);
  const query = useQuery({ queryKey: qk.audit.detail(currentId), queryFn: () => fetchAuditEntry(currentId) });
  const entry = query.data;
  const history = useQuery({
    queryKey: qk.audit.targetHistory(entry?.targetType ?? '', entry?.targetId ?? ''),
    queryFn: () => fetchAuditTargetHistory(entry?.targetType ?? '', entry?.targetId ?? ''),
    enabled: showHistory && Boolean(entry?.targetId),
  });

  const before = asRecord(entry?.beforeData);
  const after = asRecord(entry?.afterData);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return (
    <Modal isOpen onClose={onClose} size="lg" title="Audit entry">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {entry ? (
          <div className="flex flex-col gap-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs">{entry.action}</code>
              <Badge tone={RESULT_TONE[entry.result]}>{entry.result}</Badge>
              {entry.isImpersonation ? <Badge tone="warning">Done while impersonating</Badge> : null}
            </div>
            <p className="text-ink">{entry.summary}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-ink-muted">When</dt>
              <dd className="text-ink">{formatDateTime(entry.occurredAt)}</dd>
              <dt className="text-ink-muted">Who</dt>
              <dd className="text-ink">
                {entry.actor?.displayName ?? 'System'}
                {entry.actorRole ? ` (${entry.actorRole})` : ''}
              </dd>
              <dt className="text-ink-muted">Target</dt>
              <dd className="break-all text-ink">
                {entry.targetType}
                {entry.targetId ? ` · ${entry.targetId}` : ''}
              </dd>
              {entry.reason ? (
                <>
                  <dt className="text-ink-muted">Reason given</dt>
                  <dd className="text-ink">{entry.reason}</dd>
                </>
              ) : null}
              {entry.ipAddress ? (
                <>
                  <dt className="text-ink-muted">From</dt>
                  <dd className="break-all text-ink">
                    {entry.ipAddress}
                    {entry.userAgent ? ` · ${entry.userAgent}` : ''}
                  </dd>
                </>
              ) : null}
              {entry.requestId ? (
                <>
                  <dt className="text-ink-muted">Request</dt>
                  <dd className="break-all text-ink">
                    <code className="text-xs">{entry.requestId}</code>
                  </dd>
                </>
              ) : null}
            </dl>

            <div>
              <p className="mb-2 font-medium text-ink">What changed</p>
              {keys.length === 0 ? (
                <p className="text-ink-muted">No before or after values were recorded for this action.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface-sunken">
                        <th className="px-2 py-1 font-medium text-ink-muted">Field</th>
                        <th className="px-2 py-1 font-medium text-ink-muted">Before</th>
                        <th className="px-2 py-1 font-medium text-ink-muted">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const changed = show(before[key]) !== show(after[key]);
                        return (
                          <tr key={key} className={changed ? 'border-b border-line bg-warning-soft' : 'border-b border-line'}>
                            <td className="px-2 py-1 align-top text-ink">
                              {key}
                              {changed ? <span className="ml-1 text-warning-strong">(changed)</span> : null}
                            </td>
                            <td className="break-all px-2 py-1 align-top text-ink">{show(before[key])}</td>
                            <td className="break-all px-2 py-1 align-top text-ink">{show(after[key])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {entry.targetId ? (
              <div>
                {!showHistory ? (
                  <Button size="sm" variant="outline" onClick={() => setShowHistory(true)}>
                    Everything that happened to this {entry.targetType}
                  </Button>
                ) : (
                  <>
                    <p className="mb-2 font-medium text-ink">History of this {entry.targetType}</p>
                    <QueryBoundary
                      isLoading={history.isPending}
                      error={history.error}
                      onRetry={() => void history.refetch()}
                      isEmpty={(history.data ?? []).length === 0}
                      emptyState={<EmptyState title="Nothing else recorded" />}
                    >
                      <ol className="flex flex-col divide-y divide-line">
                        {(history.data ?? []).map((row) => (
                          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                              <p className="text-ink">{row.summary}</p>
                              <p className="text-xs text-ink-muted">
                                {formatDateTime(row.occurredAt)} · {row.actor?.displayName ?? 'System'}
                              </p>
                            </div>
                            {row.id === currentId ? (
                              <Badge tone="brand">Showing</Badge>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => setCurrentId(row.id)}>
                                Open
                              </Button>
                            )}
                          </li>
                        ))}
                      </ol>
                    </QueryBoundary>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </Modal>
  );
}
