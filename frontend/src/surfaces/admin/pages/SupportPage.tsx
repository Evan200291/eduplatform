import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  IconSupport,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan, useProfile } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';
import {
  assignSupportRequest,
  closeSupportRequest,
  createSupportRequest,
  escalateSupportRequest,
  fetchSupportPolicies,
  fetchSupportRequest,
  fetchSupportRequests,
  fetchSupportSummary,
  postSupportMessage,
  rateSupportRequest,
  resolveSupportRequest,
  setSupportStatus,
  triageSupportRequest,
} from '@/support/support.api';
import type {
  SupportCategory,
  SupportPriority,
  SupportRequestRow,
  SupportStatus,
} from '@/support/support.types';

/**
 * Support requests (blueprint §13, UX brief N4–N7).
 *
 * The backend has carried the whole workflow since launch — policy catalogue,
 * triage, assignment, escalation, resolution, satisfaction — with no interface
 * at all. The admin overview has been showing an open-ticket count that linked
 * nowhere.
 *
 * One screen serves both audiences because the permissions already separate
 * them. A teacher or school admin sees their own requests and can raise one; an
 * agent holding `support.read.all` sees the queue, and the triage controls
 * appear only with `support.respond`. Building two screens would have meant
 * duplicating the thread view for no gain.
 *
 * Nothing closes silently: every state change carries a note, because a ticket
 * that changed hands with no explanation is what a school complains about next.
 */

