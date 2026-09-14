import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Modal, Textarea } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import {
  fetchMyBadgeAwards,
  fetchMyRewards,
  fetchPointsSummary,
  reversePointsEntry,
  revokeBadge,
} from '@/gamification/gamification.api';
import type { PointsLedgerEntry, StudentBadgeAward } from '@/gamification/gamification.types';
import { qk } from '@/query/keys';

/**
 * One learner's recognition record, with the two corrections blueprint 12
 * allows: taking back points given in error, and revoking a badge. Neither
 * deletes anything — the ledger keeps the original entry and the reversal side
 * by side, and the learner sees the reason.
 */

type Correction =
  | { kind: 'points'; entry: PointsLedgerEntry }
  | { kind: 'badge'; award: StudentBadgeAward };

export function StudentRewardsRecord({ studentId, className }: { studentId: string; className?: string }) {
  const canReverse = useCan('points.adjust');
  const canRevoke = useCan('badge.award');
  const [correcting, setCorrecting] = useState<Correction | null>(null);

  const summary = useQuery({ queryKey: qk.points.summary(studentId), queryFn: () => fetchPointsSummary(studentId) });
  const awards = useQuery({ queryKey: qk.badges.mine(studentId), queryFn: () => fetchMyBadgeAwards(studentId) });
  const rewards = useQuery({ queryKey: qk.rewards.mine(studentId), queryFn: () => fetchMyRewards(studentId) });

  const recent = summary.data?.recent ?? [];
  const held = (awards.data?.items ?? []).filter((award) => !award.revokedAt);
  const grants = rewards.data?.items ?? [];

  return (
    <Card className={className}>
      <CardHeader
        title="Points, badges and rewards"
        description="Everything this learner has been given. Corrections keep the original on the record."
      />
      <CardBody className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Points</h3>
          <QueryBoundary isLoading={summary.isPending} error={summary.error} onRetry={() => void summary.refetch()}>
            {summary.data ? (
              <>
                <p className="text-sm text-ink">
                  <span className="text-lg font-semibold tabular-nums">{formatNumber(summary.data.balance)}</span> in
                  total · {formatNumber(summary.data.earnedThisWeek)} this week
                </p>
                {recent.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">No points yet.</p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-line">
                    {recent.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <p className={cn('text-sm text-ink', entry.reversedAt && 'line-through')}>
                            {entry.points > 0 ? `+${entry.points}` : entry.points} · {entry.note ?? entry.reason.toLowerCase().replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {formatRelative(entry.occurredAt)}
                            {entry.reversedAt ? ' · taken back' : ''}
                          </p>
                        </div>
                        {canReverse && !entry.reversedAt && entry.points > 0 && entry.reason !== 'REVERSAL' ? (
                          <Button size="sm" variant="ghost" onClick={() => setCorrecting({ kind: 'points', entry })}>
                            Take back
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </QueryBoundary>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Badges held</h3>
          <QueryBoundary
            isLoading={awards.isPending}
            error={awards.error}
            onRetry={() => void awards.refetch()}
            isEmpty={held.length === 0}
            emptyState={<EmptyState title="No badges yet" />}
          >
            <ul className="flex flex-col divide-y divide-line">
              {held.map((award) => (
                <li key={award.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{award.badge.name}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDate(award.awardedAt)}
                      {award.reason ? ` · ${award.reason}` : ''}
                    </p>
                  </div>
                  {canRevoke ? (
                    <Button size="sm" variant="ghost" onClick={() => setCorrecting({ kind: 'badge', award })}>
                      Revoke
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </QueryBoundary>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Rewards unlocked</h3>
          <QueryBoundary
            isLoading={rewards.isPending}
            error={rewards.error}
            onRetry={() => void rewards.refetch()}
            isEmpty={grants.length === 0}
            emptyState={<EmptyState title="Nothing unlocked yet" />}
          >
            <ul className="flex flex-col divide-y divide-line">
              {grants.map((grant) => (
                <li key={grant.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{grant.reward.name}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDate(grant.unlockedAt)} · {grant.pointsSpent} points
                    </p>
                  </div>
                  {grant.isEquipped ? <Badge tone="brand">In use</Badge> : null}
                </li>
              ))}
            </ul>
          </QueryBoundary>
        </section>
      </CardBody>
      {correcting ? (
        <CorrectionModal studentId={studentId} correction={correcting} onClose={() => setCorrecting(null)} />
      ) : null}
    </Card>
  );
}

function CorrectionModal({
  studentId,
  correction,
  onClose,
}: {
  studentId: string;
  correction: Correction;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: (): Promise<unknown> =>
      correction.kind === 'points'
        ? reversePointsEntry(correction.entry.id, reason.trim())
        : revokeBadge(correction.award.badgeId, [studentId], reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['points'] });
      void queryClient.invalidateQueries({ queryKey: ['badges'] });
      onClose();
    },
  });

  const isPoints = correction.kind === 'points';
  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title={isPoints ? `Take back ${correction.entry.points} points` : `Revoke “${correction.award.badge.name}”`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 2}
            onClick={() => mutation.mutate()}
          >
            {isPoints ? 'Take back' : 'Revoke'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink">
          {isPoints
            ? 'A matching negative entry is added. The original stays on the record, crossed through.'
            : 'The badge leaves their profile. Any points it gave are taken back too.'}
        </p>
        <Field label="Reason" isRequired hint="The learner and other staff see this.">
          <Textarea rows={2} maxLength={400} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
