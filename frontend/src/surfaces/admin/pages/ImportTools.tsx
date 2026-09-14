import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { saveBlob, toApiError } from '@/api';
import { assignClassTeacher, createClass, fetchAllGrades, fetchAllSubjects } from '@/academic/academic.api';
import { createInvitation, fetchUsers } from '@/users/users.api';
import { readCsvRecords } from '@/lib/csv';
import {
  CLASS_ALIASES,
  STAFF_ALIASES,
  planClassRows,
  planStaffRows,
  type ClassRowPlan,
  type StaffRowPlan,
} from '@/users/import-rows';
import { qk } from '@/query/keys';

/**
 * CSV import for staff and classes (PRD v2.5: CSV import covers students,
 * teachers, classes and basic assignments; students already had it).
 *
 * The file is checked in the browser first and every row says whether it will
 * import and, if not, why — so an admin fixes the spreadsheet once instead of
 * finding out row by row. Rows with a problem are skipped, never guessed at.
 * The server has no bulk route for either, so rows are sent one at a time and
 * each one reports its own result.
 */

const STAFF_TEMPLATE = 'email,role\nsam.teacher@school.example,Teacher\nlee.head@school.example,School admin\n';
const CLASS_TEMPLATE =
  'name,grade,code,subjects,teacher\n7A Maths,Year 7,7A-MATHS,Mathematics,sam.teacher@school.example\n7B,Year 7,7B,Mathematics; English,\n';

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Teacher',
  SCHOOL_ADMIN: 'School admin',
  CURRICULUM_MANAGER: 'Curriculum manager',
  CONTENT_REVIEWER: 'Content reviewer',
  REPORT_VIEWER: 'Report viewer',
  BILLING_ADMIN: 'Billing admin',
};

interface RowOutcome {
  line: number;
  label: string;
  ok: boolean;
  detail: string;
}

function CsvSource({
  text,
  onText,
  template,
  templateName,
  columnsHint,
}: {
  text: string;
  onText: (value: string) => void;
  template: string;
  templateName: string;
  columnsHint: string;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Field label="CSV file" hint={columnsHint}>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-strong"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setFileName(file.name);
            void file.text().then(onText);
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        {fileName ? (
          <span>
            Loaded <span className="text-ink">{fileName}</span>. Check the rows below before importing.
          </span>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => saveBlob(new Blob([template], { type: 'text/csv' }), templateName)}
        >
          Download a template
        </Button>
      </div>
      <Field label="Or paste the rows here, header first">
        <Textarea rows={5} value={text} onChange={(event) => onText(event.target.value)} placeholder={template} />
      </Field>
    </div>
  );
}

function OutcomeTable({ outcomes, caption }: { outcomes: RowOutcome[]; caption: string }) {
  const done = outcomes.filter((row) => row.ok).length;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone={done === outcomes.length ? 'success' : 'warning'} title={`${done} of ${outcomes.length} imported`}>
        {done === outcomes.length ? 'Every row went through.' : 'The rows marked "Not imported" say why. Fix them and import just those again.'}
      </Alert>
      <DataTable
        caption={caption}
        rows={outcomes}
        getRowKey={(row) => String(row.line)}
        columns={[
          { key: 'line', header: 'Line', render: (row) => row.line },
          { key: 'label', header: 'Row', render: (row) => row.label },
          {
            key: 'status',
            header: 'Result',
            render: (row) => <Badge tone={row.ok ? 'success' : 'danger'}>{row.ok ? 'Imported' : 'Not imported'}</Badge>,
          },
          { key: 'detail', header: 'Detail', render: (row) => <span className="break-all text-sm">{row.detail}</span> },
        ]}
      />
    </div>
  );
}

// ── Staff ───────────────────────────────────────────────────────────────────

