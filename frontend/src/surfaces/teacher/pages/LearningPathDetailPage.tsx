import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconBack,
  IconAdd,
  IconEdit,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import {
  addPathItem,
  approveLearningPath,
  fetchLearningPath,
  refreshPathUnlocks,
  removePathItem,
  reorderPathItems,
  updateLearningPath,
  updatePathItem,
} from '@/learning/learning.api';
import { fetchActivities, fetchLessons } from '@/content/content.api';
import type { LearningPath, PathItem } from '@/learning/learning.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';
import { ArchivePathModal } from './PathPlanning';

const STATUS_TONE = {
  LOCKED: 'neutral',
  AVAILABLE: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  SKIPPED: 'neutral',
} as const;

function stepTitle(item: PathItem): string {
  return item.topic?.name ?? item.lesson?.title ?? item.activity?.title ?? item.assessment?.title ?? 'Step';
}

/** One learning path: its steps, who is on it, and an approval action when it needs one. */
export function LearningPathDetailPage() {
  const { pathId } = useParams<{ pathId: string }>();
  if (!pathId) return <Navigate to={paths.teach.paths} replace />;
  return <LearningPathDetail pathId={pathId} />;
}

function LearningPathDetail({ pathId }: { pathId: string }) {
  const queryClient = useQueryClient();
  const canApprove = useCan('learningpath.approve');
  const canWrite = useCan('learningpath.write');
  const navigate = useNavigate();
  const [isArchiving, setArchiving] = useState(false);
  const [isEditingPath, setEditingPath] = useState(false);
  const [editingItem, setEditingItem] = useState<PathItem | null>(null);
  const [removingItem, setRemovingItem] = useState<PathItem | null>(null);
  const [isAdding, setAdding] = useState(false);

  const pathQuery = useQuery({ queryKey: qk.learningPaths.detail(pathId), queryFn: () => fetchLearningPath(pathId) });
  useDocumentTitle(pathQuery.data ? `${pathQuery.data.subject.name} path` : 'Learning path');

  const invalidatePath = () => {
    void queryClient.invalidateQueries({ queryKey: qk.learningPaths.detail(pathId) });
    void queryClient.invalidateQueries({ queryKey: qk.learningPaths.all });
  };

  const approve = useMutation({
    mutationFn: () => approveLearningPath(pathId),
    onSuccess: invalidatePath,
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => reorderPathItems(pathId, items),
    onSuccess: invalidatePath,
  });

  const refresh = useMutation({ mutationFn: () => refreshPathUnlocks(pathId), onSuccess: invalidatePath });

  /** Swap with a neighbour and renumber the whole list; the server takes positions, not deltas. */
  const move = (items: PathItem[], index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((item, position) => ({ id: item.id, sortOrder: position })));
  };

  const data = pathQuery.data;
  const needsApproval = Boolean(data?.requiresApproval && !data.summary.isApproved);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <ButtonLink
            to={paths.teach.paths}
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
          >
            All learning paths
          </ButtonLink>
        }
        title={data ? `${data.student.displayName} · ${data.subject.name}` : 'Learning path'}
        description={data ? `${humanize(data.mode)} · v${data.version}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {canWrite && data ? (
              <Button
                variant="outline"
                size="sm"
                leadingIcon={<IconEdit aria-hidden className="h-4 w-4" />}
                onClick={() => setEditingPath(true)}
              >
                Edit pacing
              </Button>
            ) : null}
            {canWrite && data ? (
              <Button variant="ghost" size="sm" onClick={() => setArchiving(true)}>
                Archive
              </Button>
            ) : null}
            {needsApproval && canApprove ? (
              <Button onClick={() => approve.mutate()} isLoading={approve.isPending}>
                Approve path
              </Button>
            ) : null}
          </div>
        }
      />

      {isArchiving && data ? (
        <ArchivePathModal path={data} onClose={() => setArchiving(false)} onDone={() => navigate(paths.teach.paths)} />
      ) : null}

      <QueryBoundary
        isLoading={pathQuery.isPending}
        error={pathQuery.error}
        onRetry={() => void pathQuery.refetch()}
      >
        {data ? (
          <div className="flex flex-col gap-6">
            {approve.error ? <ErrorState error={approve.error} /> : null}

            <Card>
              <CardBody className="flex flex-col gap-3">
                <ProgressBar value={data.summary.completionPercent} label="Path completion" />
                <div className="flex flex-wrap gap-4 text-sm text-ink-muted">
                  <span>
                    Steps <span className="font-medium text-ink">{data.summary.stepsCompleted}/{data.summary.stepsTotal}</span>
                  </span>
                  <span>
                    Approval{' '}
                    {!data.requiresApproval ? (
                      <Badge tone="neutral">Not required</Badge>
                    ) : data.summary.isApproved ? (
                      <Badge tone="success">Approved</Badge>
                    ) : (
                      <Badge tone="warning">Waiting</Badge>
                    )}
                  </span>
                  {data.generatorNote ? <span>{data.generatorNote}</span> : null}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Steps"
                description={`${data.items.length} step(s) in order`}
                actions={
                  canWrite ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={refresh.isPending}
                        onClick={() => refresh.mutate()}
                      >
                        Re-check unlocks
                      </Button>
                      <Button
                        size="sm"
                        leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
                        onClick={() => setAdding(true)}
                      >
                        Add a step
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              {reorder.error ? <ErrorState error={reorder.error} /> : null}
              {refresh.error ? <ErrorState error={refresh.error} /> : null}
              <CardBody className="p-0">
                {data.items.length === 0 ? (
                  <EmptyState title="No steps yet" className="border-none py-6" />
                ) : (
                  <ol className="divide-y divide-line">
                    {data.items.map((item, index) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="tabular-nums text-ink-muted">{index + 1}.</span>
                          <div className="min-w-0">
                            <p className="truncate text-ink">
                              {stepTitle(item)}
                              {!item.isRequired ? <span className="ml-2 text-xs text-ink-muted">optional</span> : null}
                            </p>
                            {item.dueAt ? (
                              <p className="text-xs text-ink-muted">Due {formatDate(item.dueAt)}</p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone={toneFor(STATUS_TONE, item.status)}>{humanize(item.status)}</Badge>
                          {canWrite ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Move step ${index + 1} earlier`}
                                disabled={index === 0 || reorder.isPending}
                                onClick={() => move(data.items, index, -1)}
                              >
                                ↑
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Move step ${index + 1} later`}
                                disabled={index === data.items.length - 1 || reorder.isPending}
                                onClick={() => move(data.items, index, 1)}
                              >
                                ↓
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingItem(item)}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setRemovingItem(item)}>
                                Remove
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </QueryBoundary>

      {isEditingPath && data ? (
        <EditPathModal
          path={data}
          onClose={() => setEditingPath(false)}
          onDone={() => {
            setEditingPath(false);
            invalidatePath();
          }}
        />
      ) : null}

      {removingItem && data ? (
        <RemoveStepModal
          pathId={data.id}
          item={removingItem}
          onClose={() => setRemovingItem(null)}
          onDone={() => {
            setRemovingItem(null);
            invalidatePath();
          }}
        />
      ) : null}

      {isAdding && data ? (
        <AddStepModal
          path={data}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            invalidatePath();
          }}
        />
      ) : null}

      {editingItem && data ? (
        <EditPathItemModal
          pathId={data.id}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onDone={() => {
            setEditingItem(null);
            invalidatePath();
          }}
        />
      ) : null}
    </div>
  );
}

function EditPathModal({ path, onClose, onDone }: { path: LearningPath; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(path.name);
  const [notes, setNotes] = useState(path.generatorNote ?? '');

  const mutation = useMutation({
    mutationFn: () => updateLearningPath(path.id, { name: name.trim(), notes: notes.trim() || undefined }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit path pacing"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending} disabled={name.trim().length < 2}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Note" hint="Shown to the learner and other staff alongside this path.">
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}

function EditPathItemModal({
  pathId,
  item,
  onClose,
  onDone,
}: {
  pathId: string;
  item: PathItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dueAt, setDueAt] = useState(item.dueAt ? item.dueAt.slice(0, 10) : '');
  const [isRequired, setIsRequired] = useState(item.isRequired);

  const mutation = useMutation({
    mutationFn: () =>
      updatePathItem(pathId, item.id, {
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        isRequired,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit step · ${stepTitle(item)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Due date">
          <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </Field>
        <Checkbox
          label="Required to complete the path"
          checked={isRequired}
          onChange={(event) => setIsRequired(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

/**
 * Dropping a step. The server keeps it as history — what was planned and why it
 * was dropped — so a reason is required rather than offered.
 */
function RemoveStepModal({
  pathId,
  item,
  onClose,
  onDone,
}: {
  pathId: string;
  item: PathItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => removePathItem(pathId, item.id, reason.trim()),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Remove "${stepTitle(item)}"`}
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 4}
            onClick={() => mutation.mutate()}
          >
            Remove step
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          The step stays in the path&rsquo;s history, marked as removed by a teacher. The
          learner&rsquo;s past work on it is kept.
        </p>
        <Field label="Why is it being removed?" hint="Kept on the record. At least four characters.">
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Adding a step from this subject's lessons or activities.
 *
 * The picker is scoped to the path's subject: a maths path does not need the
 * whole school's content library, and offering it would make the one right
 * choice harder to find.
 */
