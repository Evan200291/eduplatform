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
  Textarea,
  type Column,
  type SelectOption,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { createAssignment, fetchAssignments } from '@/assignments/assignments.api';
import { fetchClassRoster, fetchMyClasses, fetchSubjects } from '@/academic/academic.api';
import { fetchTopics } from '@/curriculum/curriculum.api';
import { fetchActivities, fetchLessons } from '@/content/content.api';
import { fetchAssessments } from '@/assessment/assessment.api';
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

type WorkType = 'topicId' | 'lessonId' | 'activityId' | 'assessmentId';

const WORK_TYPE_OPTIONS: { value: WorkType; label: string }[] = [
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
  const [template, setTemplate] = useState<Assignment | null>(null);
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
    ...(canWrite
      ? [
          {
            key: 'again',
            header: <span className="sr-only">Reuse</span>,
            render: (row: Assignment) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={(event) => {
                  // The row itself opens the assignment; this button must not.
                  event.stopPropagation();
                  setTemplate(row);
                }}
              >
                Set again
              </Button>
            ),
          },
        ]
      : []),
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

      {isCreateOpen || template ? (
        <CreateAssignmentModal
          classes={classesQuery.data?.items ?? []}
          template={template}
          onClose={() => {
            setCreateOpen(false);
            setTemplate(null);
          }}
        />
      ) : null}
    </div>
  );
}

const LATE_OPTIONS: SelectOption[] = [
  { value: 'ALLOW_LATE_FLAGGED', label: 'Accept late work, marked late' },
  { value: 'ALLOW_UNTIL_GRACE_END', label: 'Accept late work for a grace period' },
  { value: 'ALLOW_LATE_SILENT', label: 'Accept late work without marking it' },
  { value: 'BLOCK_AFTER_DUE', label: 'Close at the due time' },
];

/**
 * The content picker that replaced a free-text "content ID" box: choose the
 * subject, then the kind of work, then the item — only items that exist, in
 * that subject, that a learner can actually open.
 */
