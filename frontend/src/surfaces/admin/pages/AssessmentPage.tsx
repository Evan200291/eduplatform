import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconAssessment,
  IconExternal,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { fetchSubjects } from '@/academic/academic.api';
import { fetchTopics } from '@/curriculum/curriculum.api';
import { fetchActivities } from '@/content/content.api';
import {
  addAssessmentItem,
  createAssessment,
  fetchAssessment,
  fetchAssessments,
  moveAssessmentStatus,
  removeAssessmentItem,
  updateAssessment,
} from '@/assessment/assessment.api';
import type { AssessmentDefinition, AssessmentKind, CreateAssessmentInput } from '@/assessment/assessment.types';
import { CONTENT_STATUS_MOVE_LABEL, CONTENT_STATUS_TONE, nextContentStatuses } from '@/content/content-lifecycle';
import { paths } from '@/routes/paths';

const KIND_OPTIONS: Array<{ value: AssessmentKind; label: string }> = [
  { value: 'SCREENING', label: 'Screening' },
  { value: 'ONGOING_CHECK', label: 'Ongoing check' },
  { value: 'TOPIC_CHECK', label: 'Topic check' },
  { value: 'REASSESSMENT', label: 'Reassessment' },
  { value: 'TEACHER_ASSIGNED', label: 'Teacher-assigned' },
];

/**
 * Assessment banks: screening, ongoing checks and topic checks.
 *
 * Mastery thresholds are configured on curriculum topics, not here — this
 * screen authors the assessment shell (kind, timing, pass threshold) and its
 * item list; the questions themselves live on the activities the items point
 * at, edited from the Curriculum screen.
 */