function AddStepModal({
  path,
  onClose,
  onDone,
}: {
  path: LearningPath;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<'activity' | 'lesson'>('activity');
  const [targetId, setTargetId] = useState('');
  const [isRequired, setRequired] = useState(true);
  const [dueAt, setDueAt] = useState('');
  const [reason, setReason] = useState('');

  const activities = useQuery({
    queryKey: qk.activities.list({ subjectId: path.subjectId, pageSize: 100 }),
    queryFn: () => fetchActivities({ subjectId: path.subjectId, pageSize: 100 }),
    enabled: kind === 'activity',
  });
  const lessons = useQuery({
    queryKey: qk.lessons.list({ subjectId: path.subjectId, pageSize: 100 }),
    queryFn: () => fetchLessons({ subjectId: path.subjectId, pageSize: 100 }),
    enabled: kind === 'lesson',
  });

  const source = kind === 'activity' ? activities : lessons;
  const options = (kind === 'activity' ? activities.data?.items ?? [] : lessons.data?.items ?? []).map(
    (entry) => ({ value: entry.id, label: entry.title }),
  );

  const mutation = useMutation({
    mutationFn: () =>
      addPathItem(path.id, {
        ...(kind === 'activity' ? { activityId: targetId } : { lessonId: targetId }),
        sortOrder: path.items.length,
        isRequired,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        reason: reason.trim() || undefined,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Add a step"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!targetId} onClick={() => mutation.mutate()}>
            Add to path
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}

        <Field label="Kind of step">
          <Select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as 'activity' | 'lesson');
              setTargetId('');
            }}
            options={[
              { value: 'activity', label: 'Activity' },
              { value: 'lesson', label: 'Lesson' },
            ]}
          />
        </Field>

        <QueryBoundary isLoading={source.isPending} error={source.error} onRetry={() => void source.refetch()}>
          {options.length === 0 ? (
            <EmptyState
              title={`No ${kind === 'activity' ? 'activities' : 'lessons'} in ${path.subject.name} yet`}
              description="Content is authored in the admin panel's Curriculum screen."
            />
          ) : (
            <Field label={kind === 'activity' ? 'Activity' : 'Lesson'} hint="Added at the end; move it afterwards.">
              <Select
                value={targetId}
                placeholder="Choose one"
                onChange={(event) => setTargetId(event.target.value)}
                options={options}
              />
            </Field>
          )}
        </QueryBoundary>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Due date" hint="Optional.">
            <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Checkbox
              label="Required step"
              hint="Optional steps can be skipped without blocking the path."
              checked={isRequired}
              onChange={(event) => setRequired(event.target.checked)}
            />
          </div>
        </div>

        <Field label="Note for the record" hint="Optional — why this step was added.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
