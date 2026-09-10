import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  type Column,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconBilling,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatNumber } from '@/lib/format';
import {
  cancelSubscription,
  createSubscription,
  fetchPlans,
  fetchSubscriptions,
  renewSubscription,
  updateSubscription,
} from '@/subscription/subscription.api';
import { fetchOrganizations, fetchSchools } from '@/tenancy/tenancy.api';
import type {
  BillingInterval,
  PlanPackaging,
  SubscriptionDetail,
  SubscriptionPlan,
  SubscriptionState,
  SubscriptionStatus,
  SubscriptionTermsInput,
} from '@/subscription/subscription.types';

/**
 * Commercial agreements across every customer (blueprint 09).
 *
 * The school admin's Subscription page is read-only on purpose — a school
 * cannot upgrade itself by pressing a button. This is the other side: billing
 * and platform staff holding `subscription.write` record the contract, renew
 * it, and cancel it with a reason. Money is entered in major units and sent as
 * integer minor units, so a per-student price is never a float.
 */

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: 'Trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

const INTERVAL_OPTIONS: { value: BillingInterval; label: string }[] = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'CUSTOM', label: 'Custom term' },
];

const EXPIRING_OPTIONS = [
  { value: '', label: 'Any end date' },
  { value: '30', label: 'Ending within 30 days' },
  { value: '90', label: 'Ending within 90 days' },
  { value: '180', label: 'Ending within 6 months' },
];

function stateLabel(state: SubscriptionState): { label: string; tone: BadgeTone } {
  if (state.isCancelled) return { label: 'Cancelled', tone: 'danger' };
  if (state.hasExpired) return { label: 'Expired', tone: 'danger' };
  if (state.isPastDue) return { label: 'Past due', tone: 'warning' };
  if (state.inTrial) return { label: 'Trial', tone: 'info' };
  return state.entitlesFeatures ? { label: 'Active', tone: 'success' } : { label: 'Inactive', tone: 'neutral' };
}

