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
  IconSuccess,
  PageHeader,
  Pagination,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import type { PageMeta } from '@/api';
import { decideRecommendation, fetchRecommendations } from '@/learning/learning.api';
import { qk } from '@/query/keys';
import { formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';

/**
 * The real recommendation row (`backend/.../learning/recommendations.service.ts`
 * `RECOMMENDATION_SELECT` and `assessment.recommendations.ts`'s `proposal`
 * shape). The frontend's `RecommendationRecord` type declares a `proposedPath`
 * field that the API never sends — the real field is `proposal`, alongside
 * `rationale`, `origin`, `priority`, `confidence` and others the type omits —
 * so this page defines its own type rather than trusting the declared one.
 */
interface TopicEntry {
  topicId: string;
  topicName: string;
  accuracyPercent: number;
}
interface Proposal {
  overallPercent?: number;
  suggestedStartingBand?: string | null;
  practise?: TopicEntry[];
  consolidate?: TopicEntry[];
  advance?: TopicEntry[];
}
interface RecommendationRow {
  id: string;
  status: string;
  origin: string;
  rationale: string | null;
  proposal: Proposal | null;
  priority: number;
  evidenceSource: string;
  confidence: string;
  createdAt: string;
  student: { id: string; firstName: string; lastName: string; displayName: string };
  subject: { id: string; name: string; key: string } | null;
}

const CONFIDENCE_TONE = { LOW: 'warning', MODERATE: 'info', HIGH: 'success', INSUFFICIENT: 'neutral' } as const;

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

/** The approval queue: what the system proposes, and the teacher's decision. */
export function RecommendationsPage() {
  useDocumentTitle('To approve');
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: qk.recommendations.pending({ pendingOnly: true, page }),
    queryFn: async () =>
      (await fetchRecommendations({ pendingOnly: true, page, pageSize: 10 })) as unknown as {
        items: RecommendationRow[];
        meta: PageMeta;
      },
  });

  const rows = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="To approve"
        description="Nothing reaches a student until you approve it. Each suggestion shows why it was made, and you can change it before it goes out."
      />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<IconSuccess className="h-8 w-8" />}
            title="Nothing waiting"
            description="Every recommendation has been reviewed."
          />
        }
      >
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <RecommendationCard
              key={row.id}
              row={row}
              isDeciding={decidingId === row.id}
              onStart={() => setDecidingId(row.id)}
              onClose={() => setDecidingId(null)}
              onDone={() => {
                setDecidingId(null);
                void queryClient.invalidateQueries({ queryKey: qk.recommendations.all });
              }}
            />
          ))}
        </div>
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
      </QueryBoundary>
    </div>
  );
}

function RecommendationCard({
  row,
  isDeciding,
  onStart,
  onClose,
  onDone,
}: {
  row: RecommendationRow;
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
          <div className="flex items-center gap-2">
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

        {isDeciding ? (
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
            {topic.topicName} · {topic.accuracyPercent}%
          </Badge>
        ))}
      </div>
    </div>
  );
}
