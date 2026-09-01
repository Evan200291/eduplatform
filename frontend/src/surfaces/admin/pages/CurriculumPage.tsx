import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconAdd,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { fetchSubjects } from '@/academic/academic.api';
import {
  createProgram,
  createTopic,
  createUnit,
  fetchPrograms,
  fetchTopics,
  fetchUnits,
  setProgramStatus,
  setTopicStatus,
  setUnitStatus,
  updateTopic,
} from '@/curriculum/curriculum.api';
import {
  createActivity,
  createLesson,
  fetchActivities,
  fetchLessons,
  publishActivity,
  setActivityStatus,
  setLessonStatus,
} from '@/content/content.api';
import type { ContentStatus } from '@/content/content.types';
import { CONTENT_STATUS_MOVE_LABEL, CONTENT_STATUS_TONE, nextContentStatuses } from '@/content/content-lifecycle';

const STATUS_TONE = CONTENT_STATUS_TONE;

/** The curriculum tree — programs, units, topics — and the content built against it. */
export function CurriculumPage() {
  useDocumentTitle('Curriculum');
  const canWrite = useCan('curriculum.write');
  const canWriteLessons = useCan('lesson.write');
  const canWriteActivities = useCan('activity.write');
  const canWriteContent = canWriteLessons || canWriteActivities;

  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });
  const programs = useQuery({ queryKey: qk.curriculum.list({ scope: 'programs' }), queryFn: () => fetchPrograms() });
  const units = useQuery({ queryKey: qk.curriculum.list({ scope: 'units' }), queryFn: () => fetchUnits() });
  const topics = useQuery({ queryKey: qk.curriculum.list({ scope: 'topics' }), queryFn: () => fetchTopics() });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Curriculum" description="Your curriculum tree, and what is published." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ProgramsCard
          canWrite={canWrite}
          subjects={subjects.data?.items ?? []}
          query={programs}
        />
        <UnitsCard canWrite={canWrite} programs={programs.data?.items ?? []} query={units} />
        <TopicsCard canWrite={canWrite} units={units.data?.items ?? []} query={topics} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LessonsCard canWrite={canWriteContent} topics={topics.data?.items ?? []} />
        <ActivitiesCard canWrite={canWriteContent} topics={topics.data?.items ?? []} />
      </div>
    </div>
  );
}

function SectionCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} actions={actions} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

/**
 * Status badge plus buttons for every move the backend will actually accept
 * from the current status (see `content-lifecycle.ts`) — not a free-form
 * picker, since most of the five states don't reach most of the others
 * directly and the backend 400s on an invalid jump.
 */
