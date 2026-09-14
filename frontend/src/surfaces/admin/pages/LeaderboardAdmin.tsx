import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, Modal } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { archiveLeaderboard, fetchLeaderboard, recomputeLeaderboard } from '@/leaderboard/leaderboard.api';
import type { BoardSummary } from '@/leaderboard/leaderboard.types';
import { formatDateTime } from '@/lib/format';
import { qk } from '@/query/keys';

/**
 * What a board shows right now, as staff see it. Standings are computed on a
 * schedule; "Recalculate now" runs it immediately — useful after correcting
 * points. A board below its minimum number of participants is hidden from
 * learners, and this says so instead of showing an empty table.
 */
export function BoardStandingsModal({
  board,
  canWrite,
  onClose,
}: {
  board: BoardSummary;
  canWrite: boolean;
  onClose: () => void;
}) {
  const query = useQuery({ queryKey: qk.leaderboard.detail(board.id), queryFn: () => fetchLeaderboard(board.id) });
  const recompute = useMutation({
    mutationFn: () => recomputeLeaderboard(board.id),
    onSuccess: () => void query.refetch(),
  });
  const standings = query.data?.standings ?? [];

  return (
    <Modal isOpen onClose={onClose} size="lg" title={`Standings — ${board.name}`}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-muted">
            {board.periodEnd ? `Current period ends ${formatDateTime(board.periodEnd)}. ` : ''}
            Top {board.showTopN} shown to learners; hidden below {board.minParticipants} participants.
          </p>
          {canWrite ? (
            <Button size="sm" variant="outline" isLoading={recompute.isPending} onClick={() => recompute.mutate()}>
              Recalculate now
            </Button>
          ) : null}
        </div>
        {recompute.error ? <ErrorState error={recompute.error} /> : null}
        {recompute.data ? <p className="text-success-strong">Recalculated: {recompute.data.ranked} learners ranked.</p> : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={standings.length === 0}
          emptyState={
            <EmptyState
              title={query.data?.hiddenReason === 'TOO_FEW_PARTICIPANTS' ? 'Hidden: too few taking part' : 'No standings yet'}
              description={
                query.data?.hiddenReason === 'TOO_FEW_PARTICIPANTS'
                  ? 'Learners see nothing until enough of them are on the board, so nobody is singled out.'
                  : 'Standings appear after the next calculation.'
              }
            />
          }
        >
          <ol className="flex flex-col divide-y divide-line">
            {standings.map((row) => (
              <li key={`${row.rank}-${row.label}`} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink">
                  <span className="mr-2 inline-block w-8 tabular-nums text-ink-muted">#{row.rank}</span>
                  {row.label}
                  {row.optedOut ? <span className="text-ink-muted"> (opted out)</span> : null}
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {row.movement ? (
                    <span className={row.movement > 0 ? 'text-success-strong' : 'text-danger-strong'}>
                      {row.movement > 0 ? `up ${row.movement}` : `down ${Math.abs(row.movement)}`}
                    </span>
                  ) : null}
                  <Badge tone="neutral">{row.score}</Badge>
                </span>
              </li>
            ))}
          </ol>
        </QueryBoundary>
      </div>
    </Modal>
  );
}

export function ArchiveBoardModal({ board, onClose }: { board: BoardSummary; onClose: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveLeaderboard(board.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.leaderboard.config() });
      onClose();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Archive “${board.name}”?`}
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
      <p className="text-ink">Learners stop seeing it. Its past standings are kept.</p>
    </Modal>
  );
}