export function AssessmentPage() {
  useDocumentTitle('Assessment');
  const canWrite = useCan('assessment.write');
  const [isCreating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: qk.assessment.definitions({ includeArchived: true, page }),
    queryFn: () => fetchAssessments({ includeArchived: true, page, pageSize: 20 }),
  });

  const columns: Column<AssessmentDefinition>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <button type="button" className="text-left text-primary-strong hover:underline" onClick={() => setOpenId(row.id)}>
          {row.title}
        </button>
      ),
    },
    { key: 'subject', header: 'Subject', render: (row) => row.subject.name },
    { key: 'topic', header: 'Topic', render: (row) => row.topic?.name ?? 'Cross-topic' },
    { key: 'kind', header: 'Kind', render: (row) => <Badge tone="brand">{row.kind}</Badge> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={CONTENT_STATUS_TONE[row.status]}>{row.status}</Badge> },
    {
      key: 'adaptive',
      header: 'Adaptive',
      render: (row) => (row.adaptiveEnabled ? <Badge tone="success">Adaptive</Badge> : <Badge>Fixed</Badge>),
    },
    { key: 'items', header: 'Items', isNumeric: true, render: (row) => row._count.items },
    { key: 'attempts', header: 'Attempts', isNumeric: true, render: (row) => row._count.attempts },
    { key: 'passThreshold', header: 'Pass threshold', isNumeric: true, render: (row) => `${row.passThreshold}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assessment"
        description="Screening, ongoing checks and topic checks. Mastery thresholds are set per topic."
        actions={
          <div className="flex items-center gap-3">
            <a
              href={paths.admin.curriculum}
              className="inline-flex items-center gap-1 text-sm text-primary-strong hover:underline"
            >
              Curriculum topics <IconExternal aria-hidden className="h-4 w-4" />
            </a>
            {canWrite ? (
              <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreating(true)}>
                New assessment
              </Button>
            ) : null}
          </div>
        }
      />

      <Card>
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          <DataTable
            caption="Assessment definitions"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                className="border-none"
                icon={<IconAssessment className="h-8 w-8" aria-hidden />}
                title="No assessments yet"
                action={
                  canWrite ? (
                    <Button size="sm" onClick={() => setCreating(true)}>
                      New assessment
                    </Button>
                  ) : undefined
                }
              />
            }
          />
          {query.data ? (
            <Pagination
              meta={query.data.meta}
              onPageChange={setPage}
              className="border-t border-line"
            />
          ) : null}
        </QueryBoundary>
      </Card>

      {isCreating ? (
        <CreateAssessmentModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      ) : null}

      {openId ? <AssessmentDetailModal assessmentId={openId} canWrite={canWrite} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function CreateAssessmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });
  const topics = useQuery({ queryKey: qk.curriculum.list({ scope: 'topics' }), queryFn: () => fetchTopics() });

  const [form, setForm] = useState<CreateAssessmentInput>({
    subjectId: '',
    topicId: undefined,
    kind: 'TOPIC_CHECK',
    title: '',
    itemTarget: undefined,
    timeLimitMinutes: undefined,
    passThreshold: 70,
    adaptiveEnabled: true,
  });

  const create = useMutation({
    mutationFn: () => createAssessment({ ...form, topicId: form.topicId || undefined }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: qk.assessment.definitions() });
      onCreated(created.id);
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="New assessment">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        {create.error ? <ErrorState error={create.error} /> : null}
        <Field label="Title" isRequired>
          <Input required value={form.title} onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))} />
        </Field>
        <Field label="Subject" isRequired>
          <Select
            required
            value={form.subjectId}
            onChange={(event) => setForm((f) => ({ ...f, subjectId: event.target.value }))}
            placeholder="Choose a subject"
            options={(subjects.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Topic" hint="Leave blank for a cross-topic assessment, such as screening.">
          <Select
            value={form.topicId ?? ''}
            onChange={(event) => setForm((f) => ({ ...f, topicId: event.target.value || undefined }))}
            placeholder="Cross-topic"
            options={(topics.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Kind" isRequired>
          <Select
            required
            value={form.kind}
            onChange={(event) => setForm((f) => ({ ...f, kind: event.target.value as AssessmentKind }))}
            options={KIND_OPTIONS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Item target" hint="Blank means all items.">
            <Input
              type="number"
              min={1}
              value={form.itemTarget ?? ''}
              onChange={(event) =>
                setForm((f) => ({ ...f, itemTarget: event.target.value ? Number(event.target.value) : undefined }))
              }
            />
          </Field>
          <Field label="Time limit (minutes)">
            <Input
              type="number"
              min={1}
              value={form.timeLimitMinutes ?? ''}
              onChange={(event) =>
                setForm((f) => ({ ...f, timeLimitMinutes: event.target.value ? Number(event.target.value) : undefined }))
              }
            />
          </Field>
        </div>
        <Field label="Pass threshold (%)" isRequired>
          <Input
            type="number"
            min={0}
            max={100}
            required
            value={form.passThreshold}
            onChange={(event) => setForm((f) => ({ ...f, passThreshold: Number(event.target.value) }))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssessmentDetailModal({
  assessmentId,
  canWrite,
  onClose,
}: {
  assessmentId: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.assessment.definition(assessmentId),
    queryFn: () => fetchAssessment(assessmentId),
  });
  const activities = useQuery({
    queryKey: qk.activities.list({ subjectId: query.data?.subjectId, pageSize: 50 }),
    queryFn: () => fetchActivities({ subjectId: query.data?.subjectId, pageSize: 50 }),
    enabled: Boolean(query.data?.subjectId),
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.assessment.definition(assessmentId) }),
      queryClient.invalidateQueries({ queryKey: qk.assessment.definitions() }),
    ]);

  const [description, setDescription] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (input: Partial<CreateAssessmentInput>) => updateAssessment(assessmentId, input),
    onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: (status: Parameters<typeof moveAssessmentStatus>[1]) => moveAssessmentStatus(assessmentId, status),
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: (activityId: string) => addAssessmentItem(assessmentId, { activityId }),
    onSuccess: invalidate,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => removeAssessmentItem(assessmentId, itemId),
    onSuccess: invalidate,
  });

  const [pickedActivityId, setPickedActivityId] = useState('');
  const assessment = query.data;
  const usedActivityIds = new Set((assessment?.items ?? []).map((item) => item.activityId));
  const availableActivities = (activities.data?.items ?? []).filter((a) => !usedActivityIds.has(a.id));

  return (
    <Modal isOpen onClose={onClose} title={assessment?.title ?? 'Assessment'} size="lg">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {assessment ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">{assessment.kind}</Badge>
                <Badge tone={CONTENT_STATUS_TONE[assessment.status]}>{assessment.status}</Badge>
                <span className="text-sm text-ink-muted">
                  {assessment.subject.name} · {assessment.topic?.name ?? 'Cross-topic'}
                </span>
              </div>
              {canWrite ? (
                <div className="flex items-center gap-2">
                  {nextContentStatuses(assessment.status)
                    .filter((next) => next !== 'DRAFT') // no route restores an assessment to draft
                    .map((next) => (
                      <Button
                        key={next}
                        size="sm"
                        variant="outline"
                        isLoading={move.isPending && move.variables === next}
                        onClick={() => move.mutate(next)}
                      >
                        {CONTENT_STATUS_MOVE_LABEL[next]}
                      </Button>
                    ))}
                </div>
              ) : null}
            </div>
            {move.error ? <ErrorState error={move.error} /> : null}

            {canWrite ? (
              <form
                className="grid grid-cols-2 gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate({
                    title: assessment.title,
                    passThreshold: assessment.passThreshold,
                    itemTarget: assessment.itemTarget ?? undefined,
                    timeLimitMinutes: assessment.timeLimitMinutes ?? undefined,
                    description: description ?? assessment.description ?? undefined,
                  });
                }}
              >
                {save.error ? <ErrorState error={save.error} /> : null}
                <Field label="Title" className="col-span-2">
                  <Input
                    value={assessment.title}
                    onChange={(event) =>
                      queryClient.setQueryData(qk.assessment.definition(assessmentId), {
                        ...assessment,
                        title: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Description" className="col-span-2">
                  <Textarea
                    rows={2}
                    value={description ?? assessment.description ?? ''}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field label="Pass threshold (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={assessment.passThreshold}
                    onChange={(event) =>
                      queryClient.setQueryData(qk.assessment.definition(assessmentId), {
                        ...assessment,
                        passThreshold: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Time limit (minutes)">
                  <Input
                    type="number"
                    min={1}
                    value={assessment.timeLimitMinutes ?? ''}
                    onChange={(event) =>
                      queryClient.setQueryData(qk.assessment.definition(assessmentId), {
                        ...assessment,
                        timeLimitMinutes: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  />
                </Field>
                <div className="col-span-2 flex justify-end">
                  <Button type="submit" size="sm" isLoading={save.isPending}>
                    Save details
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-ink-muted">{assessment.description ?? 'No description.'}</p>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium text-ink">Items ({assessment.items.length})</h3>
              {assessment.items.length === 0 ? (
                <p className="text-sm text-ink-muted">No items yet — this assessment has nothing to deliver.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line text-sm">
                  {assessment.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate text-ink">{item.activity.title}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone="neutral">{item.difficultyBand}</Badge>
                        {canWrite ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={removeItem.isPending && removeItem.variables === item.id}
                            onClick={() => removeItem.mutate(item.id)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? (
                <div className="mt-3 flex items-end gap-2">
                  <Field label="Add an activity as an item" className="flex-1">
                    <Select
                      value={pickedActivityId}
                      onChange={(event) => setPickedActivityId(event.target.value)}
                      placeholder={activities.isPending ? 'Loading activities…' : 'Choose an activity'}
                      options={availableActivities.map((a) => ({ value: a.id, label: `${a.title} (${a.status})` }))}
                    />
                  </Field>
                  <Button
                    size="sm"
                    disabled={!pickedActivityId}
                    isLoading={addItem.isPending}
                    onClick={() => {
                      addItem.mutate(pickedActivityId);
                      setPickedActivityId('');
                    }}
                  >
                    Add
                  </Button>
                </div>
              ) : null}
              {addItem.error ? <ErrorState error={addItem.error} /> : null}
            </div>
          </div>
        ) : null}
      </QueryBoundary>
    </Modal>
  );
}
