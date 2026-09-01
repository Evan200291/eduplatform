import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  IconAssignment,
  IconInvite,
  IconSupport,
  IconUsers,
  IconWarning,
  PageHeader,
  ProgressBar,
  panel,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { fetchSchoolDashboard } from '@/dashboard/dashboard.api';

/** The school-level dashboard: is the school set up, is learning happening, what needs a human. */
export function AdminOverviewPage() {
  useDocumentTitle('Overview');

  const query = useQuery({
    queryKey: qk.dashboard.school,
    queryFn: fetchSchoolDashboard,
  });

  const data = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data ? data.school.name : 'Overview'}
        description="Your school at a glance."
      />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {data ? (
          <div className="flex flex-col gap-6">
            <section aria-labelledby="people-heading" className="flex flex-col gap-3">
              <h2 id="people-heading" className={text.eyebrow}>
                People
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Students" value={data.people.students} icon={IconUsers} accent="play-1" />
                <Stat label="Teachers" value={data.people.teachers} icon={IconUsers} accent="play-2" />
                <Stat label="Staff" value={data.people.staff} icon={IconUsers} accent="play-6" />
                <Stat label="Invited" value={data.people.invited} icon={IconInvite} accent="play-4" />
                <Stat
                  label="Suspended"
                  value={data.people.suspended}
                  icon={IconWarning}
                  accent="play-3"
                />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Structure" />
                <CardBody className="flex flex-col divide-y divide-line text-sm">
                  <Row label="Grades" value={data.structure.grades} />
                  <Row label="Subjects" value={data.structure.subjects} />
                  <Row label="Classes" value={data.structure.classes} />
                  <Row
                    label="Current term"
                    value={data.structure.activeTerm?.name ?? 'None active'}
                  />
                  <Row label="Learners without a class" value={data.structure.learnersWithoutClass} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Engagement" />
                <CardBody className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-col divide-y divide-line">
                    <Row label="Active this week" value={data.engagement.activeThisWeek} />
                    <Row label="Needing attention" value={data.engagement.needingAttention} />
                  </div>
                  {data.engagement.buckets.map((bucket) => (
                    <ProgressBar
                      key={bucket.level}
                      label={bucket.label}
                      value={
                        data.engagement.activeThisWeek > 0
                          ? (bucket.count / Math.max(1, data.scope.learnerCount)) * 100
                          : 0
                      }
                    />
                  ))}
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title="Learning" />
              <CardBody className="flex flex-col gap-4 text-sm">
                <ProgressBar
                  label={data.learning.completion.label}
                  value={data.learning.completion.percent ?? 0}
                />
                <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                  <Row label="Screening outstanding" value={data.learning.screeningOutstanding} />
                  <Row label="Onboarding outstanding" value={data.learning.onboardingOutstanding} />
                </div>
                {data.learning.masteryGaps.length > 0 ? (
                  <div>
                    <p className={cn(text.eyebrow, 'mb-2')}>Topics with the most learners stuck</p>
                    <div className="flex flex-wrap gap-2">
                      {data.learning.masteryGaps.map((gap) => (
                        <Badge key={gap.topicId} tone="warning">
                          {gap.topicName} · {gap.learners}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Waiting on someone"
                description="Queues that only clear when a person acts."
              />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat
                  className="bg-surface-sunken shadow-none"
                  label="Paths awaiting approval"
                  value={data.waiting.pathsAwaitingApproval}
                  icon={IconAssignment}
                  accent="info"
                />
                <Stat
                  className="bg-surface-sunken shadow-none"
                  label="Submissions to mark"
                  value={data.waiting.submissionsAwaitingMarking}
                  icon={IconAssignment}
                  accent="warning"
                />
                <Stat
                  className="bg-surface-sunken shadow-none"
                  label="Open support tickets"
                  value={data.waiting.openSupportTickets}
                  icon={IconSupport}
                  accent="danger"
                />
              </CardBody>
            </Card>

            {data.subscription ? (
              <Card>
                <CardHeader title="Subscription" description={`${data.subscription.plan} · ${data.subscription.status}`} />
                <CardBody className="flex flex-col gap-3">
                  {data.subscription.seats ? (
                    <>
                      <ProgressBar
                        label={`Students: ${data.subscription.seats.studentsUsed} of ${data.subscription.seats.studentsLicensed || '∞'}`}
                        value={
                          data.subscription.seats.studentsLicensed > 0
                            ? (data.subscription.seats.studentsUsed /
                                data.subscription.seats.studentsLicensed) *
                              100
                            : 0
                        }
                        tone={data.subscription.seats.overStudentSeats ? 'warning' : 'brand'}
                      />
                      <ProgressBar
                        label={`Teachers: ${data.subscription.seats.teachersUsed} of ${data.subscription.seats.teachersLicensed || '∞'}`}
                        value={
                          data.subscription.seats.teachersLicensed > 0
                            ? (data.subscription.seats.teachersUsed /
                                data.subscription.seats.teachersLicensed) *
                              100
                            : 0
                        }
                        tone={data.subscription.seats.overTeacherSeats ? 'warning' : 'brand'}
                      />
                    </>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </div>
  );
}

/**
 * Two families of tile accent, used deliberately for two different jobs.
 *
 * The `play-*` entries are decorative: the people row is a taxonomy — students,
 * teachers, staff — where the colour exists only so five tiles are not five
 * identical grey rectangles. The semantic entries below them are the opposite:
 * on the "waiting on someone" row the colour *is* the message, so those tiles
 * borrow the state tones instead.
 */
const TILE_ACCENTS = {
  'play-1': 'bg-play-1-soft text-play-1',
  'play-2': 'bg-play-2-soft text-play-2',
  'play-3': 'bg-play-3-soft text-play-3',
  'play-4': 'bg-play-4-soft text-play-4',
  'play-5': 'bg-play-5-soft text-play-5',
  'play-6': 'bg-play-6-soft text-play-6',
  info: 'bg-secondary-soft text-secondary-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
} as const;

type TileAccent = keyof typeof TILE_ACCENTS;

function Stat({
  label,
  value,
  icon: Icon,
  accent,
  className,
}: {
  label: string;
  value: number;
  icon: typeof IconUsers;
  accent: TileAccent;
  /** Lets a tile drop its own chrome when it is already sitting inside a card. */
  className?: string;
}) {
  return (
    <div className={cn(panel, 'flex flex-col gap-3 p-4', className)}>
      <span
        aria-hidden
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', TILE_ACCENTS[accent])}
      >
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <div>
        {/* The figure is the reason the tile exists, so it gets the display
         * size and the label drops to a quiet eyebrow underneath it. */}
        <p className={cn(text.heading, 'text-2xl tabular-nums')}>{value}</p>
        <p className={cn(text.eyebrow, 'mt-1')}>{label}</p>
      </div>
    </div>
  );
}

/** One label/value line. Used in a `divide-y` list so long runs stay scannable. */
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <span className="text-ink-muted">{label}</span>
      <span className="shrink-0 font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}
