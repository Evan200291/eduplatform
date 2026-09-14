import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { awardBadge, awardPoints, fetchBadges } from '@/gamification/gamification.api';
import {
  cancelMissionForStudents,
  fetchMissionProgress,
  fetchMissionSummary,
  refreshMissionProgress,
} from '@/missions/missions.api';
import type { MissionProgressRow } from '@/missions/missions.types';
import { qk } from '@/query/keys';
import { humanize } from '../lib/humanize';

/**
 * The teacher's recognition controls for one learner: award points, award a
 * badge, and see — and if needed withdraw — the missions they are on.
 *
 * Teachers have always held `points.award`, `badge.award` and `mission.write`;
 * until this card there was nowhere in the teacher panel to use them.
 */
export function RecognitionActions({ studentId, displayName }: { studentId: string; displayName: string }) {
  const canAwardPoints = useCan('points.award');
  const canAwardBadge = useCan('badge.award');
  const [dialog, setDialog] = useState<'points' | 'badge' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  if (!canAwardPoints && !canAwardBadge) return null;

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: qk.gamification.profile(studentId) });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        {canAwardPoints ? (
          <Button size="sm" variant="outline" onClick={() => setDialog('points')}>
            Award points
          </Button>
        ) : null}
        {canAwardBadge ? (
          <Button size="sm" variant="outline" onClick={() => setDialog('badge')}>
            Award a badge
          </Button>
        ) : null}
      </div>
      {notice ? (
        <p className="text-sm text-ink-muted" role="status">
          {notice}
        </p>
      ) : null}
      {dialog === 'points' ? (
        <AwardPointsModal studentId={studentId} displayName={displayName} onClose={() => setDialog(null)} onDone={done} />
      ) : null}
      {dialog === 'badge' ? (
        <AwardBadgeToLearnerModal
          studentId={studentId}
          displayName={displayName}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}

function AwardPointsModal({
  studentId,
  displayName,
  onClose,
  onDone,
}: {
  studentId: string;
  displayName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [points, setPoints] = useState('10');
  const [note, setNote] = useState('');
  const value = Number(points);
  const mutation = useMutation({
    mutationFn: () => awardPoints({ studentIds: [studentId], points: value, note: note.trim() }),
    onSuccess: () => onDone(`Awarded ${value} points to ${displayName}.`),
  });
  const invalid = !Number.isInteger(value) || value < 1 || !note.trim();

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Award points to ${displayName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={invalid} onClick={() => mutation.mutate()}>
            Award
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Points" isRequired hint="A whole number. Corrections go through the admin panel.">
          <Input type="number" min={1} value={points} onChange={(event) => setPoints(event.target.value)} />
        </Field>
        <Field label="What for" isRequired hint="The learner sees this next to the points.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Helping a classmate" />
        </Field>
      </div>
    </Modal>
  );
}

function AwardBadgeToLearnerModal({
  studentId,
  displayName,
  onClose,
  onDone,
}: {
  studentId: string;
  displayName: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [badgeId, setBadgeId] = useState('');
  const [reason, setReason] = useState('');
  const badges = useQuery({
    queryKey: qk.badges.list({ pageSize: 100, activeOnly: true }),
    queryFn: () => fetchBadges({ pageSize: 100 }),
  });
  const options = (badges.data?.items ?? [])
    .filter((badge) => badge.isActive && !badge.archivedAt)
    .map((badge) => ({ value: badge.id, label: badge.name }));

  const mutation = useMutation({
    mutationFn: () => awardBadge(badgeId, [studentId], reason.trim()),
    onSuccess: (result) =>
      onDone(result.alreadyHeld ? `${displayName} already holds that badge.` : `Badge awarded to ${displayName}.`),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Award a badge to ${displayName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            disabled={!badgeId || !reason.trim()}
            onClick={() => mutation.mutate()}
          >
            Award
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <QueryBoundary isLoading={badges.isPending} error={badges.error} onRetry={() => void badges.refetch()}>
          {options.length === 0 ? (
            <EmptyState title="No badges to award" description="Badges are set up in the admin panel under Rewards & buddy." />
          ) : (
            <Field label="Badge" isRequired>
              <Select value={badgeId} placeholder="Choose a badge" onChange={(event) => setBadgeId(event.target.value)} options={options} />
            </Field>
          )}
        </QueryBoundary>
        <Field label="Why" isRequired hint="Kept on the record with the award.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

const PROGRESS_TONE = {
  NOT_STARTED: 'neutral',
  ACTIVE: 'info',
  COMPLETED: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'neutral',
} as const;

/** The learner's missions, with a reasoned withdraw for any still open. */
export function StudentMissionsCard({ studentId, className }: { studentId: string; className?: string }) {
  const canWrite = useCan('mission.write');
  const [withdrawing, setWithdrawing] = useState<MissionProgressRow | null>(null);
  const query = useQuery({
    queryKey: qk.missions.progress({ studentId }),
    queryFn: () => fetchMissionProgress({ studentId, pageSize: 50 }),
  });
  const summary = useQuery({
    queryKey: qk.missions.summary(studentId),
    queryFn: () => fetchMissionSummary(studentId),
  });
  /** Missions are re-measured on a schedule; this does it now, e.g. right after a lesson. */
  const recheck = useMutation({
    mutationFn: () => refreshMissionProgress({ studentId, note: 'Re-checked by a teacher' }),
    onSuccess: () => {
      void query.refetch();
      void summary.refetch();
    },
  });
  const rows = query.data?.items ?? [];

  return (
    <Card className={className}>
      <CardHeader
        title="Missions"
        description={
          summary.data
            ? `${summary.data.active} under way · ${summary.data.notStarted} not started · ${summary.data.completed} completed`
            : 'Short goals this learner is working towards.'
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            isLoading={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            Re-check progress
          </Button>
        }
      />
      <CardBody className="p-0">
        {recheck.error ? <ErrorState error={recheck.error} /> : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="Not on any missions" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-ink">{row.mission.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">
                    {row.progressValue}/{row.goalTarget}
                  </span>
                  <Badge tone={PROGRESS_TONE[row.status]}>{humanize(row.status)}</Badge>
                  {canWrite && (row.status === 'ACTIVE' || row.status === 'NOT_STARTED') ? (
                    <Button size="sm" variant="ghost" onClick={() => setWithdrawing(row)}>
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {withdrawing ? (
        <WithdrawMissionModal
          row={withdrawing}
          onClose={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null);
            void query.refetch();
          }}
        />
      ) : null}
    </Card>
  );
}

function WithdrawMissionModal({
  row,
  onClose,
  onDone,
}: {
  row: MissionProgressRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => cancelMissionForStudents(row.missionId, [row.studentId], reason.trim()),
    onSuccess: onDone,
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title={`Withdraw “${row.mission.title}”`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 4}
            onClick={() => mutation.mutate()}
          >
            Withdraw
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          The learner sees it leave their list. Progress so far is kept, and no points are taken away.
        </p>
        <Field label="Why" isRequired hint="At least four characters. Kept on the record.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