function ContentPicker({
  subjectId,
  workType,
  workId,
  onSubjectChange,
  onWorkTypeChange,
  onWorkIdChange,
}: {
  subjectId: string;
  workType: WorkType;
  workId: string;
  onSubjectChange: (value: string) => void;
  onWorkTypeChange: (value: WorkType) => void;
  onWorkIdChange: (value: string) => void;
}) {
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: fetchSubjects });
  const enabled = subjectId.length > 0;
  const params = { subjectId, pageSize: 100 };

  const options = useQuery({
    queryKey: qk.assignments.content(workType, subjectId),
    enabled,
    queryFn: async (): Promise<SelectOption[]> => {
      if (workType === 'topicId') {
        return (await fetchTopics(params)).items.map((row) => ({ value: row.id, label: row.name }));
      }
      if (workType === 'lessonId') {
        return (await fetchLessons({ ...params, status: 'PUBLISHED' })).items.map((row) => ({ value: row.id, label: row.title }));
      }
      if (workType === 'activityId') {
        return (await fetchActivities({ ...params, status: 'PUBLISHED' })).items.map((row) => ({
          value: row.id,
          label: `${row.title} (${humanize(row.type).toLowerCase()})`,
        }));
      }
      return (await fetchAssessments({ ...params, status: 'PUBLISHED' })).items.map((row) => ({
        value: row.id,
        label: row.title,
      }));
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <p className="text-sm font-medium text-ink">What to do</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Subject" isRequired>
          <Select
            value={subjectId}
            placeholder={subjects.isPending ? 'Loading…' : 'Choose a subject'}
            onChange={(event) => {
              onSubjectChange(event.target.value);
              onWorkIdChange('');
            }}
            options={(subjects.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
          />
        </Field>
        <Field label="Kind of work">
          <Select
            value={workType}
            onChange={(event) => {
              onWorkTypeChange(event.target.value as WorkType);
              onWorkIdChange('');
            }}
            options={WORK_TYPE_OPTIONS}
          />
        </Field>
      </div>
      {enabled ? (
        options.error ? (
          <ErrorState error={options.error} />
        ) : (
          <Field
            label="Item"
            isRequired
            hint={
              workType === 'assessmentId'
                ? 'Marked automatically; the score is recorded when the learner finishes.'
                : workType === 'activityId'
                  ? 'Only published activities are listed.'
                  : undefined
            }
          >
            <Select
              value={workId}
              placeholder={
                options.isPending ? 'Loading…' : (options.data?.length ?? 0) === 0 ? 'Nothing published here yet' : 'Choose one'
              }
              onChange={(event) => onWorkIdChange(event.target.value)}
              options={options.data ?? []}
            />
          </Field>
        )
      ) : null}
    </div>
  );
}

function CreateAssignmentModal({
  classes,
  template,
  onClose,
}: {
  classes: { id: string; name: string }[];
  /** Set to reuse an earlier assignment: everything is copied except the dates. */
  template?: Assignment | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const initialWorkType: WorkType = template?.assessmentId
    ? 'assessmentId'
    : template?.activityId
      ? 'activityId'
      : template?.lessonId
        ? 'lessonId'
        : template?.topicId
          ? 'topicId'
          : 'activityId';
  const [title, setTitle] = useState(template?.title ?? '');
  const [instructions, setInstructions] = useState(template?.instructions ?? '');
  const [kind, setKind] = useState<string>(template?.kind ?? 'HOMEWORK');
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [audience, setAudience] = useState<'CLASS' | 'STUDENT'>('CLASS');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState(template?.subjectId ?? '');
  const [workType, setWorkType] = useState<WorkType>(initialWorkType);
  const [workId, setWorkId] = useState(template ? (template[initialWorkType] ?? '') : '');
  const [availableFrom, setAvailableFrom] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [lateBehavior, setLateBehavior] = useState<string>(template?.lateBehavior ?? 'ALLOW_LATE_FLAGGED');
  const [graceHours, setGraceHours] = useState(String(template?.graceHours ?? 24));
  const [allowResubmission, setAllowResubmission] = useState(template?.allowResubmission ?? true);
  const [maxAttempts, setMaxAttempts] = useState(template?.maxAttempts ? String(template.maxAttempts) : '');
  const [pointsValue, setPointsValue] = useState(String(template?.pointsValue ?? 10));
  const [publishNow, setPublishNow] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const input: Record<string, unknown> = {
        title: title.trim(),
        kind,
        classId,
        subjectId,
        pointsValue: Number(pointsValue) || 0,
        lateBehavior,
        allowResubmission,
        targets:
          audience === 'CLASS'
            ? [{ targetType: 'CLASS', targetId: classId }]
            : studentIds.map((id) => ({ targetType: 'STUDENT', targetId: id })),
        [workType]: workId,
        publish: publishNow,
      };
      if (instructions.trim()) input.instructions = instructions.trim();
      if (availableFrom) input.availableFrom = new Date(availableFrom).toISOString();
      if (dueAt) input.dueAt = new Date(dueAt).toISOString();
      if (lateBehavior === 'ALLOW_UNTIL_GRACE_END') input.graceHours = Number(graceHours);
      if (allowResubmission && maxAttempts) input.maxAttempts = Number(maxAttempts);
      return createAssignment(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assignments.all });
      onClose();
    },
  });

  // Mirrors the server's own checks so the reason sits next to the button.
  const blockedReason =
    title.trim().length < 2
      ? 'Give it a title.'
      : !classId
        ? 'Choose a class.'
        : !workId
          ? 'Choose the work to set.'
          : audience === 'STUDENT' && studentIds.length === 0
            ? 'Choose at least one learner.'
            : availableFrom && dueAt && new Date(dueAt) <= new Date(availableFrom)
              ? 'The due time must be after it opens.'
              : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={template ? `Set “${template.title}” again` : 'New assignment'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} isLoading={create.isPending} disabled={blockedReason !== null}>
            {publishNow ? 'Set it' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error ? <ErrorState error={create.error} /> : null}

        <Field label="Title" isRequired>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Fractions practice" />
        </Field>
        <Field label="Instructions" hint="What the learner sees with the work.">
          <Textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kind" isRequired>
            <Select options={KIND_OPTIONS} value={kind} onChange={(event) => setKind(event.target.value)} />
          </Field>
          <Field label="Class" isRequired hint={classes.length === 0 ? 'You have no classes yet.' : undefined}>
            <Select
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentIds([]);
              }}
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

        <ContentPicker
          subjectId={subjectId}
          workType={workType}
          workId={workId}
          onSubjectChange={setSubjectId}
          onWorkTypeChange={setWorkType}
          onWorkIdChange={setWorkId}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Opens" hint="Empty opens it straight away. Learners do not see it before then.">
            <Input type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
          </Field>
          <Field label="Due">
            <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Late work">
            <Select options={LATE_OPTIONS} value={lateBehavior} onChange={(event) => setLateBehavior(event.target.value)} />
          </Field>
          {lateBehavior === 'ALLOW_UNTIL_GRACE_END' ? (
            <Field label="Grace period (hours)" hint="0 to 336.">
              <Input type="number" min={0} max={336} value={graceHours} onChange={(event) => setGraceHours(event.target.value)} />
            </Field>
          ) : (
            <Field label="Points">
              <Input type="number" min={0} value={pointsValue} onChange={(event) => setPointsValue(event.target.value)} />
            </Field>
          )}
        </div>
        {lateBehavior === 'ALLOW_UNTIL_GRACE_END' ? (
          <Field label="Points">
            <Input type="number" min={0} value={pointsValue} onChange={(event) => setPointsValue(event.target.value)} />
          </Field>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Checkbox
            label="Allow another go after handing in"
            checked={allowResubmission}
            onChange={(event) => setAllowResubmission(event.target.checked)}
          />
          {allowResubmission ? (
            <Field label="Most goes allowed" hint="Empty for no limit. Up to 20.">
              <Input type="number" min={1} max={20} value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
            </Field>
          ) : null}
        </div>

        <Checkbox
          label="Publish now"
          hint="Otherwise it is saved as a draft learners cannot see yet."
          checked={publishNow}
          onChange={(event) => setPublishNow(event.target.checked)}
        />
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
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
