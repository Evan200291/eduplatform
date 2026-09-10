import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconAdd,
  IconSuccess,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import {
  createRecommendation,
  decideRecommendation,
  fetchRecommendationSummary,
  fetchRecommendations,
} from '@/learning/learning.api';
import type {
  ProposalTopic,
  RecommendationProposal,
  RecommendationRecord,
  RecommendationStatus,
  RecommendationSummary,
} from '@/learning/learning.types';
import { fetchClassRoster, fetchMyClasses, fetchSubjects } from '@/academic/academic.api';
import { fetchTopics } from '@/curriculum/curriculum.api';
import { qk } from '@/query/keys';
import { formatDate, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';

type TopicEntry = ProposalTopic;
type Proposal = RecommendationProposal;
type RecommendationRow = RecommendationRecord;

const CONFIDENCE_TONE = { LOW: 'warning', MODERATE: 'info', HIGH: 'success', INSUFFICIENT: 'neutral' } as const;

const STATUS_TONE = {
  PENDING_APPROVAL: 'warning',
  DEFERRED: 'info',
  APPROVED: 'success',
  MODIFIED: 'success',
  AUTO_APPROVED: 'neutral',
  REJECTED: 'danger',
  SUPERSEDED: 'neutral',
} as const;

const OPEN: RecommendationStatus[] = ['PENDING_APPROVAL', 'DEFERRED'];

type ProposalGroup = 'practise' | 'consolidate' | 'advance';

const GROUP_LABEL: Record<ProposalGroup, string> = {
  practise: 'practise',
  consolidate: 'keep in path',
  advance: 'advance',
};

/** Every proposed topic, flattened but remembering which group it came from. */
function allProposedTopics(
  proposal: Proposal | null,
): { group: ProposalGroup; topic: TopicEntry }[] {
  if (!proposal) return [];
  return (['practise', 'consolidate', 'advance'] as ProposalGroup[]).flatMap((group) =>
    (proposal[group] ?? []).map((topic) => ({ group, topic })),
  );
}

type Decision = 'APPROVE' | 'MODIFY' | 'REJECT' | 'DEFER';

type View = 'open' | RecommendationStatus;

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'open', label: 'Waiting for a decision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'MODIFIED', label: 'Modified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'AUTO_APPROVED', label: 'Auto-approved' },
  { value: 'SUPERSEDED', label: 'Superseded' },
];