function LifecycleControl({
  status,
  canWrite,
  isPending,
  error,
  onMove,
}: {
  status: ContentStatus;
  canWrite: boolean;
  isPending: boolean;
  error?: unknown;
  onMove: (status: ContentStatus) => void;
}) {
  if (!canWrite) return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
        {nextContentStatuses(status).map((next) => (
          <Button key={next} size="sm" variant="outline" isLoading={isPending} onClick={() => onMove(next)}>
            {CONTENT_STATUS_MOVE_LABEL[next]}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger-strong">{error instanceof Error ? error.message : 'That move failed.'}</p> : null}
    </div>
  );
}

/**
 * Inline editor for a topic's mastery threshold (Blueprint 12: the evidence
 * bar before MASTERED is claimed). Bounds mirror `updateTopicSchema` in
 * `curriculum.validation.ts` — an int between 50 and 100.
 */
function MasteryThresholdControl({
  topicId,
  value,
  canWrite,
  isPending,
  error,
  onSave,
}: {
  topicId: string;
  value: number;
  canWrite: boolean;
  isPending: boolean;
  error?: unknown;
  onSave: (value: number) => void;
}) {
  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Close the editor once a save lands (the row's `value` prop then reflects
  // the server's new threshold via the invalidated query); a failed save
  // leaves editing open so `error` stays visible next to the input.
  useEffect(() => {
    if (!isPending && !error) {
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  if (!canWrite) {
    return <span className="text-xs text-ink-muted">mastery {value}%</span>;
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        className="w-fit text-xs text-ink-muted underline decoration-dotted hover:text-ink"
        onClick={() => {
          setDraft(String(value));
          setValidationError(null);
          setEditing(true);
        }}
      >
        mastery {value}%
      </button>
    );
  }

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < MASTERY_THRESHOLD_MIN || parsed > MASTERY_THRESHOLD_MAX) {
      setValidationError(`Must be a whole number between ${MASTERY_THRESHOLD_MIN} and ${MASTERY_THRESHOLD_MAX}.`);
      return;
    }
    setValidationError(null);
    if (parsed === value) {
      setEditing(false);
      return;
    }
    onSave(parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={MASTERY_THRESHOLD_MIN}
          max={MASTERY_THRESHOLD_MAX}
          step={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-7 w-20 text-xs"
          aria-label="Mastery threshold"
        />
        <span className="text-xs text-ink-muted">%</span>
        <Button size="sm" variant="outline" isLoading={isPending} onClick={commit}>
          Save
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {validationError ? <p className="text-xs text-danger-strong">{validationError}</p> : null}
      {error ? (
        <p className="text-xs text-danger-strong">
          {error instanceof Error ? error.message : `Couldn't save mastery threshold for topic ${topicId}.`}
        </p>
      ) : null}
    </div>
  );
}

function ProgramsCard({
  canWrite,
  subjects,
  query,
}: {
  canWrite: boolean;
  subjects: Array<{ id: string; name: string }>;
  query: UseQueryResult<Awaited<ReturnType<typeof fetchPrograms>>>;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createProgram(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
      setOpen(false);
    },
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setProgramStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all }),
  });

  return (
    <SectionCard
      title="Programs"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No programs yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((program) => (
              <li key={program.id} className="flex items-center justify-between">
                <span className="text-ink">{program.name}</span>
                <LifecycleControl
                  status={program.status}
                  canWrite={canWrite}
                  isPending={move.isPending && move.variables?.id === program.id}
                  error={move.variables?.id === program.id ? move.error : undefined}
                  onMove={(status) => move.mutate({ id: program.id, status })}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a program">
          <ParentedCreateForm
            error={create.error}
            isPending={create.isPending}
            parentField={{ key: 'subjectId', label: 'Subject', options: subjects }}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </SectionCard>
  );
}

function UnitsCard({
  canWrite,
  programs,
  query,
}: {
  canWrite: boolean;
  programs: Array<{ id: string; name: string }>;
  query: UseQueryResult<Awaited<ReturnType<typeof fetchUnits>>>;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createUnit(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
      setOpen(false);
    },
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setUnitStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all }),
  });

  return (
    <SectionCard
      title="Units"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No units yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((unit) => (
              <li key={unit.id} className="flex items-center justify-between">
                <span className="text-ink">{unit.name}</span>
                <LifecycleControl
                  status={unit.status}
                  canWrite={canWrite}
                  isPending={move.isPending && move.variables?.id === unit.id}
                  error={move.variables?.id === unit.id ? move.error : undefined}
                  onMove={(status) => move.mutate({ id: unit.id, status })}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a unit">
          <ParentedCreateForm
            error={create.error}
            isPending={create.isPending}
            parentField={{ key: 'programId', label: 'Program', options: programs }}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </SectionCard>
  );
}

const MASTERY_THRESHOLD_MIN = 50;
const MASTERY_THRESHOLD_MAX = 100;

function TopicsCard({
  canWrite,
  units,
  query,
}: {
  canWrite: boolean;
  units: Array<{ id: string; name: string }>;
  query: UseQueryResult<Awaited<ReturnType<typeof fetchTopics>>>;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createTopic(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
      setOpen(false);
    },
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setTopicStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all }),
  });
  const updateMastery = useMutation({
    mutationFn: ({ id, masteryThreshold }: { id: string; masteryThreshold: number }) =>
      updateTopic(id, { masteryThreshold }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all }),
  });

  return (
    <SectionCard
      title="Topics"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No topics yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((topic) => (
              <li key={topic.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-ink">{topic.name}</span>
                  <LifecycleControl
                    status={topic.status}
                    canWrite={canWrite}
                    isPending={move.isPending && move.variables?.id === topic.id}
                    error={move.variables?.id === topic.id ? move.error : undefined}
                    onMove={(status) => move.mutate({ id: topic.id, status })}
                  />
                </div>
                <MasteryThresholdControl
                  topicId={topic.id}
                  value={topic.masteryThreshold}
                  canWrite={canWrite}
                  isPending={updateMastery.isPending && updateMastery.variables?.id === topic.id}
                  error={updateMastery.variables?.id === topic.id ? updateMastery.error : undefined}
                  onSave={(masteryThreshold) => updateMastery.mutate({ id: topic.id, masteryThreshold })}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a topic">
          <ParentedCreateForm
            error={create.error}
            isPending={create.isPending}
            parentField={{ key: 'unitId', label: 'Unit', options: units }}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </SectionCard>
  );
}

function LessonsCard({
  canWrite,
  topics,
}: {
  canWrite: boolean;
  topics: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({ queryKey: qk.lessons.list(), queryFn: () => fetchLessons({ pageSize: 20 }) });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createLesson(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.lessons.all });
      setOpen(false);
    },
  });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) => setLessonStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.lessons.all }),
  });

  return (
    <SectionCard
      title="Lessons"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No lessons yet" />
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {query.data?.items.map((lesson) => (
              <li key={lesson.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink">{lesson.title}</span>
                <LifecycleControl
                  status={lesson.status}
                  canWrite={canWrite}
                  isPending={move.isPending && move.variables?.id === lesson.id}
                  error={move.variables?.id === lesson.id ? move.error : undefined}
                  onMove={(status) => move.mutate({ id: lesson.id, status })}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a lesson">
          <ParentedCreateForm
            error={create.error}
            isPending={create.isPending}
            parentField={{ key: 'topicId', label: 'Topic', options: topics }}
            titleField="title"
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </SectionCard>
  );
}

function ActivitiesCard({
  canWrite,
  topics,
}: {
  canWrite: boolean;
  topics: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({ queryKey: qk.activities.list(), queryFn: () => fetchActivities({ pageSize: 20 }) });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createActivity(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.activities.all });
      setOpen(false);
    },
  });
  /**
   * `/status` explicitly refuses PUBLISHED (see `content.activities.routes.ts`:
   * "Every move except PUBLISHED; publishing goes through `/publish`") because
   * publishing also checks the activity actually has questions. Route that one
   * move through the dedicated endpoint; every other move uses the generic one.
   */
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      status === 'PUBLISHED' ? publishActivity(id) : setActivityStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.activities.all }),
  });

  return (
    <SectionCard
      title="Activities"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No activities yet" />
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {query.data?.items.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink">{activity.title}</span>
                <LifecycleControl
                  status={activity.status}
                  canWrite={canWrite}
                  isPending={move.isPending && move.variables?.id === activity.id}
                  error={move.variables?.id === activity.id ? move.error : undefined}
                  onMove={(status) => move.mutate({ id: activity.id, status })}
                />
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add an activity">
          <ParentedCreateForm
            error={create.error}
            isPending={create.isPending}
            parentField={{ key: 'topicId', label: 'Topic', options: topics }}
            titleField="title"
            extraField={{ key: 'type', label: 'Type', options: [
              { id: 'EXPLANATION', name: 'Explanation' },
              { id: 'WORKED_EXAMPLE', name: 'Worked example' },
              { id: 'MULTIPLE_CHOICE', name: 'Multiple choice' },
              { id: 'NUMERIC_RESPONSE', name: 'Numeric response' },
              { id: 'TRUE_FALSE', name: 'True / false' },
              { id: 'MATCHING', name: 'Matching' },
              { id: 'SORTING', name: 'Sorting' },
              { id: 'PRACTICE_SEQUENCE', name: 'Practice sequence' },
              { id: 'MINI_GAME', name: 'Mini-game' },
              { id: 'QUIZ', name: 'Quiz' },
              { id: 'TEACHER_TASK', name: 'Teacher task' },
            ] }}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </SectionCard>
  );
}

