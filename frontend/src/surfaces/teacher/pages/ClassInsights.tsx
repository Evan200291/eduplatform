import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchClassProgress } from '@/progress/progress.api';
import type { ClassProgress } from '@/progress/progress.types';
import { fetchStreaks } from '@/gamification/gamification.api';
import { fetchCompanionRoster, grantCompanionGrowth } from '@/companion/companion.api';
import type { CompanionRosterRow } from '@/companion/companion.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDuration, formatRelative } from '@/lib/format';
import { humanize } from '../lib/humanize';
import type { StudentNavState } from '../lib/nav-state';

/**
 * The class at a glance: who is engaging, whose streak lapses today, and whose
 * buddy has gone quiet. Each is a prompt for a conversation, not a ranking —
 * the table is alphabetical, never sorted by score.
 */

type Row = ClassProgress['students'][number];

const LEVEL_ORDER = ['MASTERED', 'PROFICIENT', 'DEVELOPING', 'EMERGING'] as const;

function masteryText(byLevel: Row['masteryByLevel']): string {
  const parts = LEVEL_ORDER.filter((level) => (byLevel[level] ?? 0) > 0).map(
    (level) => `${byLevel[level]} ${humanize(level).toLowerCase()}`,
  );
  return parts.length > 0 ? parts.join(' · ') : 'No evidence yet';
}

