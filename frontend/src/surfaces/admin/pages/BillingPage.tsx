import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  type BadgeTone,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconBilling,
  IconCalendar,
  IconUsers,
  PageHeader,
  ProgressBar,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatNumber } from '@/lib/format';
import { fetchCurrentSubscription } from '@/subscription/subscription.api';
import type { SubscriptionState } from '@/subscription/subscription.types';

/** A short label + tone for the subscription's derived lifecycle state. */
function stateBadge(state: SubscriptionState): { label: string; tone: BadgeTone } {
  if (state.isCancelled) return { label: 'Cancelled', tone: 'danger' };
  if (state.hasExpired) return { label: 'Expired', tone: 'danger' };
  if (state.isPastDue) return { label: 'Past due', tone: 'warning' };
  if (state.inTrial) return { label: 'Trial', tone: 'info' };
  return { label: state.entitlesFeatures ? 'Active' : 'Inactive', tone: state.entitlesFeatures ? 'success' : 'neutral' };
}

/** The school's plan, seat usage and what it does not yet include. */
export function BillingPage() {
  useDocumentTitle('Subscription');

  const query = useQuery({ queryKey: qk.subscriptions.current, queryFn: fetchCurrentSubscription });
  const data = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subscription" description="Your plan, seats in use, and what's included." />

      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {data ? (
          data.subscription ? (
            <div className="flex flex-col gap-6">
              <Card className="border-primary-muted bg-primary-soft/40">
                <CardBody className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                      <IconBilling aria-hidden className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm text-ink-muted">Current plan</p>
                      <p className="text-lg font-semibold text-ink">{data.plan?.name ?? data.subscription.plan}</p>
                    </div>
                  </div>
                  {data.state ? (
                    <Badge tone={stateBadge(data.state).tone}>{stateBadge(data.state).label}</Badge>
                  ) : null}
                </CardBody>
              </Card>

              {data.state?.needsAttention ? (
                <Alert tone="warning" title="Needs attention">
                  {data.state.needsAttention}
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <InfoTile
                  icon={IconCalendar}
                  label="Renews"
                  value={data.subscription.renewsAt ? formatDate(data.subscription.renewsAt) : '—'}
                />
                <InfoTile icon={IconCalendar} label="Started" value={formatDate(data.subscription.startsAt)} />
                <InfoTile
                  icon={IconUsers}
                  label="Interval"
                  value={data.subscription.interval.charAt(0) + data.subscription.interval.slice(1).toLowerCase()}
                />
              </div>

              {data.seats ? (
                <Card>
                  <CardHeader title="Seats" description="Licensed vs. used." />
                  <CardBody className="flex flex-col gap-4">
                    <ProgressBar
                      label={`Students: ${formatNumber(data.seats.studentsUsed)} of ${
                        data.seats.studentsLicensed || '∞'
                      }`}
                      value={
                        data.seats.studentsLicensed > 0
                          ? (data.seats.studentsUsed / data.seats.studentsLicensed) * 100
                          : 0
                      }
                      tone={data.seats.overStudentSeats ? 'warning' : 'brand'}
                    />
                    <ProgressBar
                      label={`Teachers: ${formatNumber(data.seats.teachersUsed)} of ${
                        data.seats.teachersLicensed || '∞'
                      }`}
                      value={
                        data.seats.teachersLicensed > 0
                          ? (data.seats.teachersUsed / data.seats.teachersLicensed) * 100
                          : 0
                      }
                      tone={data.seats.overTeacherSeats ? 'warning' : 'brand'}
                    />
                  </CardBody>
                </Card>
              ) : null}

              {data.gatedFeatures.length > 0 ? (
                <Card>
                  <CardHeader title="Not included on this plan" />
                  <CardBody className="flex flex-wrap gap-2">
                    {data.gatedFeatures.map((feature) => (
                      <Badge key={feature.key} tone="neutral">
                        {feature.name}
                      </Badge>
                    ))}
                  </CardBody>
                </Card>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<IconBilling className="h-8 w-8" aria-hidden />}
              title="No active subscription"
              description="This school has no subscription on record."
            />
          )
        ) : null}
      </QueryBoundary>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IconCalendar;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-soft text-secondary-strong">
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}
