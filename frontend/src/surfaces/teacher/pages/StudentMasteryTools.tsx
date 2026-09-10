import { useState } from 'react';
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
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import type { MasteryLevel, MasteryRecord } from '@/assessment/assessment.types';
import {
  createTeacherAssessment,
  fetchTeacherAssessments,
  overrideMastery,
  updateTeacherAssessment,
} from '@/progress/progress.api';
import type { TeacherJudgment } from '@/progress/progress.types';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';
import { humanize } from '../lib/humanize';

/**
 * Blueprint 04: "a teacher judgment outranks system inference, and says why."
 *
 * Two tools. Changing a mastery row replaces the system's reading of one topic,
 * with a note, and can later be handed back to the evidence. Recording a
 * judgment logs what the teacher saw — in class, in a workbook — and may or may
 * not move the mastery record, at the teacher's choice.
 */

const LEVELS: MasteryLevel[] = ['NOT_ASSESSED', 'EMERGING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'];
const LEVEL_OPTIONS = LEVELS.map((value) => ({ value, label: humanize(value) }));

export function ChangeMasteryButton({ record, studentId }: { record: MasteryRecord; studentId: string }) {
  const canOverride = useCan('mastery.override');
  const [isOpen, setOpen] = useState(false);
  if (!canOverride) return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Change
      </Button>
      {isOpen ? <OverrideModal record={record} studentId={studentId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function OverrideModal({
  record,
  studentId,
  onClose,
}: {
  record: MasteryRecord;
  studentId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [level, setLevel] = useState<MasteryLevel>(record.level);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: (clearOverride: boolean) => overrideMastery(record.id, { level, note: note.trim(), clearOverride }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assessment.mastery(studentId) });
      onClose();
    },
  });
  const noteOk = note.trim().length >= 4;

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title={`Mastery of ${record.topic.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          {record.teacherOverride ? (
            <Button
              variant="outline"
              isLoading={mutation.isPending && mutation.variables === true}
              disabled={!noteOk}
              onClick={() => mutation.mutate(true)}
            >
              Hand back to the evidence
            </Button>
          ) : null}
          <Button
            isLoading={mutation.isPending && mutation.variables === false}
            disabled={!noteOk}
            onClick={() => mutation.mutate(false)}
          >
            Save judgement
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          The evidence currently reads <strong className="text-ink">{humanize(record.level)}</strong> at{' '}
          {record.scorePercent}% from {record.evidenceCount} piece{record.evidenceCount === 1 ? '' : 's'} of evidence.
          {record.teacherOverride ? ' This is already a teacher judgement.' : ''}
        </p>
        {record.overrideNote ? (
          <p className="rounded-lg bg-surface-sunken p-3 text-sm text-ink">&ldquo;{record.overrideNote}&rdquo;</p>
        ) : null}
        <Field label="Your judgement">
          <Select value={level} onChange={(event) => setLevel(event.target.value as MasteryLevel)} options={LEVEL_OPTIONS} />
        </Field>
        <Field label="Why" isRequired hint="At least four characters. Other staff see this beside the level.">
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Judgments this learner has on record, and a way to add one. Topics come from
 * the learner's own mastery rows — the topics there is something to judge.
 */
export function TeacherJudgmentsCard({
  studentId,
  topics,
  className,
}: {
  studentId: string;
  topics: MasteryRecord[];
  className?: string;
}) {
  const canWrite = useCan('teacherassessment.write');
  const [editing, setEditing] = useState<TeacherJudgment | 'new' | null>(null);
  const params = { studentId, pageSize: 20 };
  const query = useQuery({
    queryKey: qk.progress.judgments(params),
    queryFn: () => fetchTeacherAssessments(params),
  });
  const rows = query.data?.items ?? [];

  return (
    <Card className={className}>
      <CardHeader
        title="Teacher judgements"
        description="What you have seen outside the platform — kept apart from system evidence."
        actions={
          canWrite ? (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              Record a judgement
            </Button>
          ) : undefined
        }
      />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No judgements recorded" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink">{row.topic?.name ?? row.subject?.name ?? 'General'}</span>
                  <div className="flex items-center gap-2">
                    <Badge tone="info">{humanize(row.level)}</Badge>
                    {row.countsAsEvidence ? null : <Badge tone="neutral">Note only</Badge>}
                    {canWrite ? (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
                {row.comment ? <p className="text-ink-muted">{row.comment}</p> : null}
                <p className="text-xs text-ink-muted">
                  {row.teacher.displayName} · {formatDate(row.assessedAt)}
                </p>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {editing ? (
        <JudgmentModal
          studentId={studentId}
          topics={topics}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void query.refetch();
          }}
        />
      ) : null}
    </Card>
  );
}

function JudgmentModal({
  studentId,
  topics,
  existing,
  onClose,
  onDone,
}: {
  studentId: string;
  topics: MasteryRecord[];
  existing: TeacherJudgment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [topicId, setTopicId] = useState(existing?.topicId ?? '');
  const [level, setLevel] = useState<MasteryLevel>((existing?.level as MasteryLevel | undefined) ?? 'DEVELOPING');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [countsAsEvidence, setCounts] = useState(existing?.countsAsEvidence ?? true);

  const mutation = useMutation({
    mutationFn: () =>
      existing
        ? updateTeacherAssessment(existing.id, { level, comment: comment.trim() || undefined, countsAsEvidence })
        : createTeacherAssessment({
            studentId,
            topicId,
            level,
            comment: comment.trim() || undefined,
            countsAsEvidence,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assessment.mastery(studentId) });
      onDone();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existing ? 'Edit judgement' : 'Record a judgement'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!existing && !topicId} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        {existing ? (
          <p className="text-sm text-ink-muted">{existing.topic?.name ?? existing.subject?.name ?? 'General'}</p>
        ) : topics.length === 0 ? (
          <p className="text-sm text-ink-muted">
            This learner has no topics on record yet. Judgements attach to a topic they have started.
          </p>
        ) : (
          <Field label="Topic" isRequired>
            <Select
              value={topicId}
              placeholder="Choose a topic"
              onChange={(event) => setTopicId(event.target.value)}
              options={topics.map((record) => ({ value: record.topicId, label: record.topic.name }))}
            />
          </Field>
        )}
        <Field label="Level">
          <Select value={level} onChange={(event) => setLevel(event.target.value as MasteryLevel)} options={LEVEL_OPTIONS} />
        </Field>
        <Field label="What you saw" hint="Optional, but it is what makes the judgement useful to the next teacher.">
          <Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>
        <Checkbox
          label="Count this as evidence"
          hint="Off to log an impression without moving the learner's mastery record."
          checked={countsAsEvidence}
          onChange={(event) => setCounts(event.target.checked)}
        />
      </div>
    </Modal>
  );
}
