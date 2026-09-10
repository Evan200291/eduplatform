import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { acknowledgeCompanionEvents, fetchCompanionEvents, updateCompanion } from '@/companion/companion.api';
import { formatRelative } from '@/lib/format';
import { qk } from '@/query/keys';

/**
 * Renaming the buddy, and a short diary of what happened to it — a stage
 * reached, a mood change, growth from a teacher. Opening the diary marks the
 * events seen, which is what clears the "something new" count elsewhere.
 */

export function RenameBuddyButton({ currentName }: { currentName: string }) {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Rename
      </Button>
      {isOpen ? <RenameModal currentName={currentName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function RenameModal({ currentName, onClose }: { currentName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const mutation = useMutation({
    mutationFn: () => updateCompanion({ name: name.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.companion.mine() });
      onClose();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Give your buddy a new name"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={name.trim().length < 2 || name.trim() === currentName} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name">
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function BuddyDiaryCard() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.companion.events(), queryFn: () => fetchCompanionEvents() });
  const markSeen = useMutation({
    mutationFn: () => acknowledgeCompanionEvents(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.companion.events() }),
  });
  const rows = query.data?.items ?? [];
  const hasUnseen = rows.some((row) => row.seenAt === null);

  // Seeing the diary is what "seen" means, so it is marked once it has loaded.
  useEffect(() => {
    // Once only: a failure is not retried in a loop.
    if (hasUnseen && markSeen.isIdle) markSeen.mutate();
  }, [hasUnseen, markSeen]);

  return (
    <Card>
      <CardHeader title="Buddy diary" description="What has happened lately." />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="Nothing yet" description="Learn a little and your buddy will have news." />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.slice(0, 10).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-ink">
                  {row.description}
                  {row.seenAt === null ? <span className="ml-2 text-xs font-semibold text-primary-strong">New</span> : null}
                </span>
                <span className="shrink-0 text-xs text-ink-muted">{formatRelative(row.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}