/** The approval queue: what the system proposes, and the teacher's decision. */
export function RecommendationsPage() {
  useDocumentTitle('To approve');
  const queryClient = useQueryClient();
  const canDecide = useCan('recommendation.decide');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>('open');
  const [isRaising, setRaising] = useState(false);

  const params = view === 'open' ? { pendingOnly: true, page } : { status: view, page };
  const query = useQuery({
    queryKey: qk.recommendations.pending(params),
    queryFn: () => fetchRecommendations({ ...params, pageSize: 10 }),
  });
  const summary = useQuery({
    queryKey: qk.recommendations.summary,
    queryFn: fetchRecommendationSummary,
  });

  const rows = query.data?.items ?? [];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="To approve"
        description="Nothing reaches a student until you approve it. Each suggestion shows why it was made, and you can change it before it goes out."
        actions={
          canDecide ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setRaising(true)}>
              Raise a recommendation
            </Button>
          ) : null
        }
      />

      {summary.data ? <QueueSummary summary={summary.data} /> : null}

      <div className="max-w-xs">
        <Field label="Show">
          <Select
            value={view}
            onChange={(event) => {
              setView(event.target.value as View);
              setPage(1);
              setDecidingId(null);
            }}
            options={VIEW_OPTIONS}
          />
        </Field>
      </div>

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<IconSuccess className="h-8 w-8" />}
            title={view === 'open' ? 'Nothing waiting' : 'Nothing here yet'}
            description={
              view === 'open'
                ? 'Every recommendation has been reviewed.'
                : 'No recommendation has been given this outcome.'
            }
          />
        }
      >
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <RecommendationCard
              key={row.id}
              row={row}
              canDecide={canDecide && OPEN.includes(row.status)}
              isDeciding={decidingId === row.id}
              onStart={() => setDecidingId(row.id)}
              onClose={() => setDecidingId(null)}
              onDone={() => {
                setDecidingId(null);
                refresh();
              }}
            />
          ))}
        </div>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>

      {isRaising ? (
        <RaiseRecommendationModal
          onClose={() => setRaising(false)}
          onDone={() => {
            setRaising(false);
            setView('open');
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Queue counts. "Past review date" counts proposals still waiting whose
 * auto-approval date has passed — the ones to look at first, since the
 * scheduled job may otherwise approve them without a teacher.
 */
function QueueSummary({ summary }: { summary: RecommendationSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryTile label="Waiting" value={summary.pending} />
      <SummaryTile label="Deferred" value={summary.deferred} />
      <SummaryTile
        label="Past review date"
        value={summary.dueForAutoApproval}
        emphasis={summary.dueForAutoApproval > 0}
      />
      <div className="rounded-lg border border-line bg-surface p-3">
        <p className="text-xs font-medium text-ink-muted">Where open ones came from</p>
        {summary.byOrigin.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">None open</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink">
            {summary.byOrigin.map((entry) => (
              <li key={entry.origin}>
                {humanize(entry.origin)}: <span className="font-semibold">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? 'border-warning bg-warning-soft' : 'border-line bg-surface'}`}>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {emphasis ? <p className="text-xs text-ink-muted">Review these first</p> : null}
    </div>
  );
}

function RecommendationCard({
  row,
  canDecide,
  isDeciding,
  onStart,
  onClose,
  onDone,
}: {
  row: RecommendationRow;
  canDecide: boolean;
  isDeciding: boolean;
  onStart: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<Decision>('APPROVE');
  const [note, setNote] = useState('');
  const [applyToPath, setApplyToPath] = useState(true);

  /*
   * MODIFY means "not this proposal, this one instead", so the server requires
   * an `appliedChange` describing what to do — it will not accept a bare
   * MODIFY. The teacher builds that here by deselecting the proposed topics
   * they do not want; whatever stays selected is the change.
   *
   * Starts as everything proposed, so the decision begins from what the system
   * suggested rather than from an empty path the teacher has to rebuild.
   */
  const proposedTopics = useMemo(() => allProposedTopics(row.proposal), [row.proposal]);
  const [keptTopicIds, setKeptTopicIds] = useState<Set<string>>(
    () => new Set(proposedTopics.map((entry) => entry.topic.topicId)),
  );

  const toggleTopic = (topicId: string) => {
    setKeptTopicIds((current) => {
      const next = new Set(current);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const appliedChange = useMemo(() => {
    const change: Record<string, TopicEntry[]> = { practise: [], consolidate: [], advance: [] };
    for (const { group, topic } of proposedTopics) {
      if (keptTopicIds.has(topic.topicId)) change[group].push(topic);
    }
    return change;
  }, [proposedTopics, keptTopicIds]);

  // Mirrors the server's own rules (`decideRecommendationSchema`) so the reason
  // a button is disabled is visible next to it, rather than arriving as a
  // validation error pointing at a field this form never had.
  const noteRequired = decision === 'REJECT';
  const blockedReason =
    noteRequired && note.trim().length < 4
      ? 'Add a short reason before rejecting.'
      : decision === 'MODIFY' && keptTopicIds.size === 0
        ? 'Keep at least one topic, or reject the recommendation instead.'
        : null;

  const decide = useMutation({
    mutationFn: (input: {
      decision: Decision;
      note?: string;
      applyToPath?: boolean;
      appliedChange?: Record<string, unknown>;
    }) => decideRecommendation(row.id, input),
    onSuccess: onDone,
  });

  return (
    <Card>
      <CardHeader
        title={row.student.displayName}
        description={row.subject ? row.subject.name : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={toneFor(STATUS_TONE, row.status)}>{humanize(row.status)}</Badge>
            <Badge tone="neutral">Priority {row.priority}</Badge>
            <Badge tone={toneFor(CONFIDENCE_TONE, row.confidence)}>{humanize(row.confidence)} confidence</Badge>
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {humanize(row.origin)} · {formatRelative(row.createdAt)}
        </p>
        {row.rationale ? <p className="text-sm text-ink">{row.rationale}</p> : null}

        {row.proposal?.practise?.length ? (
          <TopicChips label="Practise proposed" tone="warning" topics={row.proposal.practise} />
        ) : null}
        {row.proposal?.advance?.length ? (
          <TopicChips label="Advance proposed" tone="success" topics={row.proposal.advance} />
        ) : null}
        {row.proposal?.consolidate?.length ? (
          <TopicChips label="Keep in path" tone="info" topics={row.proposal.consolidate} />
        ) : null}

        {row.decidedAt ? (
          <div className="rounded-lg border border-line bg-surface-sunken p-3 text-sm">
            <p className="text-ink">
              {humanize(row.status)} {formatDate(row.decidedAt)}
              {row.pathId ? ' · applied to the learner’s path' : ''}
            </p>
            {row.decisionNote ? <p className="mt-1 text-ink-muted">&ldquo;{row.decisionNote}&rdquo;</p> : null}
            {row.appliedChange ? (
              <div className="mt-2 flex flex-col gap-2">
                {row.appliedChange.practise?.length ? (
                  <TopicChips label="Practise applied" tone="warning" topics={row.appliedChange.practise} />
                ) : null}
                {row.appliedChange.advance?.length ? (
                  <TopicChips label="Advance applied" tone="success" topics={row.appliedChange.advance} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : row.status === 'DEFERRED' && row.autoApproveAt ? (
          <p className="text-sm text-ink-muted">Deferred until {formatDate(row.autoApproveAt)}.</p>
        ) : null}

        {!canDecide ? null : isDeciding ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-3">
            {decide.error ? <ErrorState error={decide.error} /> : null}
            <div className="flex flex-wrap gap-2">
              {(['APPROVE', 'MODIFY', 'REJECT', 'DEFER'] as Decision[]).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={decision === option ? 'primary' : 'outline'}
                  onClick={() => setDecision(option)}
                >
                  {humanize(option)}
                </Button>
              ))}
            </div>
            {decision === 'MODIFY' ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-ink-muted">
                  Keep the topics you want; clear the ones you do not.
                </p>
                {proposedTopics.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    This recommendation proposes no topics, so there is nothing to modify — approve
                    or reject it instead.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {proposedTopics.map(({ group, topic }) => (
                      <Checkbox
                        key={topic.topicId}
                        label={`${topic.topicName} · ${GROUP_LABEL[group]}`}
                        checked={keptTopicIds.has(topic.topicId)}
                        onChange={() => toggleTopic(topic.topicId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <Field
              label="Note"
              hint={
                noteRequired
                  ? 'Required. This is the feedback the engine learns from.'
                  : 'Shown in the record of this decision.'
              }
              isRequired={noteRequired}
            >
              <Textarea
                placeholder={noteRequired ? 'Why is this not right?' : 'Add a note (optional)'}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
              />
            </Field>
            {decision === 'APPROVE' || decision === 'MODIFY' ? (
              <Checkbox
                label="Apply to the student's active path now"
                checked={applyToPath}
                onChange={(event) => setApplyToPath(event.target.checked)}
              />
            ) : null}
            {blockedReason ? <p className="text-sm text-danger-strong">{blockedReason}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                isLoading={decide.isPending}
                disabled={blockedReason !== null}
                onClick={() =>
                  decide.mutate({
                    decision,
                    note: note.trim() || undefined,
                    applyToPath:
                      decision === 'APPROVE' || decision === 'MODIFY' ? applyToPath : undefined,
                    // Required by the server for MODIFY, and meaningless for
                    // every other decision.
                    appliedChange: decision === 'MODIFY' ? appliedChange : undefined,
                  })
                }
              >
                Confirm {humanize(decision).toLowerCase()}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={onStart}>
              Decide
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function TopicChips({ label, tone, topics }: { label: string; tone: 'warning' | 'success' | 'info'; topics: TopicEntry[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-1">
        {topics.map((topic) => (
          <Badge key={topic.topicId} tone={tone}>
            {topic.topicName}
            {typeof topic.accuracyPercent === 'number' ? ` · ${topic.accuracyPercent}%` : ''}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * A teacher raising a recommendation by hand — blueprint 04's "teacher
 * judgment" evidence. It enters the same queue as a system proposal and is
 * decided the same way, so the record never confuses the two.
 *
 * The learner is picked through the teacher's own classes: a teacher's scope
 * does not reach learners outside them, so offering the whole school would be
 * a control that fails on use.
 */
function RaiseRecommendationModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [practise, setPractise] = useState<Set<string>>(new Set());
  const [advance, setAdvance] = useState<Set<string>>(new Set());
  const [rationale, setRationale] = useState('');
  const [priority, setPriority] = useState('50');

  const classes = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });
  const roster = useQuery({
    queryKey: qk.classes.roster(classId),
    queryFn: () => fetchClassRoster(classId),
    enabled: classId.length > 0,
  });
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: fetchSubjects });
  const topics = useQuery({
    queryKey: qk.curriculum.list({ resource: 'topics', subjectId, pageSize: 100 }),
    queryFn: () => fetchTopics({ subjectId, pageSize: 100 }),
    enabled: subjectId.length > 0,
  });

  const topicList = topics.data?.items ?? [];
  const learners = (roster.data ?? []).filter((entry) => entry.isActive);
  const priorityValue = Number(priority);

  /* A topic is either practised or advanced past, never both. */
  const setGroup = (topicId: string, group: 'none' | 'practise' | 'advance') => {
    setPractise((current) => {
      const next = new Set(current);
      if (group === 'practise') next.add(topicId);
      else next.delete(topicId);
      return next;
    });
    setAdvance((current) => {
      const next = new Set(current);
      if (group === 'advance') next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  };

  const blockedReason = !studentId
    ? 'Choose a learner.'
    : !subjectId
      ? 'Choose a subject.'
      : practise.size + advance.size === 0
        ? 'Choose at least one topic to practise or advance past.'
        : rationale.trim().length < 8
          ? 'Explain the recommendation in at least eight characters.'
          : !Number.isInteger(priorityValue) || priorityValue < 0 || priorityValue > 100
            ? 'Priority is a whole number from 0 to 100.'
            : null;

  const mutation = useMutation({
    mutationFn: () => {
      const entry = (id: string): ProposalTopic => ({
        topicId: id,
        topicName: topicList.find((topic) => topic.id === id)?.name ?? '',
      });
      return createRecommendation({
        studentId,
        subjectId,
        rationale: rationale.trim(),
        priority: priorityValue,
        proposal: {
          practise: [...practise].map(entry),
          advance: [...advance].map(entry),
        },
      });
    },
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Raise a recommendation"
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            Add to the queue
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Recorded as your professional judgement. It waits in the queue like any other
          recommendation and changes nothing until it is approved.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Class" isRequired>
            <Select
              value={classId}
              placeholder={classes.isPending ? 'Loading…' : 'Choose a class'}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentId('');
              }}
              options={(classes.data?.items ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
            />
          </Field>
          <Field label="Learner" isRequired>
            <Select
              value={studentId}
              disabled={!classId}
              placeholder={!classId ? 'Choose a class first' : roster.isPending ? 'Loading…' : 'Choose a learner'}
              onChange={(event) => setStudentId(event.target.value)}
              options={learners.map((entry) => ({ value: entry.user.id, label: entry.user.displayName }))}
            />
          </Field>
        </div>
        {classes.error ? <ErrorState error={classes.error} /> : null}
        {roster.error ? <ErrorState error={roster.error} /> : null}

        <Field label="Subject" isRequired>
          <Select
            value={subjectId}
            placeholder={subjects.isPending ? 'Loading…' : 'Choose a subject'}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setPractise(new Set());
              setAdvance(new Set());
            }}
            options={(subjects.data?.items ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
          />
        </Field>

        {subjectId ? (
          <QueryBoundary isLoading={topics.isPending} error={topics.error} onRetry={() => void topics.refetch()}>
            {topicList.length === 0 ? (
              <EmptyState title="No topics in this subject yet" description="Topics are authored in the admin panel's Curriculum screen." />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-ink">Topics</p>
                <p className="text-xs text-ink-muted">
                  Practise adds or opens the topic on the learner&rsquo;s path. Advance marks it as
                  already secure so it is skipped.
                </p>
                <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                  {topicList.map((topic) => {
                    const group = practise.has(topic.id) ? 'practise' : advance.has(topic.id) ? 'advance' : 'none';
                    return (
                      <li key={topic.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm text-ink">{topic.name}</span>
                        <div className="w-40">
                          <Select
                            aria-label={`What to do with ${topic.name}`}
                            value={group}
                            onChange={(event) =>
                              setGroup(topic.id, event.target.value as 'none' | 'practise' | 'advance')
                            }
                            options={[
                              { value: 'none', label: 'No change' },
                              { value: 'practise', label: 'Practise' },
                              { value: 'advance', label: 'Advance past' },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </QueryBoundary>
        ) : null}

        <Field label="Why" isRequired hint="The deciding teacher sees this. At least eight characters.">
          <Textarea rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} />
        </Field>

        <div className="max-w-[10rem]">
          <Field label="Priority" hint="0 to 100; higher is shown first.">
            <Input
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </Field>
        </div>

        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}