function money(minor: number | null, currency: string): string {
  if (minor === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** "12.50" → 1250. Empty stays empty; anything unparseable is NaN so the form can block it. */
function toMinor(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

function dateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

export function AgreementsPage() {
  useDocumentTitle('Agreements');
  const canWrite = useCan('subscription.write');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [expiring, setExpiring] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SubscriptionDetail | null>(null);
  const [renewing, setRenewing] = useState<SubscriptionDetail | null>(null);
  const [cancelling, setCancelling] = useState<SubscriptionDetail | null>(null);

  const params = {
    status: (status || undefined) as SubscriptionStatus | undefined,
    plan: (plan || undefined) as SubscriptionPlan | undefined,
    expiringWithinDays: expiring ? Number(expiring) : undefined,
    page,
    pageSize: 20,
  };
  const query = useQuery({ queryKey: qk.subscriptions.list(params), queryFn: () => fetchSubscriptions(params) });
  const plans = useQuery({ queryKey: qk.plans.all, queryFn: fetchPlans });
  const schools = useQuery({
    queryKey: qk.schools.list({ pageSize: 100 }),
    queryFn: () => fetchSchools({ pageSize: 100 }),
  });
  const organizations = useQuery({
    queryKey: qk.organizations.list({ pageSize: 100 }),
    queryFn: () => fetchOrganizations({ pageSize: 100 }),
  });

  const planList = plans.data?.plans ?? [];
  const planName = (key: SubscriptionPlan) => planList.find((entry) => entry.plan === key)?.name ?? key;
  const customer = (row: SubscriptionDetail) => {
    const { schoolId, organizationId } = row.subscription;
    if (schoolId) return schools.data?.items.find((s) => s.id === schoolId)?.name ?? 'School';
    if (organizationId) {
      return organizations.data?.items.find((o) => o.id === organizationId)?.name ?? 'Organization';
    }
    return '—';
  };

  const rows = query.data?.items ?? [];
  const columns: Column<SubscriptionDetail>[] = [
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <span>
          <span className="text-ink">{customer(row)}</span>
          <span className="block text-xs text-ink-muted">
            {row.subscription.schoolId ? 'School' : 'Organization'}
            {row.subscription.purchaseOrderRef ? ` · PO ${row.subscription.purchaseOrderRef}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'plan', header: 'Plan', render: (row) => planName(row.subscription.plan) },
    {
      key: 'state',
      header: 'State',
      render: (row) => {
        const badge = stateLabel(row.state);
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {row.state.needsAttention ? (
              <span className="text-xs text-warning-strong">{row.state.needsAttention}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'seats',
      header: 'Learner seats',
      className: 'hidden md:table-cell',
      render: (row) =>
        row.seats
          ? `${formatNumber(row.seats.studentsUsed)} of ${row.seats.studentsLicensed ? formatNumber(row.seats.studentsLicensed) : 'unmetered'}${row.seats.overStudentSeats ? ' — over' : ''}`
          : `${formatNumber(row.subscription.licensedStudentSeats)} licensed`,
    },
    {
      key: 'price',
      header: 'Per learner',
      className: 'hidden lg:table-cell',
      render: (row) => money(row.subscription.pricePerStudentMinor, row.subscription.currency),
    },
    {
      key: 'ends',
      header: 'Ends',
      className: 'hidden sm:table-cell',
      render: (row) =>
        row.subscription.endsAt ? (
          <span>
            {formatDate(row.subscription.endsAt)}
            {row.state.daysRemaining !== null && row.state.daysRemaining >= 0 ? (
              <span className="block text-xs text-ink-muted">{row.state.daysRemaining} days left</span>
            ) : null}
          </span>
        ) : (
          'No end date'
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canWrite ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRenewing(row)}>
              Renew
            </Button>
            {row.subscription.status !== 'CANCELLED' ? (
              <Button size="sm" variant="ghost" onClick={() => setCancelling(row)}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agreements"
        description="Every customer's plan, term, seats and price — and the renewals coming up."
        actions={
          canWrite ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New agreement
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader title="Filters" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select
              value={status}
              placeholder="Any status"
              options={STATUS_OPTIONS}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Plan">
            <Select
              value={plan}
              placeholder="Any plan"
              options={planList.map((entry) => ({ value: entry.plan, label: entry.name }))}
              onChange={(event) => {
                setPlan(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Renewal">
            <Select
              value={expiring}
              options={EXPIRING_OPTIONS}
              onChange={(event) => {
                setExpiring(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={
            <EmptyState
              icon={<IconBilling aria-hidden className="h-8 w-8" />}
              title="No agreements match"
              description={status || plan || expiring ? 'Try clearing a filter.' : 'Record the first one with New agreement.'}
            />
          }
        >
          <DataTable columns={columns} rows={rows} getRowKey={(row) => row.subscription.id} caption="Agreements" />
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
        </QueryBoundary>
      </Card>

      {planList.length > 0 ? <PlanComparison plans={planList} /> : null}

      {creating ? (
        <TermsModal
          plans={planList}
          schools={(schools.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          organizations={(organizations.data?.items ?? []).map((o) => ({ value: o.id, label: o.name }))}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TermsModal plans={planList} existing={editing} onClose={() => setEditing(null)} />
      ) : null}
      {renewing ? <RenewModal plans={planList} detail={renewing} onClose={() => setRenewing(null)} /> : null}
      {cancelling ? <CancelModal detail={cancelling} onClose={() => setCancelling(null)} /> : null}
    </div>
  );
}

/** What each plan contains. Shared with the school admin's Subscription page. */
export function PlanComparison({ plans, current }: { plans: PlanPackaging[]; current?: SubscriptionPlan | null }) {
  return (
    <Card>
      <CardHeader title="Plans" description="What each plan is for and which features it includes." />
      <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((entry) => (
          <div
            key={entry.plan}
            className={`flex flex-col gap-2 rounded-lg border p-4 ${
              entry.plan === current ? 'border-primary bg-primary-soft/40' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">{entry.name}</p>
              {entry.plan === current ? <Badge tone="brand">Your plan</Badge> : null}
            </div>
            <p className="text-sm text-ink-muted">{entry.intendedCustomer}</p>
            <p className="text-sm text-ink">{entry.illustrativeScope}</p>
            <p className="text-xs text-ink-muted">Support: {entry.supportLevel}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-primary-strong">
                {entry.includedFeatures.length} features included
              </summary>
              <ul className="mt-2 list-disc pl-5 text-ink">
                {entry.includedFeatures.map((feature) => (
                  <li key={feature.key}>{feature.name}</li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

interface Option {
  value: string;
  label: string;
}

function TermsModal({
  plans,
  existing,
  schools = [],
  organizations = [],
  onClose,
}: {
  plans: PlanPackaging[];
  existing?: SubscriptionDetail;
  schools?: Option[];
  organizations?: Option[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const row = existing?.subscription;
  const [attachTo, setAttachTo] = useState<'school' | 'organization'>('school');
  const [targetId, setTargetId] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>(row?.plan ?? 'STARTER');
  const [status, setStatus] = useState<SubscriptionStatus>(row?.status ?? 'ACTIVE');
  const [interval, setBillingInterval] = useState<BillingInterval>(row?.interval ?? 'ANNUAL');
  const [studentSeats, setStudentSeats] = useState(String(row?.licensedStudentSeats ?? 0));
  const [teacherSeats, setTeacherSeats] = useState(String(row?.licensedTeacherSeats ?? 0));
  const [studentPrice, setStudentPrice] = useState(
    row?.pricePerStudentMinor != null ? (row.pricePerStudentMinor / 100).toFixed(2) : '',
  );
  const [teacherPrice, setTeacherPrice] = useState(
    row?.pricePerTeacherMinor != null ? (row.pricePerTeacherMinor / 100).toFixed(2) : '',
  );
  const [currency, setCurrency] = useState(row?.currency ?? 'GBP');
  const [startsAt, setStartsAt] = useState(dateOnly(row?.startsAt) || new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(dateOnly(row?.endsAt));
  const [trialEndsAt, setTrialEndsAt] = useState(dateOnly(row?.trialEndsAt));
  const [autoRenew, setAutoRenew] = useState(row?.autoRenew ?? false);
  const [poRef, setPoRef] = useState(row?.purchaseOrderRef ?? '');
  const [invoiceEmail, setInvoiceEmail] = useState(row?.invoiceEmail ?? '');
  const [notes, setNotes] = useState(row?.notes ?? '');

  const planEntry = plans.find((entry) => entry.plan === plan);
  const studentMinor = toMinor(studentPrice);
  const teacherMinor = toMinor(teacherPrice);

  const terms: SubscriptionTermsInput = {
    plan,
    status,
    interval,
    licensedStudentSeats: Number(studentSeats),
    licensedTeacherSeats: Number(teacherSeats),
    pricePerStudentMinor: studentMinor,
    pricePerTeacherMinor: teacherMinor,
    currency: currency.trim().toUpperCase(),
    startsAt,
    endsAt: endsAt || null,
    trialEndsAt: trialEndsAt || null,
    autoRenew,
    ...(poRef.trim() ? { purchaseOrderRef: poRef.trim() } : {}),
    ...(invoiceEmail.trim() ? { invoiceEmail: invoiceEmail.trim() } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  };

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> =>
      row
        ? updateSubscription(row.id, terms)
        : createSubscription({
            ...terms,
            ...(attachTo === 'school' ? { schoolId: targetId } : { organizationId: targetId }),
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      onClose();
    },
  });

  const seat = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 200_000;
  const blockedReason =
    !row && !targetId
      ? `Choose the ${attachTo}.`
      : !seat(studentSeats) || !seat(teacherSeats)
        ? 'Seats are whole numbers, 0 to 200,000. 0 means not metered.'
        : Number.isNaN(studentMinor) || Number.isNaN(teacherMinor) || (studentMinor ?? 0) < 0 || (teacherMinor ?? 0) < 0
          ? 'Prices are amounts such as 12.50.'
          : !/^[A-Za-z]{3}$/.test(currency.trim())
            ? 'Use a three-letter currency code such as GBP.'
            : !startsAt
              ? 'Add a start date.'
              : planEntry?.requiresEndDate && !endsAt
                ? `${planEntry.name} agreements need an end date.`
                : endsAt && endsAt <= startsAt
                  ? 'The contract must end after it starts.'
                  : trialEndsAt && trialEndsAt < startsAt
                    ? 'A trial cannot end before the contract starts.'
                    : invoiceEmail.trim() && !/^\S+@\S+\.\S+$/.test(invoiceEmail.trim())
                      ? 'Check the invoice email.'
                      : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title={row ? 'Edit agreement' : 'New agreement'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            {row ? 'Save' : 'Record agreement'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        {!row ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Attach to" hint="Multi-school agreements sit on the organization.">
              <Select
                value={attachTo}
                onChange={(event) => {
                  setAttachTo(event.target.value as 'school' | 'organization');
                  setTargetId('');
                }}
                options={[
                  { value: 'school', label: 'A school' },
                  { value: 'organization', label: 'An organization' },
                ]}
              />
            </Field>
            <Field label={attachTo === 'school' ? 'School' : 'Organization'} isRequired>
              <Select
                value={targetId}
                placeholder="Choose"
                onChange={(event) => setTargetId(event.target.value)}
                options={attachTo === 'school' ? schools : organizations}
              />
            </Field>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Plan">
            <Select
              value={plan}
              onChange={(event) => {
                const next = event.target.value as SubscriptionPlan;
                setPlan(next);
                const entry = plans.find((p) => p.plan === next);
                if (entry && !row) {
                  setBillingInterval(entry.defaultInterval);
                  if (entry.suggestedStudentSeats !== null) setStudentSeats(String(entry.suggestedStudentSeats));
                }
              }}
              options={plans.map((entry) => ({ value: entry.plan, label: entry.name }))}
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as SubscriptionStatus)}
              options={STATUS_OPTIONS.filter((option) => option.value !== 'CANCELLED')}
            />
          </Field>
          <Field label="Billing">
            <Select
              value={interval}
              onChange={(event) => setBillingInterval(event.target.value as BillingInterval)}
              options={INTERVAL_OPTIONS}
            />
          </Field>
        </div>
        {planEntry ? <p className="text-sm text-ink-muted">{planEntry.notes}</p> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Learner seats" hint="0 means not metered.">
            <Input type="number" min={0} value={studentSeats} onChange={(event) => setStudentSeats(event.target.value)} />
          </Field>
          <Field label="Teacher seats" hint="0 means not metered.">
            <Input type="number" min={0} value={teacherSeats} onChange={(event) => setTeacherSeats(event.target.value)} />
          </Field>
          <Field label="Price per learner" hint="Optional. For example 12.50.">
            <Input inputMode="decimal" value={studentPrice} onChange={(event) => setStudentPrice(event.target.value)} />
          </Field>
          <Field label="Price per teacher" hint="Optional.">
            <Input inputMode="decimal" value={teacherPrice} onChange={(event) => setTeacherPrice(event.target.value)} />
          </Field>
          <Field label="Currency">
            <Input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Starts" isRequired>
            <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </Field>
          <Field label="Ends" isRequired={planEntry?.requiresEndDate} hint={planEntry?.requiresEndDate ? undefined : 'Optional.'}>
            <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
          <Field label="Trial ends" hint="Optional.">
            <Input type="date" value={trialEndsAt} onChange={(event) => setTrialEndsAt(event.target.value)} />
          </Field>
        </div>
        <Checkbox label="Renews automatically" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Purchase order" hint="Optional.">
            <Input maxLength={80} value={poRef} onChange={(event) => setPoRef(event.target.value)} />
          </Field>
          <Field label="Invoice email" hint="Optional.">
            <Input type="email" value={invoiceEmail} onChange={(event) => setInvoiceEmail(event.target.value)} />
          </Field>
        </div>
        <Field label="Notes" hint="Optional. Internal to billing.">
          <Textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

function RenewModal({
  plans,
  detail,
  onClose,
}: {
  plans: PlanPackaging[];
  detail: SubscriptionDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const row = detail.subscription;
  const [plan, setPlan] = useState<SubscriptionPlan>(row.plan);
  const [endsAt, setEndsAt] = useState('');
  const [studentSeats, setStudentSeats] = useState(String(row.licensedStudentSeats));
  const [teacherSeats, setTeacherSeats] = useState(String(row.licensedTeacherSeats));
  const [summary, setSummary] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      renewSubscription(row.id, {
        ...(plan !== row.plan ? { plan } : {}),
        endsAt,
        licensedStudentSeats: Number(studentSeats),
        licensedTeacherSeats: Number(teacherSeats),
        ...(summary.trim() ? { changeSummary: summary.trim() } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      onClose();
    },
  });

  const seat = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 200_000;
  const blockedReason = !endsAt
    ? 'Choose when the new term ends.'
    : row.endsAt && endsAt <= dateOnly(row.endsAt)
      ? 'A renewal should end after the current term.'
      : !seat(studentSeats) || !seat(teacherSeats)
        ? 'Seats are whole numbers, 0 to 200,000.'
        : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Renew agreement"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            Renew
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Current term {row.endsAt ? `ends ${formatDate(row.endsAt)}` : 'has no end date'}.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Plan" hint="Change it to upgrade or downgrade at renewal.">
            <Select
              value={plan}
              onChange={(event) => setPlan(event.target.value as SubscriptionPlan)}
              options={plans.map((entry) => ({ value: entry.plan, label: entry.name }))}
            />
          </Field>
          <Field label="New term ends" isRequired>
            <Input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
          <Field label="Learner seats">
            <Input type="number" min={0} value={studentSeats} onChange={(event) => setStudentSeats(event.target.value)} />
          </Field>
          <Field label="Teacher seats">
            <Input type="number" min={0} value={teacherSeats} onChange={(event) => setTeacherSeats(event.target.value)} />
          </Field>
        </div>
        <Field label="What changed" hint="Optional. Kept with the audit record.">
          <Textarea rows={2} maxLength={500} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

function CancelModal({ detail, onClose }: { detail: SubscriptionDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const row = detail.subscription;
  const [reason, setReason] = useState('');
  const [immediate, setImmediate] = useState(false);
  const [effectiveAt, setEffectiveAt] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      cancelSubscription(row.id, {
        reason: reason.trim(),
        ...(immediate ? { immediate: true } : {}),
        ...(!immediate && effectiveAt ? { effectiveAt } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      onClose();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Cancel agreement"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Keep it
          </Button>
          <Button
            variant="danger"
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 3}
            onClick={() => mutation.mutate()}
          >
            Cancel agreement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Alert tone="warning" title="What happens">
          {immediate
            ? 'Access to plan features ends now. Rarely right in the middle of a school year.'
            : `Access continues until ${
                effectiveAt ? formatDate(effectiveAt) : row.endsAt ? formatDate(row.endsAt) : 'the end of the current term'
              }.`}
        </Alert>
        <Field label="Reason" isRequired hint="Recorded with the commercial outcome.">
          <Textarea rows={2} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Checkbox label="End access now" checked={immediate} onChange={(event) => setImmediate(event.target.checked)} />
        {!immediate ? (
          <Field label="Effective from" hint="Optional. Empty means the end of the current term.">
            <Input type="date" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
