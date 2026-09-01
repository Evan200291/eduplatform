import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/api';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconArchive,
  IconBack,
  IconEdit,
  IconSend,
  Input,
  Modal,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import {
  archiveAssignment,
  fetchAssignment,
  fetchAssignmentMonitor,
  giveAttemptFeedback,
  publishAssignment,
  updateAssignment,
} from '@/assignments/assignments.api';
import type { Assignment } from '@/assignments/assignments.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate, formatDateTime } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';

const STATE_TONE = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  SUBMITTED: 'warning',
  COMPLETED: 'success',
  OVERDUE: 'danger',
  EXCUSED: 'neutral',
} as const;

/**
 * The real shape of `GET /assignments/:id/monitor`
 * (`backend/src/modules/assignments/assignments.service.ts` `getMonitorBoard`) —
 * the frontend `fetchAssignmentMonitor` return type (`{ attempts, byState }`)
 * does not match what the endpoint actually sends (`{ assignment, totals,
 * summary, rows }`), so this page defines its own type for it rather than
 * trusting the declared one.
 */
interface MonitorAttempt {
  id: string;
  state: string;
  attemptNumber: number;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  isLate: boolean;
  scorePercent: number | null;
  pointsAwarded: number | null;
  timeSpentSeconds: number;
  excusedAt: string | null;
  excusedReason: string | null;
  teacherFeedback: string | null;
  feedbackAt: string | null;
}
interface MonitorRow {
  student: { id: string; firstName: string; lastName: string; displayName: string };
  attempt: MonitorAttempt | null;
  state: string;
}
interface MonitorBoard {
  totals: Record<string, number>;
  summary: { targeted: number; averageScorePercent: number | null; lateCount: number; awaitingFeedback: number };
  rows: MonitorRow[];
}

type AttemptAction = { kind: 'feedback' | 'excuse' | 'unexcuse'; row: MonitorRow };

/** One assignment: who has done it, and feedback/excuse actions per learner. */
export function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  if (!assignmentId) return <Navigate to={paths.teach.assignments} replace />;
  return <AssignmentDetail assignmentId={assignmentId} />;
}

function AssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const queryClient = useQueryClient();
  const canGrade = useCan('assignment.grade');
  const canExcuse = useCan('assignment.excuse');
  const canWrite = useCan('assignment.write');
  const [action, setAction] = useState<AttemptAction | null>(null);
  const [isEditing, setEditing] = useState(false);

  const invalidateAssignment = () => {
    void queryClient.invalidateQueries({ queryKey: qk.assignments.detail(assignmentId) });
    void queryClient.invalidateQueries({ queryKey: qk.assignments.all });
  };

  const publish = useMutation({
    mutationFn: () => publishAssignment(assignmentId),
    onSuccess: invalidateAssignment,
  });
  const archive = useMutation({
    mutationFn: () => archiveAssignment(assignmentId),
    onSuccess: invalidateAssignment,
  });

  const assignmentQuery = useQuery({
    queryKey: qk.assignments.detail(assignmentId),
    queryFn: () => fetchAssignment(assignmentId),
  });
  const monitorQuery = useQuery({
    queryKey: qk.assignments.monitor(assignmentId),
    queryFn: async () => (await fetchAssignmentMonitor(assignmentId)) as unknown as MonitorBoard,
  });

  useDocumentTitle(assignmentQuery.data?.title ?? 'Assignment');

  const invalidateMonitor = () => {
    void queryClient.invalidateQueries({ queryKey: qk.assignments.monitor(assignmentId) });
  };

  const board = monitorQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <ButtonLink
            to={paths.teach.assignments}
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
          >
            All homework
          </ButtonLink>
        }
        title={assignmentQuery.data?.title ?? 'Assignment'}
        description={
          assignmentQuery.data
            ? `${humanize(assignmentQuery.data.kind)}${assignmentQuery.data.dueAt ? ` · Due ${formatDate(assignmentQuery.data.dueAt)}` : ''}`
            : undefined
        }
        actions={
          assignmentQuery.data ? (
            <div className="flex items-center gap-2">
              <Badge tone={assignmentQuery.data.archivedAt ? 'neutral' : assignmentQuery.data.isPublished ? 'success' : 'warning'}>
                {assignmentQuery.data.archivedAt
                  ? 'Archived'
                  : assignmentQuery.data.isPublished
                    ? 'Published'
                    : 'Draft'}
              </Badge>
              {canWrite ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    leadingIcon={<IconEdit aria-hidden className="h-4 w-4" />}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                  {!assignmentQuery.data.isPublished && !assignmentQuery.data.archivedAt ? (
                    <Button
                      variant="outline"
                      size="sm"
                      leadingIcon={<IconSend aria-hidden className="h-4 w-4" />}
                      onClick={() => publish.mutate()}
                      isLoading={publish.isPending}
                    >
                      Publish
                    </Button>
                  ) : null}
                  {!assignmentQuery.data.archivedAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<IconArchive aria-hidden className="h-4 w-4" />}
                      onClick={() => archive.mutate()}
                      isLoading={archive.isPending}
                    >
                      Archive
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      {board ? (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Targeted" value={board.summary.targeted} />
          <Stat
            label="Average score"
            value={board.summary.averageScorePercent !== null ? `${board.summary.averageScorePercent}%` : '—'}
          />
          <Stat label="Late" value={board.summary.lateCount} />
            <Stat label="Awaiting feedback" value={board.summary.awaitingFeedback} />
        </div>
      ) : null}

      {publish.error ? <ErrorState error={publish.error} /> : null}
      {archive.error ? <ErrorState error={archive.error} /> : null}

      <Card>
        <CardHeader title="Learners" description="One row per learner this assignment reaches." />
        <CardBody className="p-0">
          <QueryBoundary
            isLoading={monitorQuery.isPending || assignmentQuery.isPending}
            error={monitorQuery.error ?? assignmentQuery.error}
            onRetry={() => {
              void monitorQuery.refetch();
              void assignmentQuery.refetch();
            }}
            isEmpty={(board?.rows.length ?? 0) === 0}
            emptyState={<EmptyState title="Nobody is targeted yet" className="border-none py-6" />}
          >
            <ul className="divide-y divide-line">
              {(board?.rows ?? []).map((row) => (
                <li key={row.student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={row.student.displayName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-ink">{row.student.displayName}</p>
                      {row.attempt?.submittedAt ? (
                        <p className="text-xs text-ink-muted">Submitted {formatDateTime(row.attempt.submittedAt)}</p>
                      ) : null}
                      {row.attempt?.teacherFeedback ? (
                        <p className="text-xs text-ink-muted">Feedback given</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.attempt?.scorePercent !== null && row.attempt?.scorePercent !== undefined ? (
                      <span className="text-ink-muted">{row.attempt.scorePercent}%</span>
                    ) : null}
                    <Badge tone={toneFor(STATE_TONE, row.state)}>{humanize(row.state)}</Badge>
                    {canGrade && row.attempt ? (
                      <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'feedback', row })}>
                        Feedback
                      </Button>
                    ) : null}
                    {canExcuse && row.state !== 'EXCUSED' ? (
                      <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'excuse', row })}>
                        Excuse
                      </Button>
                    ) : null}
                    {canExcuse && row.state === 'EXCUSED' ? (
                      <Button variant="outline" size="sm" onClick={() => setAction({ kind: 'unexcuse', row })}>
                        Unexcuse
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </QueryBoundary>
        </CardBody>
      </Card>

      {action ? (
        <AttemptActionModal
          assignmentId={assignmentId}
          action={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            invalidateMonitor();
          }}
        />
      ) : null}

      {isEditing && assignmentQuery.data ? (
        <EditAssignmentModal
          assignment={assignmentQuery.data}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            invalidateAssignment();
          }}
        />
      ) : null}
    </div>
  );
}