export function ClassProgressCard({ classId, className }: { classId: string; className?: string }) {
  const canRead = useCan('progress.read.scoped');
  const canReadSchool = useCan('progress.read.school');
  const [period, setPeriod] = useState<'all' | '7' | '30'>('all');

  // Fixed when the period is chosen: computing it per render would change the
  // query key every render and refetch in a loop.
  const since = useMemo(
    () => (period === 'all' ? undefined : new Date(Date.now() - Number(period) * 86_400_000).toISOString()),
    [period],
  );
  const query = useQuery({
    queryKey: qk.progress.forClass(classId, { since }),
    queryFn: () => fetchClassProgress(classId, since ? { since } : undefined),
    enabled: canRead || canReadSchool,
  });

  if (!canRead && !canReadSchool) return null;

  const idleCutoff = Date.now() - 7 * 86_400_000;
  const columns: Column<Row>[] = [
    {
      key: 'student',
      header: 'Learner',
      render: (row) => {
        const state: StudentNavState = { displayName: row.student.displayName, classId };
        return (
          <Link to={paths.teach.studentDetail(row.student.id)} state={state} className="text-ink hover:underline">
            {row.student.displayName}
          </Link>
        );
      },
    },
    {
      key: 'last',
      header: 'Last active',
      render: (row) => {
        const idle = !row.lastActivityAt || new Date(row.lastActivityAt).getTime() < idleCutoff;
        return (
          <span className={idle ? 'font-medium text-warning-strong' : 'text-ink'}>
            {row.lastActivityAt ? formatRelative(row.lastActivityAt) : 'Not yet'}
            {idle ? <span className="sr-only"> (quiet for a week or more)</span> : null}
          </span>
        );
      },
    },
    { key: 'touched', header: 'Activities', isNumeric: true, render: (row) => row.activitiesTouched },
    {
      key: 'time',
      header: 'Time',
      isNumeric: true,
      className: 'hidden sm:table-cell',
      headerClassName: 'hidden sm:table-cell',
      render: (row) => formatDuration(row.timeSpentSeconds),
    },
    {
      key: 'mastery',
      header: 'Topics by mastery',
      className: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (row) => <span className="text-ink-muted">{masteryText(row.masteryByLevel)}</span>,
    },
  ];

  return (
    <Card className={className}>
      <CardHeader
        title="How the class is doing"
        description="Engagement and mastery per learner, in name order. A last-active date in amber means a week or more."
        actions={
          <div className="flex gap-1" role="group" aria-label="Period">
            {(
              [
                ['all', 'All time'],
                ['30', '30 days'],
                ['7', '7 days'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={period === value ? 'primary' : 'outline'}
                aria-pressed={period === value}
                onClick={() => setPeriod(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={(query.data?.students.length ?? 0) === 0}
          emptyState={<EmptyState title="No learners to show" className="border-none py-6" />}
        >
          <DataTable
            caption="Class progress"
            rows={query.data?.students ?? []}
            columns={columns}
            getRowKey={(row) => row.student.id}
          />
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

export function StreaksAtRiskCard({ classId }: { classId: string }) {
  const canRead = useCan('gamification.read');
  const params = { classId, atRiskOnly: true, pageSize: 50 };
  const query = useQuery({
    queryKey: qk.streaks.list(params),
    queryFn: () => fetchStreaks(params),
    enabled: canRead,
  });
  if (!canRead) return null;
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader title="Streaks that lapse today" description="A reminder is worth more than a lost streak." />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No streaks at risk" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink">{row.student.displayName}</span>
                <span className="text-ink-muted">
                  {humanize(row.kind)} · {row.currentLength} in a row
                  {row.freezesRemaining > 0 ? ` · ${row.freezesRemaining} freeze${row.freezesRemaining === 1 ? '' : 's'} left` : ''}
                </span>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

export function QuietBuddiesCard({ classId }: { classId: string }) {
  const canRead = useCan('companion.read');
  const canGrant = useCan('companion.config');
  const [quietOnly, setQuietOnly] = useState(true);
  const [isGranting, setGranting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const params = { classId, quietOnly, pageSize: 50 };
  const query = useQuery({
    queryKey: qk.gamification.companionRoster(params),
    queryFn: () => fetchCompanionRoster(params),
    enabled: canRead,
  });
  if (!canRead) return null;
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Buddies"
        description={quietOnly ? 'Not visited for a week or more.' : 'Every learner who has chosen one.'}
        actions={
          canGrant ? (
            <Button size="sm" variant="outline" onClick={() => setGranting(true)}>
              Give growth
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-3 p-0">
        <div className="px-4 pt-3">
          <Checkbox label="Only quiet buddies" checked={quietOnly} onChange={(event) => setQuietOnly(event.target.checked)} />
        </div>
        {notice ? (
          <p className="px-4 text-sm text-ink-muted" role="status">
            {notice}
          </p>
        ) : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={
            <EmptyState title={quietOnly ? 'No quiet buddies' : 'No buddies chosen yet'} className="border-none py-6" />
          }
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink">
                  {row.student.displayName} <span className="text-ink-muted">· {row.name}, {row.stageLabel.toLowerCase()}</span>
                </span>
                <span className="text-ink-muted">
                  {row.quietDays === 0 ? 'Visited today' : `${row.quietDays} day${row.quietDays === 1 ? '' : 's'} since a visit`}
                </span>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {isGranting ? (
        <GrantGrowthModal
          rows={rows}
          onClose={() => setGranting(false)}
          onDone={(message) => {
            setGranting(false);
            setNotice(message);
            void query.refetch();
          }}
        />
      ) : null}
    </Card>
  );
}

/**
 * Growth for learning done off-screen. Offered over the learners listed —
 * those who have a buddy — since the server skips anyone without one.
 */
function GrantGrowthModal({
  rows,
  onClose,
  onDone,
}: {
  rows: CompanionRosterRow[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string[]>([]);
  const [points, setPoints] = useState('10');
  const [note, setNote] = useState('');
  const value = Number(points);

  const mutation = useMutation({
    mutationFn: () => grantCompanionGrowth({ studentIds: chosen, growthPoints: value, note: note.trim() }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.gamification.companion });
      onDone(
        `Growth given to ${result.granted}${result.skipped ? `; ${result.skipped} skipped (no buddy)` : ''}${
          result.stageChanges ? `; ${result.stageChanges} grew a stage` : ''
        }.`,
      );
    },
  });

  const invalid = chosen.length === 0 || !Number.isInteger(value) || value < 1 || value > 1000 || note.trim().length < 4;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Give buddy growth"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={invalid} onClick={() => mutation.mutate()}>
            Give
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">For learning that happened away from the screen — a reading log, a workbook page.</p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">Nobody listed has a buddy. Clear “Only quiet buddies” to see everyone.</p>
        ) : (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {rows.map((row) => (
              <li key={row.studentId}>
                <Checkbox
                  label={row.student.displayName}
                  checked={chosen.includes(row.studentId)}
                  onChange={() =>
                    setChosen((current) =>
                      current.includes(row.studentId)
                        ? current.filter((id) => id !== row.studentId)
                        : [...current, row.studentId],
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <Field label="Growth points" hint="1 to 1,000.">
          <Input type="number" min={1} max={1000} value={points} onChange={(event) => setPoints(event.target.value)} />
        </Field>
        <Field label="What for" isRequired hint="At least four characters. Kept on the record.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
