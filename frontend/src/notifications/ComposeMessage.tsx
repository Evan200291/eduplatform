import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { LearnerPicker } from '@/academic/LearnerPicker';
import { fetchClasses, fetchGrades } from '@/academic/academic.api';
import { broadcastNotification, sendNotification } from './notifications.api';
import { qk } from '@/query/keys';

/**
 * Writing a message (blueprint 06).
 *
 * Two modes over one form. A direct message goes to chosen learners
 * (`notification.send`); an announcement goes to a whole audience
 * (`notification.broadcast`, kept apart because the blast radius is the
 * school). The server's one rule — anything high priority must link somewhere
 * the reader can act — is surfaced as a required link rather than an error.
 */

type Mode = 'direct' | 'broadcast';
type Audience = 'SCHOOL' | 'STAFF' | 'STUDENTS' | 'CLASS' | 'GRADE';

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'SCHOOL', label: 'Everyone in the school' },
  { value: 'STAFF', label: 'All staff' },
  { value: 'STUDENTS', label: 'All learners' },
  { value: 'CLASS', label: 'One class' },
  { value: 'GRADE', label: 'One year group' },
];

/** Places a learner can be sent to. */
const STUDENT_LINKS = [
  { value: '', label: 'No link' },
  { value: '/learn/progress', label: 'Their set work' },
  { value: '/learn/activities', label: 'Their learning path' },
  { value: '/learn/missions', label: 'Their missions' },
];

const STAFF_LINKS = [
  { value: '', label: 'No link' },
  { value: '/teach', label: 'Teacher dashboard' },
];

/**
 * A link has to lead somewhere the reader can open, so the choice follows the
 * audience. A whole-school notice reaches learners and staff alike, and no one
 * page suits both — so it carries no link, and cannot be marked urgent.
 */
function linksFor(mode: Mode, audience: Audience) {
  if (mode === 'direct') return STUDENT_LINKS;
  if (audience === 'STAFF') return STAFF_LINKS;
  if (audience === 'SCHOOL') return [{ value: '', label: 'No link' }];
  return STUDENT_LINKS;
}

export function ComposeMessageModal({
  mode,
  learnerSource,
  onClose,
  onSent,
}: {
  mode: Mode;
  /** Whose classes a direct message can reach. */
  learnerSource: 'mine' | 'all';
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience>('STUDENTS');
  const [classId, setClassId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('LEARNING_REMINDER');
  const [priority, setPriority] = useState('NORMAL');
  const [actionPath, setActionPath] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');

  const classes = useQuery({
    queryKey: qk.classes.list({ pageSize: 100 }),
    queryFn: () => fetchClasses({ pageSize: 100 }),
    enabled: mode === 'broadcast' && audience === 'CLASS',
  });
  const grades = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => fetchGrades(),
    enabled: mode === 'broadcast' && audience === 'GRADE',
  });

  const links = linksFor(mode, audience);
  const link = links.find((entry) => entry.value === actionPath);
  const shared = {
    title: title.trim(),
    body: body.trim(),
    category,
    priority,
    ...(actionPath ? { actionPath, actionLabel: link?.label ?? 'Open' } : {}),
    ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (mode === 'direct') {
        const result = await sendNotification({ ...shared, userIds: studentIds });
        return `Sent to ${result.created} learner${result.created === 1 ? '' : 's'}.`;
      }
      const result = await broadcastNotification({
        ...shared,
        audience,
        ...(audience === 'CLASS' ? { classId } : {}),
        ...(audience === 'GRADE' ? { gradeId } : {}),
      });
      return `Announcement sent to ${result.created} ${result.created === 1 ? 'person' : 'people'}.`;
    },
    onSuccess: onSent,
  });

  const urgent = priority === 'HIGH' || priority === 'CRITICAL';
  const blockedReason =
    mode === 'direct' && studentIds.length === 0
      ? 'Choose who it is for.'
      : mode === 'broadcast' && audience === 'CLASS' && !classId
        ? 'Choose the class.'
        : mode === 'broadcast' && audience === 'GRADE' && !gradeId
          ? 'Choose the year group.'
          : title.trim().length < 2
            ? 'Add a title.'
            : body.trim().length < 2
              ? 'Write the message.'
              : urgent && !actionPath
                ? 'An urgent message needs a link to where the reader should go.'
                : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title={mode === 'direct' ? 'Send a message' : 'Make an announcement'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            {scheduledFor ? 'Schedule' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}

        {mode === 'direct' ? (
          <LearnerPicker source={learnerSource} selected={studentIds} onChange={setStudentIds} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Who it is for">
              <Select
                value={audience}
                onChange={(event) => {
                  setAudience(event.target.value as Audience);
                  setActionPath('');
                }}
                options={AUDIENCE_OPTIONS}
              />
            </Field>
            {audience === 'CLASS' ? (
              <Field label="Class" isRequired>
                <Select
                  value={classId}
                  placeholder={classes.isPending ? 'Loading…' : 'Choose'}
                  onChange={(event) => setClassId(event.target.value)}
                  options={(classes.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
                />
              </Field>
            ) : null}
            {audience === 'GRADE' ? (
              <Field label="Year group" isRequired>
                <Select
                  value={gradeId}
                  placeholder={grades.isPending ? 'Loading…' : 'Choose'}
                  onChange={(event) => setGradeId(event.target.value)}
                  options={(grades.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
                />
              </Field>
            ) : null}
          </div>
        )}

        <Field label="Title" isRequired>
          <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Message" isRequired>
          <Textarea rows={4} maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Kind">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={[
                { value: 'LEARNING_REMINDER', label: 'Learning reminder' },
                { value: 'ADMINISTRATIVE', label: 'School notice' },
              ]}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'NORMAL', label: 'Normal' },
                { value: 'HIGH', label: 'High' },
              ]}
            />
          </Field>
          <Field label="Link" isRequired={urgent}>
            <Select value={actionPath} onChange={(event) => setActionPath(event.target.value)} options={links} />
          </Field>
        </div>

        <Field label="Send later" hint="Optional. Empty sends now.">
          <Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} />
        </Field>

        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}
