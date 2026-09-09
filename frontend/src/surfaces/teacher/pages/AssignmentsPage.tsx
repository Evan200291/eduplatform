import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconAssignment,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  type Column,
  type SelectOption,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { createAssignment, fetchAssignments, publishAssignment } from '@/assignments/assignments.api';
import { fetchClassRoster, fetchMyClasses } from '@/academic/academic.api';
import type { Assignment } from '@/assignments/assignments.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize } from '../lib/humanize';

/**
 * The kinds a schema actually accepts (`backend/.../assignments.validation.ts`
 * `AssignmentKind`) — wider than the frontend's own `AssignmentKind` union, which
 * is missing `MISSION` and `HOMEWORK`.
 */
const KIND_OPTIONS: SelectOption[] = [
  { value: 'HOMEWORK', label: 'Homework' },
  { value: 'TASK', label: 'Task' },
  { value: 'LESSON', label: 'Lesson' },
  { value: 'ACTIVITY', label: 'Activity' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'ASSESSMENT', label: 'Assessment' },
  { value: 'MISSION', label: 'Mission' },
];

const WORK_TYPE_OPTIONS: SelectOption[] = [
  { value: 'topicId', label: 'Topic' },
  { value: 'lessonId', label: 'Lesson' },
  { value: 'activityId', label: 'Activity' },
  { value: 'assessmentId', label: 'Assessment' },
];

