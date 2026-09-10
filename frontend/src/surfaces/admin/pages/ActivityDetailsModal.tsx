import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, EmptyState, Input, Modal } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { fetchActivityStaff, fetchActivityVersions, setActivityObjectives } from '@/content/content.api';
import { CONTENT_STATUS_TONE } from '@/content/content-lifecycle';
import { fetchObjectives } from '@/curriculum/curriculum.api';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';

/**
 * Two things about an activity that were set only by the seed until now:
 * which learning objectives it gives evidence for (and how strongly), and the
 * history of its published versions — including whether a revision
 * invalidated the evidence learners had already produced on the old one.
 */
export function ActivityDetailsModal({
  activity,
  canWrite,
  onClose,
}: {
  activity: { id: string; title: string; topicId: string };
  canWrite: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'objectives' | 'history'>('objectives');

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={activity.title}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2" role="tablist" aria-label="Activity details">
          {(
            [
              ['objectives', 'Objectives'],
              ['history', 'Version history'],
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
        {tab === 'objectives' ? (
          <ObjectiveLinks activity={activity} canWrite={canWrite} />
        ) : (
          <VersionHistory activityId={activity.id} />
        )}
      </div>
    </Modal>
  );
}

function ObjectiveLinks({
  activity,
  canWrite,
}: {
  activity: { id: string; topicId: string };
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: qk.activities.detail(activity.id), queryFn: () => fetchActivityStaff(activity.id) });
  const params = { topicId: activity.topicId, pageSize: 100 };
  const objectives = useQuery({
    queryKey: qk.curriculum.list({ scope: 'objectives', ...params }),
    queryFn: () => fetchObjectives(params),
  });
  const [draft, setDraft] = useState<Map<string, number> | null>(null);

  const current: Map<string, number> =
    draft ?? new Map((staff.data?.objectiveLinks ?? []).map((link) => [link.objectiveId, link.weight]));

  const toggle = (id: string) => {
    const next = new Map(current);
    if (next.has(id)) next.delete(id);
    else next.set(id, 100);
    setDraft(next);
  };
  const setWeight = (id: string, value: string) => {
    const next = new Map(current);
    next.set(id, Number(value));
    setDraft(next);
  };

  const invalidWeight = [...current.values()].some((weight) => !Number.isInteger(weight) || weight < 1 || weight > 1000);

  const save = useMutation({
    mutationFn: () =>
      setActivityObjectives(
        activity.id,
        [...current.entries()].map(([objectiveId, weight]) => ({ objectiveId, weight })),
      ),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: qk.activities.detail(activity.id) });
    },
  });

  const rows = [...(objectives.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        Which of the topic&rsquo;s objectives this activity gives evidence for. Weight is its relative contribution
        (1–1000, default 100).
      </p>
      {save.error ? <ErrorState error={save.error} /> : null}
      <QueryBoundary
        isLoading={staff.isPending || objectives.isPending}
        error={staff.error ?? objectives.error}
        onRetry={() => {
          void staff.refetch();
          void objectives.refetch();
        }}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            title="This topic has no objectives yet"
            description="Add them from the topic's Objectives button on the Curriculum screen."
          />
        }
      >
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {rows.map((objective) => {
            const linked = current.has(objective.id);
            return (
              <li key={objective.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Checkbox
                  label={`${objective.code} ${objective.statement}`}
                  checked={linked}
                  disabled={!canWrite}
                  onChange={() => toggle(objective.id)}
                />
                {linked ? (
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    aria-label={`Weight for ${objective.code}`}
                    className="w-24"
                    disabled={!canWrite}
                    value={String(current.get(objective.id))}
                    onChange={(event) => setWeight(objective.id, event.target.value)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </QueryBoundary>
      {canWrite ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            isLoading={save.isPending}
            disabled={draft === null || invalidWeight || current.size > 20}
            onClick={() => save.mutate()}
          >
            Save links
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VersionHistory({ activityId }: { activityId: string }) {
  const query = useQuery({
    queryKey: qk.activities.versions(activityId),
    queryFn: () => fetchActivityVersions(activityId),
  });
  const rows = query.data ?? [];

  return (
    <QueryBoundary
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      isEmpty={rows.length === 0}
      emptyState={<EmptyState title="Not published yet" description="A version is saved each time the activity is published." />}
    >
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">v{row.version}</span>
              <Badge tone={CONTENT_STATUS_TONE[row.status]}>{row.status.charAt(0) + row.status.slice(1).toLowerCase()}</Badge>
              {row.invalidatesPriorEvidence ? <Badge tone="warning">Replaced earlier evidence</Badge> : null}
              <span className="text-xs text-ink-muted">
                {formatDate(row.publishedAt ?? row.createdAt)}
              </span>
            </div>
            <p className="text-ink-muted">{row.changeSummary ?? 'No change summary given.'}</p>
          </li>
        ))}
      </ol>
    </QueryBoundary>
  );
}