export function StaffImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [progress, setProgress] = useState(0);

  const parsed = useMemo(() => (text.trim() ? readCsvRecords(text, STAFF_ALIASES) : null), [text]);
  const plan = useMemo(() => (parsed ? planStaffRows(parsed.records) : []), [parsed]);
  const ready = plan.filter((row) => row.problem === null);
  const missingEmail = parsed?.missingColumns.includes('email') ?? false;

  const run = useMutation({
    mutationFn: async () => {
      const results: RowOutcome[] = [];
      setProgress(0);
      for (const row of ready) {
        try {
          const invitation = await createInvitation({ email: row.email, roleKey: row.roleKey });
          results.push({ line: row.line, label: row.email, ok: true, detail: invitation.invitationUrl });
        } catch (cause) {
          results.push({ line: row.line, label: row.email, ok: false, detail: toApiError(cause).message });
        }
        setProgress(results.length);
      }
      return results;
    },
    onSuccess: (results) => {
      setOutcomes(results);
      onDone();
    },
  });

  const downloadLinks = () => {
    const lines = ['email,invitation_link', ...(outcomes ?? []).filter((r) => r.ok).map((r) => `${r.label},${r.detail}`)];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), 'staff-invitation-links.csv');
  };

  const columns: Column<StaffRowPlan>[] = [
    { key: 'line', header: 'Line', render: (row) => row.line },
    { key: 'email', header: 'Email', render: (row) => row.email || '—' },
    { key: 'role', header: 'Role', render: (row) => (row.roleKey ? ROLE_LABEL[row.roleKey] ?? row.roleKey : '—') },
    {
      key: 'check',
      header: 'Check',
      render: (row) =>
        row.problem ? <span className="text-sm text-danger-strong">{row.problem}</span> : <Badge tone="success">Ready</Badge>,
    },
  ];

  return (
    <Modal isOpen onClose={onClose} title="Import staff from a CSV" size="lg">
      {outcomes ? (
        <div className="flex flex-col gap-3">
          <OutcomeTable outcomes={outcomes} caption="Staff import results" />
          <p className="text-sm text-ink-muted">
            There is no email delivery yet, so each person needs their link sent to them. The links work once and expire
            after 14 days.
          </p>
          <div className="flex justify-end gap-2">
            {outcomes.some((row) => row.ok) ? (
              <Button variant="outline" onClick={downloadLinks}>
                Download the links
              </Button>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink">
            Each row becomes an invitation. People choose their own password when they accept, so no passwords are
            created or shown here.
          </p>
          <CsvSource
            text={text}
            onText={setText}
            template={STAFF_TEMPLATE}
            templateName="staff-import-template.csv"
            columnsHint="Columns: email (required), role (optional, Teacher if left blank)."
          />
          {missingEmail ? (
            <Alert tone="warning" title="No email column found">
              The first line must be the column names, with one called &quot;email&quot;.
            </Alert>
          ) : plan.length > 0 ? (
            <DataTable caption="Rows found in the file" rows={plan} columns={columns} getRowKey={(row) => String(row.line)} />
          ) : null}
          {run.error ? <ErrorState error={run.error} /> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {plan.length > ready.length ? (
              <span className="text-sm text-ink-muted">{plan.length - ready.length} row(s) with a problem will be skipped.</span>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={run.isPending} disabled={ready.length === 0 || missingEmail} onClick={() => run.mutate()}>
              {run.isPending ? `Inviting ${progress + 1} of ${ready.length}` : `Invite ${ready.length} ${ready.length === 1 ? 'person' : 'people'}`}
            </Button>
          </div>
          {ready.length === 0 && plan.length > 0 && !missingEmail ? (
            <p className="text-right text-sm text-ink-muted">Nothing can be imported until at least one row is ready.</p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

// ── Classes ─────────────────────────────────────────────────────────────────

export function ClassImportModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [outcomes, setOutcomes] = useState<RowOutcome[] | null>(null);
  const [progress, setProgress] = useState(0);

  const grades = useQuery({ queryKey: qk.grades.list({ pageSize: 200 }), queryFn: () => fetchAllGrades() });
  const subjects = useQuery({
    queryKey: qk.subjects.list({ pageSize: 200 }),
    queryFn: () => fetchAllSubjects(),
  });
  const teachers = useQuery({
    queryKey: qk.users.list({ role: 'TEACHER', pageSize: 200 }),
    queryFn: () => fetchUsers({ role: 'TEACHER', pageSize: 200 }),
  });

  const parsed = useMemo(() => (text.trim() ? readCsvRecords(text, CLASS_ALIASES) : null), [text]);
  const plan = useMemo(
    () =>
      parsed && grades.data && subjects.data && teachers.data
        ? planClassRows(parsed.records, {
            grades: grades.data.items,
            subjects: subjects.data.items,
            teachers: teachers.data.items,
          })
        : [],
    [parsed, grades.data, subjects.data, teachers.data],
  );
  const ready = plan.filter((row) => row.problem === null);
  const missing = (parsed?.missingColumns ?? []).filter((key) => key === 'name' || key === 'grade');

  const run = useMutation({
    mutationFn: async () => {
      const results: RowOutcome[] = [];
      setProgress(0);
      for (const row of ready) {
        try {
          const created = await createClass({
            name: row.name,
            gradeId: row.gradeId,
            code: row.code ?? undefined,
            subjectIds: row.subjectIds,
          });
          let detail = `Created as ${created.code}`;
          if (row.teacherId) {
            try {
              await assignClassTeacher(created.id, { userId: row.teacherId, isLead: true });
              detail += `, lead teacher ${row.teacherLabel}`;
            } catch (cause) {
              detail += `, but the teacher was not assigned: ${toApiError(cause).message}`;
            }
          }
          results.push({ line: row.line, label: row.name, ok: true, detail });
        } catch (cause) {
          results.push({ line: row.line, label: row.name, ok: false, detail: toApiError(cause).message });
        }
        setProgress(results.length);
      }
      return results;
    },
    onSuccess: (results) => {
      setOutcomes(results);
      void queryClient.invalidateQueries({ queryKey: qk.classes.all });
    },
  });

  const columns: Column<ClassRowPlan>[] = [
    { key: 'line', header: 'Line', render: (row) => row.line },
    { key: 'name', header: 'Class', render: (row) => row.name || '—' },
    { key: 'grade', header: 'Grade', render: (row) => row.gradeLabel || '—' },
    {
      key: 'extras',
      header: 'Subjects and teacher',
      className: 'hidden md:table-cell',
      render: (row) =>
        [row.subjectLabels.join(', '), row.teacherLabel].filter(Boolean).join(' · ') || <span className="text-ink-muted">None</span>,
    },
    {
      key: 'check',
      header: 'Check',
      render: (row) =>
        row.problem ? <span className="text-sm text-danger-strong">{row.problem}</span> : <Badge tone="success">Ready</Badge>,
    },
  ];

  return (
    <Modal isOpen onClose={onClose} title="Import classes from a CSV" size="lg">
      {outcomes ? (
        <div className="flex flex-col gap-3">
          <OutcomeTable outcomes={outcomes} caption="Class import results" />
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <CsvSource
            text={text}
            onText={setText}
            template={CLASS_TEMPLATE}
            templateName="class-import-template.csv"
            columnsHint="Columns: name and grade (required); code, subjects (separate with ;) and teacher email (optional)."
          />
          <QueryBoundary
            isLoading={grades.isPending || subjects.isPending || teachers.isPending}
            error={grades.error ?? subjects.error ?? teachers.error}
            onRetry={() => {
              void grades.refetch();
              void subjects.refetch();
              void teachers.refetch();
            }}
          >
            {missing.length > 0 ? (
              <Alert tone="warning" title="Required columns missing">
                The first line must be the column names, including {missing.map((key) => `"${key}"`).join(' and ')}.
              </Alert>
            ) : plan.length > 0 ? (
              <DataTable caption="Rows found in the file" rows={plan} columns={columns} getRowKey={(row) => String(row.line)} />
            ) : null}
          </QueryBoundary>
          {run.error ? <ErrorState error={run.error} /> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {plan.length > ready.length ? (
              <span className="text-sm text-ink-muted">{plan.length - ready.length} row(s) with a problem will be skipped.</span>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button isLoading={run.isPending} disabled={ready.length === 0 || missing.length > 0} onClick={() => run.mutate()}>
              {run.isPending ? `Creating ${progress + 1} of ${ready.length}` : `Create ${ready.length} ${ready.length === 1 ? 'class' : 'classes'}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Adding one class. The old form sent only a name and code, but the server
 * requires a grade, so every attempt was refused; this asks for the grade.
 */
export function AddClassModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gradeId, setGradeId] = useState('');
  const grades = useQuery({ queryKey: qk.grades.list({ pageSize: 200 }), queryFn: () => fetchAllGrades() });

  const create = useMutation({
    mutationFn: () => createClass({ name: name.trim(), gradeId, code: code.trim() || undefined }),
    onSuccess: onCreated,
  });

  const gradeOptions = (grades.data?.items ?? []).map((grade) => ({ value: grade.id, label: grade.name }));

  return (
    <Modal isOpen onClose={onClose} title="Add a class">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        {create.error ? <ErrorState error={create.error} /> : null}
        <Field label="Name" isRequired>
          <Input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Grade" isRequired>
          <QueryBoundary isLoading={grades.isPending} error={grades.error} onRetry={() => void grades.refetch()}>
            {gradeOptions.length === 0 ? (
              <p className="text-sm text-ink-muted">Add a grade first: every class belongs to one.</p>
            ) : (
              <Select
                required
                value={gradeId}
                placeholder="Choose a grade"
                onChange={(event) => setGradeId(event.target.value)}
                options={gradeOptions}
              />
            )}
          </QueryBoundary>
        </Field>
        <Field label="Code" hint="Optional. Letters, numbers and hyphens. Made from the name if left blank.">
          <Input value={code} pattern="[A-Za-z0-9-]{2,40}" onChange={(event) => setCode(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending} disabled={!gradeId || name.trim().length < 2}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