/** What has been set, plus a simple flow for setting more. */
export function AssignmentsPage() {
  useDocumentTitle('Homework');
  const navigate = useNavigate();
  const canWrite = useCan('assignment.write');
  const [classFilter, setClassFilter] = useState('');
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const classesQuery = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });
  const assignmentsQuery = useQuery({
    queryKey: qk.assignments.list({ classId: classFilter || undefined, page }),
    queryFn: () => fetchAssignments({ classId: classFilter || undefined, page, pageSize: 20 }),
  });

  const rows = assignmentsQuery.data?.items ?? [];

  const columns: Column<Assignment>[] = [
    { key: 'title', header: 'Title', render: (row) => <span className="text-ink">{row.title}</span> },
    { key: 'kind', header: 'Kind', className: 'hidden sm:table-cell', render: (row) => humanize(row.kind) },
    {
      key: 'due',
      header: 'Due',
      className: 'hidden md:table-cell',
      render: (row) => (row.dueAt ? formatDate(row.dueAt) : '—'),
    },
    { key: 'points', header: 'Points', isNumeric: true, render: (row) => row.pointsValue },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isPublished ? 'success' : 'neutral'}>{row.isPublished ? 'Published' : 'Draft'}</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Homework"
        description="Assignments, their due dates, and how many have been handed in."
        actions={
          canWrite ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New assignment
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="border-b border-line p-4">
          <Field label="Class" className="w-56">
            <Select
              placeholder="All classes"
              options={(classesQuery.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={classFilter}
              onChange={(event) => {
                setClassFilter(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>

        <QueryBoundary
          isLoading={assignmentsQuery.isPending}
          error={assignmentsQuery.error}
          onRetry={() => void assignmentsQuery.refetch()}
          isEmpty={rows.length === 0}
          emptyState={
            <EmptyState
              className="border-none"
              icon={<IconAssignment className="h-8 w-8" />}
              title="Nothing set yet"
              description="Assignments you create will show up here."
            />
          }
        >
          <DataTable
            caption="Homework you have set"
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.teach.assignmentDetail(row.id))}
          />
          {assignmentsQuery.data ? (
            <Pagination
              meta={assignmentsQuery.data.meta}
              onPageChange={setPage}
              className="border-t border-line"
            />
          ) : null}
        </QueryBoundary>
      </Card>

      {isCreateOpen ? (
        <CreateAssignmentModal
          classes={classesQuery.data?.items ?? []}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CreateAssignmentModal({
  classes,
  onClose,
}: {
  classes: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('HOMEWORK');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [audience, setAudience] = useState<'CLASS' | 'STUDENT'>('CLASS');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [workType, setWorkType] = useState('activityId');
  const [workId, setWorkId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [pointsValue, setPointsValue] = useState('10');
  const [publishNow, setPublishNow] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const input: Record<string, unknown> = {
        title: title.trim(),
        kind,
        classId,
        pointsValue: Number(pointsValue) || 0,
        targets:
          audience === 'CLASS'
            ? [{ targetType: 'CLASS', targetId: classId }]
            : studentIds.map((id) => ({ targetType: 'STUDENT', targetId: id })),
        [workType]: workId.trim(),
      };
      if (dueAt) input.dueAt = new Date(dueAt).toISOString();

      const created = await createAssignment(input);
      if (publishNow) await publishAssignment(created.id);
      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      onClose();
    },
  });

  const canSubmit =
    title.trim().length > 1 &&
    classId.length > 0 &&
    workId.trim().length > 0 &&
    (audience === 'CLASS' || studentIds.length > 0);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="New assignment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} isLoading={create.isPending} disabled={!canSubmit}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error ? <ErrorState error={create.error} /> : null}

        <Field label="Title" isRequired>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Fractions practice" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" isRequired>
            <Select options={KIND_OPTIONS} value={kind} onChange={(event) => setKind(event.target.value)} />
          </Field>
          <Field label="Class" isRequired hint={classes.length === 0 ? 'You have no classes yet.' : undefined}>
            <Select
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={classes.length === 0}
            />
          </Field>
        </div>

        <AudiencePicker
          classId={classId}
          audience={audience}
          studentIds={studentIds}
          onAudienceChange={(next) => {
            setAudience(next);
            setStudentIds([]);
          }}
          onStudentIdsChange={setStudentIds}
        />

        <div className="grid grid-cols-[auto_1fr] gap-3">
          <Field label="Work item">
            <Select options={WORK_TYPE_OPTIONS} value={workType} onChange={(event) => setWorkType(event.target.value)} />
          </Field>
          <Field label="Content ID" isRequired hint="The id of the lesson, activity, assessment or topic to set.">
            <Input value={workId} onChange={(event) => setWorkId(event.target.value)} placeholder="e.g. activity id" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
          <Field label="Points">
            <Input
              type="number"
              min={0}
              value={pointsValue}
              onChange={(event) => setPointsValue(event.target.value)}
            />
          </Field>
        </div>

        <Checkbox
          label="Publish immediately"
          hint="Otherwise this is saved as a draft learners cannot see yet."
          checked={publishNow}
          onChange={(event) => setPublishNow(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

/**
 * Who an assignment goes to.
 *
 * The server has always accepted five target types — student, group, class,
 * grade and subject — and this form only ever sent `CLASS`, so setting work for
 * one learner meant setting it for everybody. The two that matter for the pilot
 * are the whole class and named individuals; grade and subject targeting exist
 * on the server and can be surfaced when a school asks for them.
 *
 * Picking individuals loads the class roster rather than every learner in the
 * school, because assigning across classes is not something a teacher's scope
 * permits anyway — the server would reject it, and offering it would be a
 * control that fails on use.
 */
function AudiencePicker({
  classId,
  audience,
  studentIds,
  onAudienceChange,
  onStudentIdsChange,
}: {
  classId: string;
  audience: 'CLASS' | 'STUDENT';
  studentIds: string[];
  onAudienceChange: (next: 'CLASS' | 'STUDENT') => void;
  onStudentIdsChange: (next: string[]) => void;
}) {
  const roster = useQuery({
    queryKey: qk.classes.roster(classId),
    queryFn: () => fetchClassRoster(classId),
    enabled: audience === 'STUDENT' && classId.length > 0,
  });

  const learners = (roster.data ?? []).filter((entry) => entry.isActive);

  return (
    <div className="flex flex-col gap-3">
      <Field label="Give this to" isRequired>
        <Select
          value={audience}
          onChange={(event) => onAudienceChange(event.target.value as 'CLASS' | 'STUDENT')}
          options={[
            { value: 'CLASS', label: 'Everyone in the class' },
            { value: 'STUDENT', label: 'Chosen learners only' },
          ]}
        />
      </Field>

      {audience === 'STUDENT' ? (
        <QueryBoundary
          isLoading={roster.isPending}
          error={roster.error}
          onRetry={() => void roster.refetch()}
        >
          {learners.length === 0 ? (
            <EmptyState
              title="Nobody is enrolled in this class"
              description="Add learners to the class before setting work for individuals."
            />
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-md border border-border p-3">
              <div className="flex flex-col gap-2">
                {learners.map((entry) => (
                  <Checkbox
                    key={entry.user.id}
                    label={entry.user.displayName}
                    checked={studentIds.includes(entry.user.id)}
                    onChange={(event) =>
                      onStudentIdsChange(
                        event.target.checked
                          ? [...studentIds, entry.user.id]
                          : studentIds.filter((id) => id !== entry.user.id),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            {studentIds.length === 0
              ? 'Choose at least one learner.'
              : `${studentIds.length} ${studentIds.length === 1 ? 'learner' : 'learners'} selected.`}
          </p>
        </QueryBoundary>
      ) : null}
    </div>
  );
}
