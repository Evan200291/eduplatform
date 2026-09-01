import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
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
  IconEdit,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { approveLearningPath, fetchLearningPath, updateLearningPath, updatePathItem } from '@/learning/learning.api';
import type { LearningPath, PathItem } from '@/learning/learning.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';

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
  const [isEditingPath, setEditingPath] = useState(false);
  const [editingItem, setEditingItem] = useState<PathItem | null>(null);

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
            {needsApproval && canApprove ? (
              <Button onClick={() => approve.mutate()} isLoading={approve.isPending}>
                Approve path
              </Button>
            ) : null}
          </div>
        }
      />

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
              <CardHeader title="Steps" description={`${data.items.length} step(s) in order`} />
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
                            <Button variant="ghost" size="sm" onClick={() => setEditingItem(item)}>
                              Edit
                            </Button>
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
