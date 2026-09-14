import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Field, Modal, Textarea } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { formatAboutMinutes, formatRelative } from '@/lib/format';
import { startAssignment, submitAssignment } from '@/assignments/assignments.api';
import type { AssignmentAttempt, AssignmentState } from '@/assignments/assignments.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';

/**
 * Work a teacher has set, with the one button a learner needs next to it.
 *
 * Starting tells the teacher's monitoring board the learner has begun. Work
 * backed by an assessment or an activity opens in the player, which hands it
 * in when the learner finishes; work with nothing to play — a written task, a
 * reading — is handed in here with an optional note, and waits for the
 * teacher to look at it.
 */

const STATE_LABEL: Record<AssignmentState, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'Started',
  SUBMITTED: 'Handed in',
  COMPLETED: 'Done',
  OVERDUE: 'Overdue',
  EXCUSED: 'Excused',
};

/** Where the work is played, if anywhere. */
function playerHref(attempt: AssignmentAttempt): string | null {
  const work = attempt.assignment;
  const assignment = `assignmentId=${encodeURIComponent(work.id)}`;
  if (work.assessmentId) return `${paths.learn.activity(work.assessmentId)}?kind=assessment&${assignment}`;
  if (work.activityId) return `${paths.learn.activity(work.activityId)}?kind=activity&${assignment}`;
  return null;
}

export function SetWorkList({ attempts }: { attempts: AssignmentAttempt[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [handingIn, setHandingIn] = useState<AssignmentAttempt | null>(null);

  const start = useMutation({
    mutationFn: (attempt: AssignmentAttempt) => startAssignment(attempt.assignmentId),
    onSuccess: (_result, attempt) => {
      void queryClient.invalidateQueries({ queryKey: qk.assignments.myWork });
      const href = playerHref(attempt);
      if (href) navigate(href);
      else setHandingIn(attempt);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      {start.error ? <ErrorState error={start.error} /> : null}
      {attempts.map((attempt) => {
        const isOverdue = attempt.state === 'OVERDUE';
        const canPlay = attempt.state === 'NOT_STARTED' || attempt.state === 'IN_PROGRESS' || isOverdue;
        const hasPlayer = playerHref(attempt) !== null;
        return (
          <div
            key={attempt.id}
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3',
              isOverdue ? 'bg-danger-soft' : 'bg-surface-sunken',
            )}
          >
            <div className="min-w-0">
              <p className="font-medium text-ink">{attempt.assignment.title}</p>
              <p className="text-sm text-ink-muted">
                {attempt.assignment.dueAt ? `Due ${formatRelative(attempt.assignment.dueAt)}` : 'No due date'}
                {formatAboutMinutes(attempt.assignment.estimatedMinutes)
                  ? ` · ${formatAboutMinutes(attempt.assignment.estimatedMinutes)?.toLowerCase()}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={isOverdue ? 'danger' : 'neutral'} variant={isOverdue ? 'solid' : 'soft'}>
                {STATE_LABEL[attempt.state]}
              </Badge>
              {canPlay ? (
                <Button
                  size="sm"
                  isLoading={start.isPending && start.variables?.id === attempt.id}
                  onClick={() => start.mutate(attempt)}
                >
                  {hasPlayer ? (attempt.state === 'IN_PROGRESS' ? 'Carry on' : 'Start') : 'Hand in'}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
      {handingIn ? (
        <HandInModal
          attempt={handingIn}
          onClose={() => setHandingIn(null)}
          onDone={() => {
            setHandingIn(null);
            void queryClient.invalidateQueries({ queryKey: qk.assignments.myWork });
          }}
        />
      ) : null}
    </div>
  );
}

function HandInModal({
  attempt,
  onClose,
  onDone,
}: {
  attempt: AssignmentAttempt;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => submitAssignment(attempt.assignmentId, { note: note.trim() || undefined }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={attempt.assignment.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Not yet
          </Button>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Hand it in
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-ink">Finished this? Hand it in and your teacher will take a look.</p>
        <Field label="A note for your teacher" hint="Optional.">
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
