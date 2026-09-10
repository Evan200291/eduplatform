import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan, useProfile } from '@/auth';
import {
  createStudentNote,
  escalateStudentNote,
  fetchStudentNotes,
  updateStudentNote,
  withdrawStudentNote,
} from '@/progress/progress.api';
import type { NoteKind, NoteSensitivity, NoteVisibility, TeacherNote } from '@/progress/progress.types';
import { fetchUsers } from '@/users/users.api';
import { qk } from '@/query/keys';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * Teacher notes on one learner (blueprint 04).
 *
 * The rules the server enforces, surfaced so nobody meets them as an error:
 * notes are withdrawn with a reason, never deleted; a
 * safeguarding note is escalated to a named member of staff rather than
 * shared more widely; escalating raises a routine note to sensitive.
 */

const KIND_LABEL: Record<NoteKind, string> = {
  OBSERVATION: 'Observation',
  INTERVENTION: 'Intervention',
  ASSESSMENT_JUDGMENT: 'Assessment judgement',
  PARENT_COMMUNICATION: 'Parent communication',
  ADMINISTRATIVE: 'Administrative',
};

const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  PRIVATE_TEACHER: 'Only me',
  AUTHORIZED_STAFF: 'Authorised staff',
  SCHOOL_RECORD: 'School record',
  PARENT_VISIBLE: 'Visible to parent',
};

const SENSITIVITY_LABEL: Record<NoteSensitivity, string> = {
  ROUTINE: 'Routine',
  SENSITIVE: 'Sensitive',
  SAFEGUARDING: 'Safeguarding',
};

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