interface ParentField {
  key: string;
  label: string;
  options: Array<{ id: string; name: string }>;
}

function ParentedCreateForm({
  parentField,
  extraField,
  titleField = 'name',
  error,
  isPending,
  onCancel,
  onSubmit,
}: {
  parentField: ParentField;
  extraField?: ParentField;
  titleField?: 'name' | 'title';
  error: unknown;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [parentId, setParentId] = useState('');
  const [extraValue, setExtraValue] = useState('');
  const [title, setTitle] = useState('');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          [parentField.key]: parentId,
          [titleField]: title,
          ...(extraField ? { [extraField.key]: extraValue } : {}),
        });
      }}
    >
      {error ? <ErrorState error={error} /> : null}
      <Field label={parentField.label} isRequired>
        <Select
          required
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          placeholder={`Choose a ${parentField.label.toLowerCase()}`}
          options={parentField.options.map((option) => ({ value: option.id, label: option.name }))}
        />
      </Field>
      <Field label={titleField === 'title' ? 'Title' : 'Name'} isRequired>
        <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      {extraField ? (
        <Field label={extraField.label} isRequired>
          <Select
            required
            value={extraValue}
            onChange={(event) => setExtraValue(event.target.value)}
            placeholder={`Choose a ${extraField.label.toLowerCase()}`}
            options={extraField.options.map((option) => ({ value: option.id, label: option.name }))}
          />
        </Field>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
