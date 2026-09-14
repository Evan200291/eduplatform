import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconAdd,
  Modal,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { formatDateTime } from '@/lib/format';
import { createModerationReview, fetchActivities, fetchLessons, fetchMedia, fetchModerationReviews } from '@/content/content.api';
import type { ContentTargetType, ModerationDecision } from '@/content/content.types';
import { qk } from '@/query/keys';

/**
 * The moderation decision log, and proactive reviews (blueprint 10 safety).
 *
 * Every decision on a report lands here, and a reviewer can also record a
 * check nobody asked for — a sweep of a new unit before term, say. A recorded
 * review is the evidence that someone looked; it does not by itself hide
 * anything. Taking content down is done by archiving it in Curriculum or the
 * Media library, and the form says so rather than implying otherwise.
 */

const DECISION_TONE: Record<ModerationDecision, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
  ESCALATED: 'danger',
  REMOVED: 'danger',
};

const DECISION_LABEL: Record<ModerationDecision, string> = {
  PENDING: 'Still being looked at',
  APPROVED: 'Checked, fine as it is',
  REJECTED: 'Dismissed',
  ESCALATED: 'Escalated',
  REMOVED: 'Taken out of circulation',
};

const TARGET_LABEL: Record<ContentTargetType, string> = {
  CURRICULUM_PROGRAM: 'Programme',
  UNIT: 'Unit',
  TOPIC: 'Topic',
  LESSON: 'Lesson',
  ACTIVITY: 'Activity',
  MEDIA: 'Media',
};

export function ModerationLogCard({ canReview }: { canReview: boolean }) {
  const [page, setPage] = useState(1);
  const [isRecording, setRecording] = useState(false);
  const params = { page, pageSize: 10 };
  const query = useQuery({ queryKey: qk.moderation.reviews(params), queryFn: () => fetchModerationReviews(params) });
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Decision log"
        description="Every moderation decision, including checks made without a report."
        actions={
          canReview ? (
            <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setRecording(true)}>
              Record a check
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No decisions recorded yet" />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">
                    {TARGET_LABEL[row.targetType]} <code className="text-xs text-ink-muted">{row.targetId.slice(0, 8)}</code>
                    {row.reportId ? <span className="text-ink-muted"> · from a report</span> : <span className="text-ink-muted"> · proactive check</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(row.createdAt)} · {row.reviewer?.displayName ?? 'Unknown reviewer'}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </p>
                </div>
                <Badge tone={DECISION_TONE[row.decision]}>{DECISION_LABEL[row.decision]}</Badge>
              </li>
            ))}
          </ul>
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
        </QueryBoundary>
      </CardBody>
      {isRecording ? <RecordCheckModal onClose={() => setRecording(false)} /> : null}
    </Card>
  );
}

type PickableTarget = 'LESSON' | 'ACTIVITY' | 'MEDIA';

function RecordCheckModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<PickableTarget>('ACTIVITY');
  const [targetId, setTargetId] = useState('');
  const [decision, setDecision] = useState<ModerationDecision>('APPROVED');
  const [notes, setNotes] = useState('');

  const options = useQuery({
    queryKey: qk.moderation.targets(targetType),
    queryFn: async (): Promise<{ value: string; label: string }[]> => {
      if (targetType === 'LESSON') {
        return (await fetchLessons({ pageSize: 100 })).items.map((row) => ({ value: row.id, label: row.title }));
      }
      if (targetType === 'ACTIVITY') {
        return (await fetchActivities({ pageSize: 100 })).items.map((row) => ({ value: row.id, label: row.title }));
      }
      return (await fetchMedia({ pageSize: 100 })).items.map((row) => ({ value: row.id, label: row.fileName }));
    },
  });

  const mutation = useMutation({
    mutationFn: () =>
      createModerationReview({
        targetType,
        targetId,
        decision,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.moderation.all });
      onClose();
    },
  });

  const needsNote = decision !== 'APPROVED';
  const blocked = !targetId ? 'Choose what you checked.' : needsNote && notes.trim().length < 3 ? 'Say what you found.' : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Record a check"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blocked !== null} onClick={() => mutation.mutate()}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kind">
            <Select
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as PickableTarget);
                setTargetId('');
              }}
              options={[
                { value: 'ACTIVITY', label: 'Activity' },
                { value: 'LESSON', label: 'Lesson' },
                { value: 'MEDIA', label: 'Media file' },
              ]}
            />
          </Field>
          <Field label="Which one" isRequired>
            <Select
              value={targetId}
              placeholder={options.isPending ? 'Loading…' : 'Choose'}
              onChange={(event) => setTargetId(event.target.value)}
              options={options.data ?? []}
            />
          </Field>
        </div>
        {options.error ? <ErrorState error={options.error} onRetry={() => void options.refetch()} /> : null}
        <Field label="What you decided">
          <Select
            value={decision}
            onChange={(event) => setDecision(event.target.value as ModerationDecision)}
            options={[
              { value: 'APPROVED', label: 'Checked, fine as it is' },
              { value: 'ESCALATED', label: 'Needs platform safety to look' },
              { value: 'REMOVED', label: 'Should be taken out of circulation' },
              { value: 'PENDING', label: 'Still looking into it' },
            ]}
          />
        </Field>
        {decision === 'REMOVED' ? (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-ink">
            This records the decision. To actually take it down, archive it in Curriculum or the Media library.
          </p>
        ) : null}
        <Field label="Notes" isRequired={needsNote} hint={needsNote ? 'Required for anything but "fine as it is".' : 'Optional.'}>
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {blocked ? <p className="text-sm text-ink-muted">{blocked}</p> : null}
      </div>
    </Modal>
  );
}
