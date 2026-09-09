import { useState, type ReactNode } from 'react';
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
  IconGrade,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import {
  addStudentsToClass,
  archiveGrade,
  archiveSubject,
  assignClassTeacher,
  createClass,
  createGrade,
  createSubject,
  createTerm,
  fetchClasses,
  fetchClassRoster,
  fetchClassTeachers,
  fetchGrades,
  fetchSubjects,
  fetchTerms,
  removeClassTeacher,
  removeStudentsFromClass,
  setClassSubjects,
  updateGrade,
  updateSubject,
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
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((grade) => (
              <EditableRow
                key={grade.id}
                label={grade.name}
                meta={`Level ${grade.level}`}
                canWrite={canWrite}
                fields={[
                  { key: 'name', label: 'Name', value: grade.name },
                  { key: 'level', label: 'Level (order)', value: String(grade.level), type: 'number' },
                ]}
                onSave={(values) =>
                  updateGrade(grade.id, { name: values.name, level: Number(values.level) })
                }
                onArchive={(reason) => archiveGrade(grade.id, reason)}
                invalidateKey={qk.grades.all}
              />
            ))}
          </ul>
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
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((subject) => (
              <EditableRow
                key={subject.id}
                label={subject.name}
                meta={subject.key}
                canWrite={canWrite}
                fields={[{ key: 'name', label: 'Name', value: subject.name }]}
                onSave={(values) => updateSubject(subject.id, { name: values.name })}
                onArchive={(reason) => archiveSubject(subject.id, reason)}
                invalidateKey={qk.subjects.all}
              />
            ))}
          </ul>
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
  const [staffFor, setStaffFor] = useState<SchoolClass | null>(null);
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
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setRosterFor(klass)}>
                        Students
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStaffFor(klass)}>
                        Staff
                      </Button>
                    </>
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
      {staffFor ? (
        <ClassStaffModal klass={staffFor} onClose={() => setStaffFor(null)} />
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

/**
 * One row that can be renamed or retired in place.
 *
 * Grades and subjects were create-only: the PATCH and archive routes existed
 * from the start and nothing called them, so a typo in a grade name was
 * permanent. Archiving asks for a reason because the server requires one — a
 * grade with learning history behind it is never deleted, only retired, and the
 * reason is what makes that record readable a year later.
 */
function EditableRow({
  label,
  meta,
  canWrite,
  fields,
  onSave,
  onArchive,
  invalidateKey,
}: {
  label: string;
  meta?: string;
  canWrite: boolean;
  fields: { key: string; label: string; value: string; type?: string }[];
  onSave: (values: Record<string, string>) => Promise<unknown>;
  onArchive: (reason: string) => Promise<unknown>;
  invalidateKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit' | 'archive'>('view');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  );
  const [reason, setReason] = useState('');

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: invalidateKey });
    setMode('view');
  };

  const save = useMutation({ mutationFn: () => onSave(values), onSuccess: done });
  const archive = useMutation({ mutationFn: () => onArchive(reason.trim()), onSuccess: done });

  if (mode === 'edit') {
    return (
      <li className="rounded-md border border-border p-3">
        {save.error ? <ErrorState error={save.error} /> : null}
        <div className="flex flex-col gap-3">
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              <Input
                type={field.type ?? 'text'}
                value={values[field.key] ?? ''}
                onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
              />
            </Field>
          ))}
          <div className="flex gap-2">
            <Button isLoading={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  if (mode === 'archive') {
    return (
      <li className="rounded-md border border-border p-3">
        {archive.error ? <ErrorState error={archive.error} /> : null}
        <div className="flex flex-col gap-3">
          <Field
            label={`Why is "${label}" being retired?`}
            hint="Kept on the record. At least three characters."
          >
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              isLoading={archive.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => archive.mutate()}
            >
              Retire
            </Button>
            <Button variant="outline" disabled={archive.isPending} onClick={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-ink">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {meta ? <span className="text-ink-muted">{meta}</span> : null}
        {canWrite ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode('archive')}>
              Retire
            </Button>
          </>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Who teaches a class, and which subjects it covers.
 *
 * Both route groups were unreachable, which had a consequence beyond the admin
 * panel: the teacher portal scopes everything through `ClassTeacher` rows, so a
 * class nobody was assigned to was invisible to the people meant to teach it.
 *
 * The subject list is replaced wholesale rather than edited item by item,
 * because that is what the endpoint accepts — sending a delta would mean
 * guessing at a merge the server does not perform.
 */
function ClassStaffModal({ klass, onClose }: { klass: SchoolClass; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [isLead, setIsLead] = useState(false);

  const teachers = useQuery({
    queryKey: [...qk.classes.detail(klass.id), 'teachers'],
    queryFn: () => fetchClassTeachers(klass.id),
  });
  const staffList = useQuery({
    queryKey: qk.users.list({ role: 'TEACHER', pageSize: 100 }),
    queryFn: () => fetchUsers({ role: 'TEACHER', pageSize: 100 }),
  });
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.classes.all });
    void teachers.refetch();
  };

  const assign = useMutation({
    mutationFn: () =>
      assignClassTeacher(klass.id, {
        userId: teacherId,
        subjectId: subjectId || undefined,
        isLead,
      }),
    onSuccess: () => {
      setTeacherId('');
      setSubjectId('');
      setIsLead(false);
      invalidate();
    },
  });

  const unassign = useMutation({
    mutationFn: (id: string) => removeClassTeacher(klass.id, id),
    onSuccess: invalidate,
  });

  const assigned = teachers.data ?? [];
  const assignedIds = new Set(assigned.map((entry) => entry.user.id));
  const available = (staffList.data?.items ?? []).filter((user) => !assignedIds.has(user.id));

  return (
    <Modal isOpen onClose={onClose} title={`Staff for ${klass.name}`} size="lg">
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Assigned teachers</p>
          <QueryBoundary
            isLoading={teachers.isPending}
            error={teachers.error}
            onRetry={() => void teachers.refetch()}
          >
            {assigned.length === 0 ? (
              <EmptyState
                title="Nobody teaches this class yet"
                description="Until a teacher is assigned, this class does not appear in the teacher portal."
              />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {assigned.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-ink">{entry.user.displayName}</span>
                      <span className="block text-xs text-ink-muted">
                        {entry.isLead ? 'Lead teacher' : 'Teacher'}
                        {entry.subject ? ` · ${entry.subject.name}` : ' · all subjects'}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={unassign.isPending}
                      onClick={() => unassign.mutate(entry.id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
          {unassign.error ? <ErrorState error={unassign.error} /> : null}
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-ink">Assign a teacher</p>
          {assign.error ? <ErrorState error={assign.error} /> : null}
          <div className="flex flex-col gap-3">
            <Field label="Teacher">
              <Select
                value={teacherId}
                placeholder={
                  available.length === 0 ? 'Every teacher is already assigned' : 'Choose a teacher'
                }
                onChange={(event) => setTeacherId(event.target.value)}
                options={available.map((user) => ({ value: user.id, label: user.displayName }))}
              />
            </Field>
            <Field label="Subject" hint="Leave blank if they teach the class for everything.">
              <Select
                value={subjectId}
                placeholder="All subjects"
                onChange={(event) => setSubjectId(event.target.value)}
                options={(subjects.data?.items ?? []).map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
              />
            </Field>
            <Checkbox
              label="Lead teacher for this class"
              checked={isLead}
              onChange={(event) => setIsLead(event.target.checked)}
            />
            <div>
              <Button isLoading={assign.isPending} disabled={!teacherId} onClick={() => assign.mutate()}>
                Assign
              </Button>
            </div>
          </div>
        </div>

        <ClassSubjectsPanel klass={klass} />
      </div>
    </Modal>
  );
}

/** Which subjects a class covers. Replaced as a whole list, as the endpoint expects. */
function ClassSubjectsPanel({ klass }: { klass: SchoolClass }) {
  const subjects = useQuery({ queryKey: qk.subjects.list(), queryFn: () => fetchSubjects() });
  const [selected, setSelected] = useState<string[] | null>(null);

  const save = useMutation({ mutationFn: () => setClassSubjects(klass.id, selected ?? []) });

  const all = subjects.data?.items ?? [];
  const current = selected ?? [];

  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium text-ink">Subjects taught</p>
      <p className="mb-2 text-xs text-ink-muted">
        Tick every subject this class covers, then save. The list replaces whatever was there before.
      </p>
      {save.error ? <ErrorState error={save.error} /> : null}
      <QueryBoundary
        isLoading={subjects.isPending}
        error={subjects.error}
        onRetry={() => void subjects.refetch()}
      >
        {all.length === 0 ? (
          <EmptyState title="No subjects defined" description="Add a subject first." />
        ) : (
          <div className="flex flex-col gap-2">
            {all.map((subject) => (
              <Checkbox
                key={subject.id}
                label={subject.name}
                checked={current.includes(subject.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...current, subject.id]
                      : current.filter((id) => id !== subject.id),
                  )
                }
              />
            ))}
            <div>
              <Button
                size="sm"
                isLoading={save.isPending}
                disabled={selected === null}
                onClick={() => save.mutate()}
              >
                Save subjects
              </Button>
              {save.isSuccess ? (
                <span className="ml-2 text-sm text-success-strong">Saved</span>
              ) : null}
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