function EditAssignmentModal({
  assignment,
  onClose,
  onDone,
}: {
  assignment: Assignment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [instructions, setInstructions] = useState(assignment.instructions ?? '');
  const [dueAt, setDueAt] = useState(assignment.dueAt ? assignment.dueAt.slice(0, 10) : '');
  const [pointsValue, setPointsValue] = useState(String(assignment.pointsValue));

  const mutation = useMutation({
    mutationFn: () =>
      updateAssignment(assignment.id, {
        title: title.trim(),
        instructions: instructions.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        pointsValue: Number(pointsValue) || 0,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit assignment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending} disabled={title.trim().length < 2}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Title" isRequired>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Instructions">
          <Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={4} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
          <Field label="Points">
            <Input type="number" min={0} value={pointsValue} onChange={(event) => setPointsValue(event.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-primary-muted bg-primary-soft p-3">
      <p className="text-primary-strong">{label}</p>
      <p className="text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

/**
 * Feedback goes through the (correctly wired) `giveAttemptFeedback` client call.
 * Excuse/unexcuse do not: `assignments.api.ts`'s `excuseAttempt`/`unexcuseAttempt`
 * post to `/assignments/attempts/:id/excuse`, a route that does not exist —
 * the backend only has `POST /assignments/:assignmentId/excuse` with a
 * `studentIds` array (`assignments.routes.ts`). Calling those two client
 * functions as written would 404, so this posts to the real endpoint directly.
 */
function AttemptActionModal({
  assignmentId,
  action,
  onClose,
  onDone,
}: {
  assignmentId: string;
  action: AttemptAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      if (action.kind === 'feedback') {
        return giveAttemptFeedback(action.row.attempt!.id, text.trim());
      }
      return apiPost(`/assignments/${encodeURIComponent(assignmentId)}/${action.kind === 'excuse' ? 'excuse' : 'unexcuse'}`, {
        studentIds: [action.row.student.id],
        reason: text.trim(),
      });
    },
    onSuccess: onDone,
  });

  const titles = {
    feedback: 'Give feedback',
    excuse: 'Excuse this learner',
    unexcuse: 'Reinstate this learner',
  };
  const labels = {
    feedback: 'Feedback',
    excuse: 'Reason for excusing',
    unexcuse: 'Reason for reinstating',
  };
  const minLength = action.kind === 'feedback' ? 2 : 4;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${titles[action.kind]} · ${action.row.student.displayName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={text.trim().length < minLength}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label={labels[action.kind]} isRequired>
          <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