export function NotesCard({ studentId, canWrite, className }: { studentId: string; canWrite: boolean; className?: string }) {
  const queryClient = useQueryClient();
  const profile = useProfile();
  const canEscalate = useCan('note.escalate');
  // The safeguarding lead may withdraw or close a follow-up on anyone's note,
  // but only the author may change what a note says.
  const isLead = useCan('note.read.sensitive');
  const [editing, setEditing] = useState<TeacherNote | null>(null);
  const [withdrawing, setWithdrawing] = useState<TeacherNote | null>(null);
  const [escalating, setEscalating] = useState<TeacherNote | null>(null);

  const notesQuery = useQuery({
    queryKey: qk.progress.notes(studentId),
    queryFn: () => fetchStudentNotes(studentId),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.progress.notes(studentId) });

  const markDone = useMutation({
    mutationFn: (noteId: string) => updateStudentNote(noteId, { followUpDone: true }),
    onSuccess: refresh,
  });

  const today = new Date();

  return (
    <Card className={className}>
      <CardHeader title="Notes" description="Your record of what you have observed. Notes are withdrawn, never deleted." />
      <CardBody className="p-0">
        {markDone.error ? <ErrorState error={markDone.error} /> : null}
        <QueryBoundary
          isLoading={notesQuery.isPending}
          error={notesQuery.error}
          onRetry={() => void notesQuery.refetch()}
          isEmpty={(notesQuery.data?.items.length ?? 0) === 0}
          emptyState={<EmptyState title="No notes yet" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {(notesQuery.data?.items ?? []).map((note) => {
              const isMine = profile?.id === note.authorId;
              const canManage = canWrite && (isMine || isLead);
              const isWithdrawn = note.withdrawnAt !== null;
              const followUpOpen = note.followUpDueAt !== null && note.followUpDoneAt === null;
              const overdue = followUpOpen && new Date(note.followUpDueAt as string) < today;
              return (
                <li key={note.id} className={`flex flex-col gap-2 px-4 py-3 text-sm ${isWithdrawn ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone="neutral">{KIND_LABEL[note.kind]}</Badge>
                    {note.sensitivity !== 'ROUTINE' ? (
                      <Badge tone={note.sensitivity === 'SAFEGUARDING' ? 'danger' : 'warning'}>
                        {SENSITIVITY_LABEL[note.sensitivity]}
                      </Badge>
                    ) : null}
                    <Badge tone="neutral">{VISIBILITY_LABEL[note.visibility]}</Badge>
                    {note.escalatedAt ? <Badge tone="info">Escalated {formatDate(note.escalatedAt)}</Badge> : null}
                    {isWithdrawn ? <Badge tone="neutral">Withdrawn</Badge> : null}
                  </div>
                  {note.title ? <p className="font-medium text-ink">{note.title}</p> : null}
                  <p className={isWithdrawn ? 'text-ink-muted line-through' : 'text-ink'}>{note.body}</p>
                  {isWithdrawn && note.withdrawReason ? (
                    <p className="text-xs text-ink-muted">Withdrawn: {note.withdrawReason}</p>
                  ) : null}
                  {followUpOpen && !isWithdrawn ? (
                    <p className={`text-xs ${overdue ? 'font-medium text-danger-strong' : 'text-ink-muted'}`}>
                      Follow up {overdue ? 'was due' : 'by'} {formatDate(note.followUpDueAt)}
                    </p>
                  ) : null}
                  {note.followUpDoneAt ? (
                    <p className="text-xs text-ink-muted">Followed up {formatDate(note.followUpDoneAt)}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-ink-muted">
                      {note.author.displayName} · {formatDateTime(note.createdAt)}
                    </span>
                    {!isWithdrawn ? (
                      <div className="flex flex-wrap gap-1">
                        {canManage && followUpOpen ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={markDone.isPending && markDone.variables === note.id}
                            onClick={() => markDone.mutate(note.id)}
                          >
                            Mark followed up
                          </Button>
                        ) : null}
                        {canWrite && isMine ? (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(note)}>
                            Edit
                          </Button>
                        ) : null}
                        {canEscalate && !note.escalatedAt ? (
                          <Button size="sm" variant="ghost" onClick={() => setEscalating(note)}>
                            Escalate
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="ghost" onClick={() => setWithdrawing(note)}>
                            Withdraw
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryBoundary>
      </CardBody>
      {canWrite ? <NewNoteForm studentId={studentId} onDone={refresh} /> : null}

      {editing ? (
        <EditNoteModal
          note={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {withdrawing ? (
        <WithdrawNoteModal
          note={withdrawing}
          onClose={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null);
            refresh();
          }}
        />
      ) : null}
      {escalating ? (
        <EscalateNoteModal
          note={escalating}
          onClose={() => setEscalating(null)}
          onDone={() => {
            setEscalating(null);
            refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function NewNoteForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<NoteKind>('OBSERVATION');
  const [visibility, setVisibility] = useState<NoteVisibility>('PRIVATE_TEACHER');
  const [sensitivity, setSensitivity] = useState<NoteSensitivity>('ROUTINE');
  const [followUp, setFollowUp] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createStudentNote({
        studentId,
        body: body.trim(),
        kind,
        visibility,
        sensitivity,
        followUpDueAt: followUp ? new Date(followUp).toISOString() : undefined,
      }),
    onSuccess: () => {
      setBody('');
      setFollowUp('');
      setSensitivity('ROUTINE');
      onDone();
    },
  });

  // Mirrors the server's one hard rule: a safeguarding note is never
  // parent-visible (`assertSafeguardingNotShared` in notes.service.ts).
  const conflict = sensitivity === 'SAFEGUARDING' && visibility === 'PARENT_VISIBLE';

  return (
    <CardFooter className="flex-col items-stretch gap-3">
      {create.error ? <ErrorState error={create.error} /> : null}
      <Field label="Add a note" isLabelHidden>
        <Textarea placeholder="What did you observe?" value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kind">
          <Select value={kind} onChange={(event) => setKind(event.target.value as NoteKind)} options={options(KIND_LABEL)} />
        </Field>
        <Field label="Who can see it">
          <Select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as NoteVisibility)}
            options={options(VISIBILITY_LABEL)}
          />
        </Field>
        <Field label="Sensitivity">
          <Select
            value={sensitivity}
            onChange={(event) => setSensitivity(event.target.value as NoteSensitivity)}
            options={options(SENSITIVITY_LABEL)}
          />
        </Field>
        <Field label="Follow up by" hint="Optional.">
          <Input type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
        </Field>
      </div>
      {conflict ? (
        <p className="text-sm text-danger-strong">
          A safeguarding note cannot be visible to a parent. Choose who can see it, then escalate it.
        </p>
      ) : null}
      {sensitivity === 'SAFEGUARDING' ? (
        <p className="text-sm text-ink-muted">
          Save the note, then use Escalate to hand it to your safeguarding lead.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          onClick={() => create.mutate()}
          isLoading={create.isPending}
          disabled={body.trim().length < 2 || conflict}
        >
          Save note
        </Button>
      </div>
    </CardFooter>
  );
}

function EditNoteModal({ note, onClose, onDone }: { note: TeacherNote; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.body);
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [visibility, setVisibility] = useState<NoteVisibility>(note.visibility);
  const [sensitivity, setSensitivity] = useState<NoteSensitivity>(note.sensitivity);

  const mutation = useMutation({
    mutationFn: () =>
      updateStudentNote(note.id, {
        kind,
        visibility,
        sensitivity,
        body: body.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
      }),
    onSuccess: onDone,
  });
  const conflict = sensitivity === 'SAFEGUARDING' && visibility === 'PARENT_VISIBLE';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit note"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={body.trim().length < 2 || conflict} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">Every edit is kept in the audit history.</p>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Note" isRequired>
          <Textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Kind">
            <Select value={kind} onChange={(event) => setKind(event.target.value as NoteKind)} options={options(KIND_LABEL)} />
          </Field>
          <Field label="Who can see it">
            <Select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as NoteVisibility)}
              options={options(VISIBILITY_LABEL)}
            />
          </Field>
          <Field label="Sensitivity">
            <Select
              value={sensitivity}
              onChange={(event) => setSensitivity(event.target.value as NoteSensitivity)}
              options={options(SENSITIVITY_LABEL)}
            />
          </Field>
        </div>
        {conflict ? (
          <p className="text-sm text-danger-strong">A safeguarding note cannot be visible to a parent.</p>
        ) : null}
      </div>
    </Modal>
  );
}

function WithdrawNoteModal({ note, onClose, onDone }: { note: TeacherNote; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const mutation = useMutation({ mutationFn: () => withdrawStudentNote(note.id, reason.trim()), onSuccess: onDone });
  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Withdraw note"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={mutation.isPending}
            disabled={reason.trim().length < 4}
            onClick={() => mutation.mutate()}
          >
            Withdraw
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          The note stays on the record, marked withdrawn with your reason. It is not deleted.
        </p>
        <Field label="Why" isRequired hint="At least four characters.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EscalateNoteModal({ note, onClose, onDone }: { note: TeacherNote; onClose: () => void; onDone: () => void }) {
  const [recipientId, setRecipientId] = useState('');
  const [message, setMessage] = useState('');
  const [includeTeachers, setIncludeTeachers] = useState(false);

  const admins = useQuery({
    queryKey: qk.users.list({ role: 'SCHOOL_ADMIN', status: 'ACTIVE', pageSize: 100 }),
    queryFn: () => fetchUsers({ role: 'SCHOOL_ADMIN', status: 'ACTIVE', pageSize: 100 }),
  });
  const teachers = useQuery({
    queryKey: qk.users.list({ role: 'TEACHER', status: 'ACTIVE', pageSize: 100 }),
    queryFn: () => fetchUsers({ role: 'TEACHER', status: 'ACTIVE', pageSize: 100 }),
    enabled: includeTeachers,
  });
  const people = [...(admins.data?.items ?? []), ...(includeTeachers ? teachers.data?.items ?? [] : [])];

  const mutation = useMutation({
    mutationFn: () => escalateStudentNote(note.id, recipientId, message.trim() || undefined),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Escalate note"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!recipientId} onClick={() => mutation.mutate()}>
            Escalate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          The named person takes responsibility for the concern. A routine note becomes sensitive, and a note
          visible to parents becomes staff-only.
        </p>
        {admins.error ? <ErrorState error={admins.error} /> : null}
        <Field label="Hand it to" isRequired>
          <Select
            value={recipientId}
            placeholder={admins.isPending ? 'Loading…' : 'Choose a person'}
            onChange={(event) => setRecipientId(event.target.value)}
            options={people.map((person) => ({ value: person.id, label: person.displayName }))}
          />
        </Field>
        <Checkbox
          label="Include teachers in the list"
          hint="School administrators are listed by default."
          checked={includeTeachers}
          onChange={(event) => setIncludeTeachers(event.target.checked)}
        />
        <Field label="Message" hint="Optional.">
          <Textarea rows={2} value={message} onChange={(event) => setMessage(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
