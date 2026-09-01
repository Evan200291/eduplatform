import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconActivity,
  IconAssignment,
  IconBadge,
  IconProgress,
  IconStreak,
  IconTime,
  PageHeader,
  ProgressBar,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { useProfile } from '@/auth';
import { fetchProgressSummary } from '@/progress/progress.api';
import { fetchGamificationProfile } from '@/gamification/gamification.api';
import { fetchStudentMastery } from '@/assessment/assessment.api';
import { fetchMyWork } from '@/assignments/assignments.api';
import type { MasteryLevel } from '@/assessment/assessment.types';
import { qk } from '@/query/keys';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { playAccent } from '../play-accents';

/** Age-appropriate, encouraging language for a mastery level — never the raw enum. */
const MASTERY_COPY: Record<MasteryLevel, { label: string; tone: 'neutral' | 'warning' | 'info' | 'brand' | 'success' }> = {
  NOT_ASSESSED: { label: 'Not started yet', tone: 'neutral' },
  EMERGING: { label: 'Just getting started', tone: 'warning' },
  DEVELOPING: { label: 'Building it up', tone: 'info' },
  PROFICIENT: { label: 'Getting really good at this', tone: 'brand' },
  MASTERED: { label: "You've got this mastered!", tone: 'success' },
};

/**
 * What the learner has done and what they're getting better at — in plain
 * language, no jargon.
 *
 * The four totals lead as big coloured counters rather than grey captions,
 * because "how much have I done" is the question this page exists to answer.
 * Below them, per-topic work is drawn as a bar rather than a bare percentage:
 * a nine-year-old reads a filled bar instantly and a number slowly. Mastery and
 * assignment state keep the semantic tones — those genuinely mean something —
 * while the decorative rotation is confined to the counters and topic rows.
 */
