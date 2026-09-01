import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconAdd,
  IconGrade,
  Input,
  Modal,
  PageHeader,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import {
  addStudentsToClass,
  createClass,
  createGrade,
  createSubject,
  createTerm,
  fetchClasses,
  fetchClassRoster,
  fetchGrades,
  fetchSubjects,
  fetchTerms,
  removeStudentsFromClass,
} from '@/academic/academic.api';
import type { SchoolClass } from '@/academic/academic.types';
import { fetchUsers } from '@/users/users.api';
import { formatDate } from '@/lib/format';

/** Grades, terms, subjects and classes — the structure everything else hangs off. */
export function AcademicPage() {
  useDocumentTitle('Grades & classes');
  const canWriteGrades = useCan('grade.write');
  const canWriteClasses = useCan('class.write');
  const canWrite = canWriteGrades || canWriteClasses;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Grades & classes" description="How your school is organised." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GradesSection canWrite={canWrite} />
        <TermsSection canWrite={canWrite} />
        <SubjectsSection canWrite={canWrite} />
        <ClassesSection canWrite={canWrite} />
      </div>
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} actions={actions} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function GradesSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({ queryKey: qk.grades.list(), queryFn: () => fetchGrades() });
  const create = useMutation({
    mutationFn: (input: { name: string; level: number }) => createGrade(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.grades.all });
      setOpen(false);
    },
  });

  return (
    <Section
      title="Grades"
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
          <EmptyState icon={<IconGrade className="h-6 w-6" aria-hidden />} title="No grades yet" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {query.data?.items.map((grade) => (
              <Badge key={grade.id}>{grade.name}</Badge>
            ))}
          </div>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a grade">
          <SimpleCreateForm
            error={create.error}
            isPending={create.isPending}
            fields={[
              { key: 'name', label: 'Name', required: true },
              { key: 'level', label: 'Level (order)', type: 'number', required: true },
            ]}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate({ name: values.name, level: Number(values.level) })}
          />
        </Modal>
      ) : null}
    </Section>
  );
}

function TermsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({ queryKey: qk.terms.all, queryFn: () => fetchTerms() });
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createTerm(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.terms.all });
      setOpen(false);
    },
  });

  return (
    <Section
      title="Terms"
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
          <EmptyState title="No terms yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((term) => (
              <li key={term.id} className="flex items-center justify-between">
                <span className="text-ink">
                  {term.name} {term.isCurrent ? <Badge tone="success">Current</Badge> : null}
                </span>
                <span className="text-ink-muted">
                  {formatDate(term.startsOn)} – {formatDate(term.endsOn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a term">
          <SimpleCreateForm
            error={create.error}
            isPending={create.isPending}
            fields={[
              { key: 'name', label: 'Name', required: true },
              { key: 'startsOn', label: 'Starts on', type: 'date', required: true },
              { key: 'endsOn', label: 'Ends on', type: 'date', required: true },
            ]}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </Section>
  );
}

function SubjectsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const query = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createSubject(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.subjects.all });
      setOpen(false);
    },
  });

  return (
    <Section
      title="Subjects"
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
          <EmptyState title="No subjects yet" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {query.data?.items.map((subject) => (
              <Badge key={subject.id}>{subject.name}</Badge>
            ))}
          </div>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a subject">
          <SimpleCreateForm
            error={create.error}
            isPending={create.isPending}
            fields={[
              { key: 'name', label: 'Name', required: true },
              { key: 'key', label: 'Key', required: true },
            ]}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
    </Section>
  );
}

function ClassesSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [rosterFor, setRosterFor] = useState<SchoolClass | null>(null);
  const query = useQuery({ queryKey: qk.classes.list(), queryFn: () => fetchClasses() });
  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => createClass(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.classes.all });
      setOpen(false);
    },
  });

  return (
    <Section
      title="Classes"
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
          <EmptyState title="No classes yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((klass) => (
              <li key={klass.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink">{klass.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-ink-muted">
                    {klass.code} · {klass.studentCount ?? 0} students
                  </span>
                  {canWrite ? (
                    <Button size="sm" variant="ghost" onClick={() => setRosterFor(klass)}>
                      Students
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a class">
          <SimpleCreateForm
            error={create.error}
            isPending={create.isPending}
            fields={[
              { key: 'name', label: 'Name', required: true },
              { key: 'code', label: 'Code', required: true },
            ]}
            onCancel={() => setOpen(false)}
            onSubmit={(values) => create.mutate(values)}
          />
        </Modal>
      ) : null}
      {rosterFor ? (
        <ClassRosterModal klass={rosterFor} onClose={() => setRosterFor(null)} />
      ) : null}
    </Section>
  );
}

/**
 * Who is in a class, and the controls to change it.
 *
 * The backend has had roster add/remove from the start; nothing in the app ever
 * called them, which is why a school could create classes and enrol nobody in
 * them. This lives on the admin panel rather than the teacher portal because
 * `class.roster.write` is a school-admin permission — a teacher sees their
 * roster but does not decide who is on it.
 */
function ClassRosterModal({ klass, onClose }: { klass: SchoolClass; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const roster = useQuery({
    queryKey: qk.classes.roster(klass.id),
    queryFn: () => fetchClassRoster(klass.id),
  });

  // Only students can be enrolled, and only ones not already on the roster —
  // the backend would reject the rest, but offering them at all reads as a bug.
  const candidates = useQuery({
    queryKey: qk.users.list({ role: 'STUDENT', search: search || undefined, pageSize: 10 }),
    queryFn: () => fetchUsers({ role: 'STUDENT', search: search || undefined, pageSize: 10 }),
    enabled: search.trim().length > 1,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.classes.all });
  };

  const add = useMutation({
    mutationFn: (userId: string) => addStudentsToClass(klass.id, [userId]),
    onSuccess: () => {
      refresh();
      setSearch('');
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) => removeStudentsFromClass(klass.id, [userId]),
    onSuccess: refresh,
  });

  const enrolled = roster.data ?? [];
  const enrolledIds = new Set(enrolled.map((entry) => entry.user.id));
  const suggestions = (candidates.data?.items ?? []).filter((user) => !enrolledIds.has(user.id));

  return (
    <Modal isOpen onClose={onClose} title={`Students in ${klass.name}`} size="lg">
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Add a student</h3>
          {add.error ? <ErrorState error={add.error} className="mb-2" /> : null}
          <Input
            aria-label="Search students"
            placeholder="Search by name, username or code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim().length > 1 ? (
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {candidates.isPending ? (
                <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>
              ) : suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-ink-muted">
                  No students match, or they are already in this class.
                </li>
              ) : (
                suggestions.map((user) => (
                  <li key={user.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-sm text-ink">{user.displayName}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={add.isPending && add.variables === user.id}
                      onClick={() => add.mutate(user.id)}
                    >
                      Add
                    </Button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">Enrolled ({enrolled.length})</h3>
          {remove.error ? <ErrorState error={remove.error} className="mb-2" /> : null}
          <QueryBoundary
            isLoading={roster.isPending}
            error={roster.error}
            onRetry={() => void roster.refetch()}
          >
            {enrolled.length === 0 ? (
              <EmptyState title="Nobody enrolled yet" description="Search above to add students." />
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {enrolled.map((entry) => (
                  <li
                    key={entry.user.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {entry.user.displayName}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={remove.isPending && remove.variables === entry.user.id}
                      onClick={() => remove.mutate(entry.user.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </section>
      </div>
    </Modal>
  );
}

interface FormField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
}

function SimpleCreateForm({
  fields,
  error,
  isPending,
  onCancel,
  onSubmit,
}: {
  fields: FormField[];
  error: unknown;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {error ? <ErrorState error={error} /> : null}
      {fields.map((field) => (
        <Field key={field.key} label={field.label} isRequired={field.required}>
          <Input
            type={field.type ?? 'text'}
            required={field.required}
            value={values[field.key] ?? ''}
            onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
          />
        </Field>
      ))}
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