const STATUS_LABEL: Record<SupportStatus, string> = {
  NEW: 'New',
  TRIAGED: 'Triaged',
  IN_PROGRESS: 'In progress',
  WAITING_ON_CUSTOMER: 'Waiting on you',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const STATUS_TONE: Record<SupportStatus, BadgeTone> = {
  NEW: 'info',
  TRIAGED: 'info',
  IN_PROGRESS: 'brand',
  WAITING_ON_CUSTOMER: 'warning',
  ESCALATED: 'danger',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

const PRIORITY_TONE: Record<SupportPriority, BadgeTone> = {
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const CATEGORY_LABEL: Record<SupportCategory, string> = {
  ACCESS_ACCOUNT: 'Access or account',
  USABILITY: 'Hard to use',
  CONTENT_ERROR: 'Something in the content is wrong',
  CONFIGURATION_REQUEST: 'Configuration request',
  DATA_REPORTING: 'Data or reporting',
  PLATFORM_DEFECT: 'Something is broken',
  SECURITY_PRIVACY: 'Security or privacy',
  COMMERCIAL_SUBSCRIPTION: 'Billing or subscription',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Any status' },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
];

export function SupportPage() {
  useDocumentTitle('Support');
  const profile = useProfile();
  const isAgent = useCan('support.read.all');
  const canRespond = useCan('support.respond');
  const canAssign = useCan('support.assign');

  const [status, setStatus] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isRaising, setRaising] = useState(false);

  const filters = {
    status: (status || undefined) as SupportStatus | undefined,
    assigneeId: mineOnly && profile ? profile.id : undefined,
    page,
    pageSize: 20,
  };

  const query = useQuery({
    queryKey: qk.support.list(filters),
    queryFn: () => fetchSupportRequests(filters),
  });

  const summary = useQuery({
    queryKey: qk.support.summary,
    queryFn: () => fetchSupportSummary(),
    enabled: isAgent,
  });

  const rows = query.data?.items ?? [];

  const columns: Column<SupportRequestRow>[] = [
    {
      key: 'reference',
      header: 'Ref',
      render: (row) => <code className="text-xs">{row.reference}</code>,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span>
          <span className="text-ink">{row.subject}</span>
          <span className="block text-xs text-ink-muted">{CATEGORY_LABEL[row.category]}</span>
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => <Badge tone={PRIORITY_TONE[row.priority]}>{row.priority}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>,
    },
    {
      key: 'assignee',
      header: 'With',
      className: 'hidden lg:table-cell',
      render: (row) => row.assignee?.displayName ?? <span className="text-ink-muted">Unassigned</span>,
    },
    {
      key: 'createdAt',
      header: 'Raised',
      className: 'hidden sm:table-cell',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => setOpenId(row.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Support"
        description={
          isAgent
            ? 'Requests raised by schools, and where each one has got to.'
            : 'Requests you have raised, and what has happened to them.'
        }
        actions={
          <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setRaising(true)}>
            Raise a request
          </Button>
        }
      />

      {isAgent && summary.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryTile label="Unassigned" value={summary.data.unassigned ?? 0} tone="warning" />
          {(summary.data.byStatus ?? []).slice(0, 3).map((entry) => (
            <SummaryTile
              key={entry.status}
              label={STATUS_LABEL[entry.status] ?? entry.status}
              value={entry.count}
              tone={STATUS_TONE[entry.status] ?? 'neutral'}
            />
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader title="Filters" />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select
              options={STATUS_FILTER_OPTIONS}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          {isAgent ? (
            <div className="flex items-end">
              <Checkbox
                label="Only requests assigned to me"
                checked={mineOnly}
                onChange={(event) => {
                  setMineOnly(event.target.checked);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
            <DataTable
              caption="Support requests"
              rows={rows}
              columns={columns}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  icon={<IconSupport className="h-8 w-8" aria-hidden />}
                  title="Nothing here"
                  description={
                    isAgent
                      ? 'No requests match these filters.'
                      : 'You have not raised a support request yet.'
                  }
                />
              }
            />
            {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
          </QueryBoundary>
        </CardBody>
      </Card>

      {openId ? (
        <RequestDetail
          requestId={openId}
          canRespond={canRespond}
          canAssign={canAssign}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {isRaising ? <RaiseRequestModal onClose={() => setRaising(false)} /> : null}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: BadgeTone }) {
  const toneClasses: Record<BadgeTone, string> = {
    neutral: 'bg-surface-sunken text-ink-muted',
    info: 'bg-secondary-soft text-secondary-strong',
    success: 'bg-success-soft text-success-strong',
    warning: 'bg-warning-soft text-warning-strong',
    danger: 'bg-danger-soft text-danger-strong',
    brand: 'bg-primary-soft text-primary-strong',
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClasses[tone]}`}>
          <IconSupport aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink tabular-nums">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

/** The thread, plus whichever controls the reader's permissions allow. */
function RequestDetail({
  requestId,
  canRespond,
  canAssign,
  onClose,
}: {
  requestId: string;
  canRespond: boolean;
  canAssign: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [isInternal, setInternal] = useState(false);
  const [action, setAction] = useState<'none' | 'resolve' | 'escalate' | 'close'>('none');
  const [note, setNote] = useState('');
  const [escalateTo, setEscalateTo] = useState('');

  const query = useQuery({
    queryKey: qk.support.detail(requestId),
    queryFn: () => fetchSupportRequest(requestId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.support.all });
    void query.refetch();
  };

  const send = useMutation({
    mutationFn: () => postSupportMessage(requestId, { body: reply.trim(), isInternal }),
    onSuccess: () => {
      setReply('');
      setInternal(false);
      invalidate();
    },
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => setSupportStatus(requestId, { status }),
    onSuccess: invalidate,
  });

  const claim = useMutation({
    mutationFn: (assigneeId: string | null) => assignSupportRequest(requestId, { assigneeId }),
    onSuccess: invalidate,
  });

  const finish = useMutation({
    mutationFn: () => {
      if (action === 'resolve') {
        return resolveSupportRequest(requestId, { resolutionNote: note.trim() });
      }
      if (action === 'escalate') {
        return escalateSupportRequest(requestId, {
          escalateTo: escalateTo.trim(),
          reason: note.trim(),
        });
      }
      return closeSupportRequest(requestId, { note: note.trim() || undefined });
    },
    onSuccess: () => {
      setAction('none');
      setNote('');
      setEscalateTo('');
      invalidate();
    },
  });

  const request = query.data;
  const profile = useProfile();
  const isRequester = Boolean(request && profile && request.requesterId === profile.id);
  const isFinished = request?.status === 'RESOLVED' || request?.status === 'CLOSED';

  return (
    <Modal isOpen onClose={onClose} title={request ? `${request.reference} — ${request.subject}` : 'Request'} size="lg">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {request ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge>
              <Badge tone={PRIORITY_TONE[request.priority]}>{request.priority}</Badge>
              <span className="text-xs text-ink-muted">{CATEGORY_LABEL[request.category]}</span>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Raised by</dt>
              <dd className="text-ink">{request.requester?.displayName ?? 'Unknown'}</dd>
              <dt className="text-ink-muted">Raised</dt>
              <dd className="text-ink">{formatDateTime(request.createdAt)}</dd>
              <dt className="text-ink-muted">With</dt>
              <dd className="text-ink">{request.assignee?.displayName ?? 'Nobody yet'}</dd>
              {request.resolutionDueAt ? (
                <>
                  <dt className="text-ink-muted">Response due</dt>
                  <dd className="text-ink">{formatDateTime(request.resolutionDueAt)}</dd>
                </>
              ) : null}
            </dl>

            <div className="rounded-md bg-surface-sunken p-3 text-sm text-ink">
              {request.description}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Conversation</p>
              {request.messages.length === 0 ? (
                <EmptyState title="No replies yet" />
              ) : (
                <ul className="flex flex-col gap-3">
                  {request.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`rounded-md border p-3 ${
                        message.isInternal ? 'border-warning bg-warning-soft' : 'border-border'
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <span className="text-ink">{message.author?.displayName ?? 'System'}</span>
                        <span>{formatDateTime(message.createdAt)}</span>
                        {message.isInternal ? <Badge tone="warning">Internal note</Badge> : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-ink">{message.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {isRequester && isFinished ? (
              <RateHelp requestId={request.id} currentScore={request.satisfactionScore} onDone={invalidate} />
            ) : null}

            {canRespond && !isFinished ? (
              <TriageSection
                requestId={request.id}
                category={request.category}
                priority={request.priority}
                onDone={invalidate}
              />
            ) : null}

            <div className="border-t border-border pt-4">
              {send.error ? <ErrorState error={send.error} /> : null}
              <Field label="Reply">
                <Textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} />
              </Field>
              {canRespond ? (
                <div className="mt-2">
                  <Checkbox
                    label="Internal note — the requester never sees this"
                    checked={isInternal}
                    onChange={(event) => setInternal(event.target.checked)}
                  />
                </div>
              ) : null}
              <div className="mt-3">
                <Button
                  isLoading={send.isPending}
                  disabled={reply.trim().length === 0}
                  onClick={() => send.mutate()}
                >
                  Send
                </Button>
              </div>
            </div>

            {canRespond ? (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium text-ink">Move this on</p>
                {changeStatus.error ? <ErrorState error={changeStatus.error} /> : null}
                {claim.error ? <ErrorState error={claim.error} /> : null}
                {finish.error ? <ErrorState error={finish.error} /> : null}

                {action === 'none' ? (
                  <div className="flex flex-wrap gap-2">
                    {canAssign && !request.assignee ? (
                      <Button size="sm" variant="outline" onClick={() => claim.mutate(null)}>
                        Return to queue
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate('IN_PROGRESS')}
                    >
                      Mark in progress
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={changeStatus.isPending}
                      onClick={() => changeStatus.mutate('WAITING_ON_CUSTOMER')}
                    >
                      Waiting on requester
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAction('escalate')}>
                      Escalate
                    </Button>
                    <Button size="sm" onClick={() => setAction('resolve')}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction('close')}>
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {action === 'escalate' ? (
                      <Field label="Escalate to" hint="A person or a rota.">
                        <Input
                          value={escalateTo}
                          onChange={(event) => setEscalateTo(event.target.value)}
                        />
                      </Field>
                    ) : null}
                    <Field
                      label={
                        action === 'resolve'
                          ? 'What was done'
                          : action === 'escalate'
                            ? 'Why it is being escalated'
                            : 'Closing note'
                      }
                      hint={action === 'close' ? 'Optional.' : 'Required.'}
                    >
                      <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        isLoading={finish.isPending}
                        disabled={
                          (action !== 'close' && note.trim().length < 10) ||
                          (action === 'escalate' && escalateTo.trim().length < 2)
                        }
                        onClick={() => finish.mutate()}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        disabled={finish.isPending}
                        onClick={() => {
                          setAction('none');
                          setNote('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </QueryBoundary>
    </Modal>
  );
}

/** Raising one. Deliberately short: category, subject, what happened. */
function RaiseRequestModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<string>('ACCESS_ACCOUNT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const policies = useQuery({ queryKey: qk.support.policies, queryFn: fetchSupportPolicies });
  const policy = policies.data?.categories.find((entry) => entry.category === category);

  const create = useMutation({
    mutationFn: () =>
      createSupportRequest({
        category,
        subject: subject.trim(),
        description: description.trim(),
        contextPath: window.location.pathname,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.support.all });
      onClose();
    },
  });

  const canSubmit = subject.trim().length >= 4 && description.trim().length >= 20;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Raise a support request"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button isLoading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            Send it
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error ? <ErrorState error={create.error} /> : null}

        <Field label="What is this about?">
          <Select
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </Field>
        {policy && policies.data ? (
          <p className="rounded-md bg-surface-sunken p-3 text-sm text-ink">
            Handled by {policy.ownerRole.toLowerCase().replace(/_/g, ' ')}. Usually a first reply within{' '}
            {policies.data.firstResponseHours[policy.defaultPriority]} hours and a resolution within{' '}
            {policies.data.resolutionHours[policy.defaultPriority]} hours.
            {policy.requiresWrittenOutcome ? ' You will get a written account of what was done.' : ''}
          </p>
        ) : null}

        <Field label="Subject" hint="One line, so it can be found again.">
          <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </Field>

        <Field
          label="What happened?"
          hint="What you expected, what happened instead, and where. At least twenty characters."
        >
          <Textarea
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

const PRIORITY_OPTIONS: { value: SupportPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const SCORE_LABEL = ['', 'It did not help', 'It helped a little', 'It was fine', 'It helped', 'It helped a lot'];

/**
 * Blueprint 13 asks whether the help actually helped. Only the person who
 * raised the request is asked, and only once it has been resolved. The score
 * buttons carry words, not just a number, so the meaning never rests on a
 * colour or a star shape.
 */
function RateHelp({
  requestId,
  currentScore,
  onDone,
}: {
  requestId: string;
  currentScore: number | null;
  onDone: () => void;
}) {
  const [score, setScore] = useState<number | null>(currentScore);
  const [comment, setComment] = useState('');
  const [isEditing, setEditing] = useState(currentScore === null);

  const mutation = useMutation({
    mutationFn: () =>
      rateSupportRequest(requestId, {
        score: score ?? 0,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: () => {
      setEditing(false);
      setComment('');
      onDone();
    },
  });

  if (!isEditing && currentScore !== null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
        <span className="text-ink">
          You rated this {currentScore} out of 5 — {SCORE_LABEL[currentScore]?.toLowerCase()}.
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Change rating
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-2 text-sm font-medium text-ink">Did this help?</p>
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <div role="radiogroup" aria-label="How much it helped" className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <Button
            key={value}
            size="sm"
            role="radio"
            aria-checked={score === value}
            variant={score === value ? 'primary' : 'outline'}
            onClick={() => setScore(value)}
          >
            {value} · {SCORE_LABEL[value]}
          </Button>
        ))}
      </div>
      <div className="mt-3">
        <Field label="Anything to add" hint="Optional. Added to the conversation.">
          <Textarea rows={2} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" isLoading={mutation.isPending} disabled={score === null} onClick={() => mutation.mutate()}>
          Send rating
        </Button>
        {currentScore !== null ? (
          <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Triage decides what a request actually is. Changing the category can raise
 * the priority to that category's floor, so the server may return a higher
 * priority than was chosen. The response clock only restarts when asked —
 * a mis-filed request should not buy extra time by default.
 */
function TriageSection({
  requestId,
  category,
  priority,
  onDone,
}: {
  requestId: string;
  category: SupportCategory;
  priority: SupportPriority;
  onDone: () => void;
}) {
  const [isOpen, setOpen] = useState(false);
  const [nextCategory, setNextCategory] = useState<SupportCategory>(category);
  const [nextPriority, setNextPriority] = useState<SupportPriority>(priority);
  const [recalculate, setRecalculate] = useState(false);
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      triageSupportRequest(requestId, {
        ...(nextCategory !== category ? { category: nextCategory } : {}),
        ...(nextPriority !== priority ? { priority: nextPriority } : {}),
        ...(recalculate ? { recalculateTargets: true } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      setRecalculate(false);
      onDone();
    },
  });

  const hasChange = nextCategory !== category || nextPriority !== priority || note.trim().length > 0;

  if (!isOpen) {
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Triage — change category or priority
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-ink">Triage</p>
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category" hint="Can raise the priority to the category's minimum.">
          <Select
            value={nextCategory}
            onChange={(event) => setNextCategory(event.target.value as SupportCategory)}
            options={CATEGORY_OPTIONS}
          />
        </Field>
        <Field label="Priority">
          <Select
            value={nextPriority}
            onChange={(event) => setNextPriority(event.target.value as SupportPriority)}
            options={PRIORITY_OPTIONS}
          />
        </Field>
      </div>
      <Checkbox
        label="Restart the response targets from now"
        hint="Only when the request was mis-filed and the old targets no longer make sense."
        checked={recalculate}
        onChange={(event) => setRecalculate(event.target.checked)}
      />
      <Field label="Triage note" hint="Optional. Saved as an internal note.">
        <Textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {!hasChange ? <p className="text-sm text-ink-muted">Change the category or priority, or add a note.</p> : null}
      <div className="flex gap-2">
        <Button size="sm" isLoading={mutation.isPending} disabled={!hasChange} onClick={() => mutation.mutate()}>
          Save triage
        </Button>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