export function StudentProgressPage() {
  useDocumentTitle('My progress');
  const profile = useProfile();

  const summaryQuery = useQuery({
    queryKey: qk.progress.summary({ groupBy: 'TOPIC' }),
    queryFn: () => fetchProgressSummary({ groupBy: 'TOPIC' }),
  });

  const gamificationQuery = useQuery({
    queryKey: qk.gamification.profile(),
    queryFn: () => fetchGamificationProfile(),
  });

  const masteryQuery = useQuery({
    queryKey: qk.assessment.mastery(profile?.id ?? 'self'),
    queryFn: () => fetchStudentMastery(profile?.id as string),
    enabled: Boolean(profile?.id),
  });

  const myWorkQuery = useQuery({
    queryKey: qk.assignments.myWork,
    queryFn: () => fetchMyWork(),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My progress" description="What you have learned so far." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Activities completed"
          icon={<IconActivity className="h-5 w-5" />}
          accentIndex={4}
          value={summaryQuery.data?.totals.activitiesCompleted}
        />
        <StatCard
          label="Attempts"
          icon={<IconProgress className="h-5 w-5" />}
          accentIndex={0}
          value={summaryQuery.data?.totals.attempts}
        />
        <StatCard
          label="Time learning"
          icon={<IconTime className="h-5 w-5" />}
          accentIndex={5}
          value={
            summaryQuery.data
              ? `${Math.round(summaryQuery.data.totals.timeSpentSeconds / 60)} min`
              : undefined
          }
        />
        <StatCard
          label="Badges earned"
          icon={<IconBadge className="h-5 w-5" />}
          accentIndex={1}
          value={gamificationQuery.data?.badges.earned.length}
        />
      </div>

      <Card>
        <CardHeader title="By topic" description="How far through each topic you are." />
        <CardBody>
          <QueryBoundary
            isLoading={summaryQuery.isPending}
            error={summaryQuery.error}
            isEmpty={summaryQuery.data?.groups.length === 0}
            emptyState={
              <EmptyState
                icon={<IconProgress aria-hidden className="h-8 w-8 text-play-5" />}
                title="Your first activity is waiting"
                description="Finish one and it will show up here — this page fills up fast."
              />
            }
          >
            <div className="flex flex-col gap-3">
              {summaryQuery.data?.groups.map((group, index) => {
                const accent = playAccent(index);
                const percent = group.activities > 0 ? (group.completed / group.activities) * 100 : 0;

                return (
                  <div
                    key={group.key}
                    className={cn('flex flex-col gap-2 rounded-lg border-l-4 p-4', accent.borderLeft, accent.surface)}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className={cn(text.heading, 'text-lg')}>{group.label}</p>
                      {group.averageBestScorePercent !== null ? (
                        <Badge tone="brand" variant="solid">
                          {Math.round(group.averageBestScorePercent)}% average
                        </Badge>
                      ) : null}
                    </div>
                    <ProgressBar
                      label={`${group.completed} of ${group.activities} activities`}
                      value={percent}
                      showValue={false}
                      tone={percent >= 100 ? 'success' : 'brand'}
                    />
                  </div>
                );
              })}
            </div>
          </QueryBoundary>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your mastery by topic" description="How well you know each topic right now." />
        <CardBody>
          <QueryBoundary
            isLoading={masteryQuery.isPending}
            error={masteryQuery.error}
            isEmpty={masteryQuery.data?.topics.length === 0}
            emptyState={
              <EmptyState
                title="Nothing to show yet"
                description="Keep working through activities and this will fill in on its own."
              />
            }
          >
            <div className="flex flex-col gap-2">
              {masteryQuery.data?.topics.map((record) => {
                const copy = MASTERY_COPY[record.level];
                return (
                  <div
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken px-4 py-3"
                  >
                    <p className="font-medium text-ink">{record.topic.name}</p>
                    <Badge tone={copy.tone} variant="solid">
                      {copy.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </QueryBoundary>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What's next" description="Work you've started or still need to hand in." />
        <CardBody>
          <QueryBoundary
            isLoading={myWorkQuery.isPending}
            error={myWorkQuery.error}
            isEmpty={myWorkQuery.data?.upcoming.length === 0}
            emptyState={
              <EmptyState
                icon={<IconAssignment aria-hidden className="h-8 w-8 text-play-5" />}
                title="You're all caught up!"
                description="Nothing waiting on you right now. Enjoy it."
              />
            }
          >
            <div className="flex flex-col gap-2">
              {myWorkQuery.data?.upcoming.slice(0, 5).map((attempt) => {
                const isOverdue = attempt.state === 'OVERDUE';
                return (
                  <div
                    key={attempt.id}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3',
                      isOverdue ? 'bg-danger-soft' : 'bg-surface-sunken',
                    )}
                  >
                    <div>
                      <p className="font-medium text-ink">{attempt.assignment.title}</p>
                      <p className="text-sm text-ink-muted">
                        {attempt.assignment.dueAt ? `Due ${formatRelative(attempt.assignment.dueAt)}` : 'No due date'}
                      </p>
                    </div>
                    <Badge tone={isOverdue ? 'danger' : 'neutral'} variant={isOverdue ? 'solid' : 'soft'}>
                      {attempt.state.replace('_', ' ').toLowerCase()}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </QueryBoundary>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Streaks" description="Keep them going!" />
        <CardBody>
          <QueryBoundary isLoading={gamificationQuery.isPending} error={gamificationQuery.error}>
            <div className="flex flex-wrap gap-3">
              {gamificationQuery.data?.streaks.map((streak) => (
                <div
                  key={streak.kind}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-2 px-4 py-3',
                    streak.atRisk
                      ? 'border-warning-muted bg-warning-soft'
                      : 'border-success-muted bg-success-soft',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-full',
                      streak.atRisk
                        ? 'bg-warning text-warning-contrast'
                        : 'bg-success text-success-contrast',
                    )}
                  >
                    <IconStreak className="h-5 w-5" />
                  </span>
                  <div>
                    <p className={cn(text.heading, 'text-xl tabular-nums')}>
                      {streak.currentLength}
                      <span className="ml-1 text-sm font-medium text-ink-muted">days</span>
                    </p>
                    <p className="text-xs font-medium text-ink">
                      {streak.kind.replace('_', ' ').toLowerCase()}
                      {streak.atRisk ? ' · keep it alive today' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accentIndex,
}: {
  label: string;
  value: string | number | undefined;
  icon: ReactNode;
  accentIndex: number;
}) {
  const accent = playAccent(accentIndex);

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border-2 p-4 shadow-sm', accent.borderSoft, accent.surface)}>
      <span
        aria-hidden
        className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full', accent.chip)}
      >
        {icon}
      </span>
      <p className={cn(text.heading, 'text-3xl tabular-nums')}>{value ?? '—'}</p>
      <p className="text-sm font-medium text-ink">{label}</p>
    </div>
  );
}
