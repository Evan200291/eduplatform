import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconAssignment,
  IconClass,
  IconLearningPath,
  IconNotifications,
  IconSuccess,
  IconTime,
  IconWarning,
  PageHeader,
  ProgressBar,
  Select,
  focusRing,
  text,
  type LucideIcon,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { useCan, useProfile } from '@/auth';
import { fetchTeacherDashboard } from '@/dashboard/dashboard.api';
import { fetchMyClasses } from '@/academic/academic.api';
import type { AttentionEntry } from '@/dashboard/dashboard.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize } from '../lib/humanize';
import type { StudentNavState } from '../lib/nav-state';

const SEVERITY_TONE = { LOW: 'info', MEDIUM: 'warning', HIGH: 'danger' } as const;

/**
 * The teacher's "start my day" home screen (blueprint §04): what needs a
 * decision now — students slipping, work waiting to be marked, recommendations
 * to approve — ahead of the roster of classes underneath it.
 */
export function TeacherDashboardPage() {
  useDocumentTitle('Dashboard');
  const profile = useProfile();
  const canSeeRecommendations = useCan('recommendation.read');
  const [classId, setClassId] = useState('');

  const classesQuery = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });
  const dashboardQuery = useQuery({
    queryKey: [...qk.dashboard.teacher, classId || 'all'],
    queryFn: () => fetchTeacherDashboard({ classId: classId || undefined, attentionLimit: 8 }),
  });

  const data = dashboardQuery.data;
  const firstName = profile?.nickname ?? profile?.firstName ?? '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Your dashboard'}
        description="What needs a look today, across the classes you teach."
        actions={
          <Field label="Class" isLabelHidden className="w-48">
            <Select
              placeholder="All classes"
              options={(classesQuery.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            />
          </Field>
        }
      />

      <QueryBoundary
        isLoading={dashboardQuery.isPending}
        error={dashboardQuery.error}
        onRetry={() => void dashboardQuery.refetch()}
      >
        {data ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                icon={IconWarning}
                accent="attention"
                label="Needs attention"
                value={data.attention.total}
                to={paths.teach.students}
              />
              <StatCard
                icon={IconAssignment}
                accent="marking"
                label="Awaiting marking"
                value={data.assignments.awaitingMarking}
                to={paths.teach.assignments}
              />
              <StatCard
                icon={IconTime}
                accent="overdue"
                label="Overdue attempts"
                value={data.assignments.overdueAttempts}
                to={paths.teach.assignments}
              />
              <StatCard
                icon={IconAssignment}
                accent="due"
                label="Due this week"
                value={data.assignments.dueThisWeek}
                to={paths.teach.assignments}
              />
              {canSeeRecommendations ? (
                <StatCard
                  icon={IconLearningPath}
                  accent="approve"
                  label="To approve"
                  value={data.recommendations.pending}
                  to={paths.teach.recommendations}
                />
              ) : null}
              <StatCard
                icon={IconNotifications}
                accent="messages"
                label="Unread messages"
                value={data.notifications.unread}
                to={paths.teach.notifications}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Needs your attention"
                  description={
                    data.attention.total > data.attention.shown
                      ? `Showing ${data.attention.shown} of ${data.attention.total}`
                      : 'Learners with a signal worth a look'
                  }
                />
                <CardBody className="p-0">
                  {data.attention.students.length === 0 ? (
                    <EmptyState
                      icon={<IconSuccess className="h-8 w-8" />}
                      title="Nobody needs a look right now"
                      description="Every learner in scope is on track."
                      className="border-none py-8"
                    />
                  ) : (
                    <ul className="divide-y divide-line">
                      {data.attention.students.map((entry) => (
                        <AttentionRow key={entry.studentId} entry={entry} classId={classId} />
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <div className="flex flex-col gap-6">
                <Card className="border-primary-muted bg-primary-soft">
                  <CardBody className="flex flex-col gap-3">
                    <p className={cn(text.eyebrow, 'text-primary-strong')}>Assignment completion</p>
                    <ProgressBar
                      value={data.assignments.completion.percent ?? 0}
                      label={data.assignments.completion.label}
                    />
                    <p className="text-xs text-ink-muted">
                      {data.assignments.published} published assignment(s)
                    </p>
                  </CardBody>
                </Card>

                {data.masteryGaps.length > 0 ? (
                  <Card>
                    <CardHeader title="Mastery gaps" description="Topics several learners are struggling with" />
                    <CardBody className="flex flex-col divide-y divide-line">
                      {data.masteryGaps.map((gap) => (
                        <div
                          key={gap.topicId}
                          className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                        >
                          <span className="truncate text-ink">{gap.topicName}</span>
                          <Badge tone="warning">{gap.learners} learner(s)</Badge>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                ) : null}

                {data.celebrations.length > 0 ? (
                  <Card className="border-success-muted bg-success-soft">
                    <CardHeader title="Worth celebrating" />
                    <CardBody className="flex flex-col gap-2">
                      {data.celebrations.map((entry) => (
                        <div key={entry.studentId} className="flex items-center gap-2 text-sm">
                          <Avatar name={entry.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-ink">{entry.displayName}</p>
                            {entry.headline ? (
                              <p className="truncate text-xs text-success-strong">{entry.headline.interpretation}</p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                ) : null}
              </div>
            </div>

            <Card>
              <CardHeader title="Your classes" description={`${data.classes.length} class(es)`} />
              <CardBody className="p-0">
                {data.classes.length === 0 ? (
                  <EmptyState
                    icon={<IconClass className="h-8 w-8" />}
                    title="No classes yet"
                    className="border-none py-6"
                  />
                ) : (
                  <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.classes.map((klass) => (
                      <li key={klass.classId}>
                        <Link
                          to={paths.teach.classDetail(klass.classId)}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3 text-sm',
                            'transition-colors duration-fast ease-standard',
                            'hover:border-primary-muted hover:bg-primary-soft',
                            focusRing,
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-play-1-soft text-play-1"
                            >
                              <IconClass aria-hidden className="h-4 w-4" />
                            </span>
                            <span className="truncate font-medium text-ink">{klass.name}</span>
                          </span>
                          <Badge tone="neutral">{klass.studentCount}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

/**
 * Tile accents, split the same way the admin overview splits them: the two
 * genuinely urgent queues keep the semantic state tones, and the rest of the row
 * uses the decorative set so six tiles are distinguishable at a glance without
 * six of them shouting.
 */
const TILE_ACCENTS = {
  attention: 'bg-warning-soft text-warning-strong',
  overdue: 'bg-danger-soft text-danger-strong',
  marking: 'bg-play-2-soft text-play-2',
  due: 'bg-play-1-soft text-play-1',
  approve: 'bg-play-5-soft text-play-5',
  messages: 'bg-play-6-soft text-play-6',
} as const;

function StatCard({
  icon: Icon,
  accent,
  label,
  value,
  to,
}: {
  icon: LucideIcon;
  accent: keyof typeof TILE_ACCENTS;
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm',
        'transition-[box-shadow,border-color,transform] duration-fast ease-standard',
        'hover:-translate-y-0.5 hover:border-primary-muted hover:shadow-md',
        focusRing,
      )}
    >
      <span
        aria-hidden
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', TILE_ACCENTS[accent])}
      >
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className="block">
        <span className={cn(text.heading, 'block text-2xl tabular-nums')}>{value}</span>
        <span className={cn(text.eyebrow, 'mt-1 block')}>{label}</span>
      </span>
    </Link>
  );
}

function AttentionRow({ entry, classId }: { entry: AttentionEntry; classId: string }) {
  const state: StudentNavState = { displayName: entry.displayName, classId: classId || undefined };
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-fast ease-standard hover:bg-surface-sunken">
      <Link
        to={paths.teach.studentDetail(entry.studentId)}
        state={state}
        className={cn('flex min-w-0 items-center gap-3 rounded-md', focusRing)}
      >
        <Avatar name={entry.displayName} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{entry.displayName}</p>
          {entry.headline ? (
            <p className="truncate text-xs text-ink-muted">{entry.headline.interpretation}</p>
          ) : (
            <p className="truncate text-xs text-ink-muted">{humanize(entry.engagementLabel)}</p>
          )}
        </div>
      </Link>
      {entry.headline ? (
        <Badge tone={SEVERITY_TONE[entry.headline.severity]}>{humanize(entry.headline.reason)}</Badge>
      ) : null}
    </li>
  );
}
