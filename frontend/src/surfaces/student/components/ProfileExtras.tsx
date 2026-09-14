import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, EmptyState, IconBadge, Pagination } from '@/components/ui';
import { useCan } from '@/auth';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { fetchBadgeProgress, fetchMyBadgeAwards, fetchPointsLedger, markBadgesSeen } from '@/gamification/gamification.api';
import { qk } from '@/query/keys';

/**
 * Two things a learner can now see about their own record: which badges are
 * still to earn and what each asks for, and where every point came from.
 *
 * The points list is the ledger itself (blueprint 12: "each change records a
 * reason"), so a learner who asks "why did my points go down?" can see the
 * correction and its note rather than a bare number.
 */

const REASON_LABEL: Record<string, string> = {
  ACTIVITY_COMPLETION: 'Finished an activity',
  LESSON_COMPLETION: 'Finished a lesson',
  ASSESSMENT_COMPLETION: 'Finished a quiz',
  ASSIGNMENT_COMPLETION: 'Handed in homework',
  MISSION_COMPLETION: 'Completed a mission',
  MASTERY_MILESTONE: 'Mastered a topic',
  STREAK_BONUS: 'Streak bonus',
  BADGE_AWARD: 'Earned a badge',
  TEACHER_AWARD: 'From your teacher',
  ONBOARDING_COMPLETION: 'Getting started',
  MANUAL_ADJUSTMENT: 'Correction',
  REVERSAL: 'Taken back',
};

export function BadgesToEarnCard() {
  const query = useQuery({ queryKey: qk.badges.progress(), queryFn: () => fetchBadgeProgress() });
  const available = (query.data?.available ?? []).filter((badge) => badge.isActive && !badge.archivedAt);

  return (
    <Card>
      <CardHeader title="Badges to go for" description="What each one asks you to do." />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={available.length === 0}
          emptyState={
            <EmptyState
              icon={<IconBadge aria-hidden className="h-8 w-8 text-play-2" />}
              title="You've earned every badge there is"
              description="Your teacher may add more."
            />
          }
        >
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {available.map((badge) => (
              <li key={badge.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-3">
                <span aria-hidden className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted">
                  <IconBadge className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{badge.name}</p>
                  <p className="text-sm text-ink-muted">{badge.criteriaLabel ?? badge.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

export function PointsHistoryCard() {
  const [page, setPage] = useState(1);
  const params = { page, pageSize: 10 };
  const query = useQuery({ queryKey: qk.points.ledger(params), queryFn: () => fetchPointsLedger(params) });
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader title="Where your points came from" description="Every point you have earned, and why." />
      <CardBody>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No points yet" description="Finish an activity to earn your first ones." />}
        >
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={cn('text-sm text-ink', row.reversedAt && 'line-through')}>
                    {REASON_LABEL[row.reason] ?? 'Points'}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {row.note ? `${row.note} · ` : ''}
                    {formatRelative(row.occurredAt)}
                    {row.reversedAt ? ' · taken back' : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    row.points < 0 ? 'text-danger-strong' : 'text-success-strong',
                  )}
                >
                  {row.points > 0 ? `+${row.points}` : row.points}
                </span>
              </li>
            ))}
          </ul>
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

/**
 * The moment a learner first sees a badge they have earned. Awards arrive in
 * the background (a finished mission, a teacher's award), so without this the
 * learner only finds out by visiting their profile. "Got it" marks every new
 * award as seen so the banner does not come back.
 */
export function NewBadgesBanner() {
  const canSee = useCan('badge.read');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.badges.mine(),
    queryFn: () => fetchMyBadgeAwards(),
    enabled: canSee,
  });
  const seen = useMutation({
    mutationFn: () => markBadgesSeen(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.badges.mine() }),
  });
  const fresh = (query.data?.items ?? []).filter((award) => !award.seenAt && !award.revokedAt);
  if (!canSee || fresh.length === 0) return null;

  return (
    <Card className="border-2 border-play-2 bg-surface">
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-play-2">
            <IconBadge className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {fresh.length === 1 ? 'You earned a new badge!' : `You earned ${fresh.length} new badges!`}
            </p>
            <p className="text-sm text-ink-muted">{fresh.map((award) => award.badge.name).join(', ')}</p>
          </div>
        </div>
        <Button size="sm" isLoading={seen.isPending} onClick={() => seen.mutate()}>
          Got it
        </Button>
      </CardBody>
    </Card>
  );
}
