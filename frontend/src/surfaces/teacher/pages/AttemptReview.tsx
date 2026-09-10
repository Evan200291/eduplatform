import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchAttemptResponses, overrideResponse } from '@/assessment/assessment.api';
import type { AssessmentAttempt, AttemptResponse } from '@/assessment/assessment.types';
import { qk } from '@/query/keys';
import { formatDuration } from '@/lib/format';

/**
 * One attempt, answer by answer, with the teacher able to re-mark any of them.
 *
 * Automatic marking is right most of the time and wrong in ways a teacher
 * spots at once — "3/4" typed for "0.75", a sensible spelling of a short
 * answer. A re-mark is recorded with a note and the teacher's name. The
 * attempt's score is recalculated; for a completed, non-practice attempt the
 * mastery evidence is rewritten too.
 */

/** A readable summary of the stored response envelope (`responsePayloadSchema`). */
function describeResponse(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '—';
  const response = raw as Record<string, unknown>;
  if (response.skipped === true) return 'Skipped';
  if (typeof response.booleanValue === 'boolean') return response.booleanValue ? 'True' : 'False';
  if (typeof response.numericValue === 'number') return String(response.numericValue);
  if (typeof response.textValue === 'string') return `“${response.textValue}”`;
  if (Array.isArray(response.orderedOptionIds)) return `Put ${response.orderedOptionIds.length} items in order`;
  if (Array.isArray(response.pairs)) return `Matched ${response.pairs.length} pair${response.pairs.length === 1 ? '' : 's'}`;
  if (Array.isArray(response.optionIds)) {
    const count = response.optionIds.length;
    return count === 0 ? 'No option chosen' : `Chose ${count} option${count === 1 ? '' : 's'}`;
  }
  return '—';
}

export function AttemptReviewModal({
  attempt,
  studentId,
  onClose,
}: {
  attempt: AssessmentAttempt;
  studentId: string;
  onClose: () => void;
}) {
  const canOverride = useCan('assessment.response.override');
  const [onlyIncorrect, setOnlyIncorrect] = useState(false);
  const [remarking, setRemarking] = useState<AttemptResponse | null>(null);

  const params = { onlyIncorrect, pageSize: 100 };
  const query = useQuery({
    queryKey: qk.assessment.responses(attempt.id, params),
    queryFn: () => fetchAttemptResponses(attempt.id, params),
  });
  const rows = [...(query.data?.items ?? [])].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={attempt.assessment.title}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {attempt.itemsCorrect} of {attempt.itemsPresented} correct
          {attempt.scorePercent !== null ? ` · ${attempt.scorePercent}%` : ''} · {formatDuration(attempt.timeSpentSeconds)}
        </p>
        <Checkbox label="Only answers marked wrong" checked={onlyIncorrect} onChange={(event) => setOnlyIncorrect(event.target.checked)} />
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title={onlyIncorrect ? 'No wrong answers' : 'No answers recorded'} />}
        >
          <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {rows.map((row, index) => (
              <li key={row.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-ink">
                    <span className="text-ink-muted">{index + 1}. </span>
                    {row.question.prompt}
                  </p>
                  <div className="flex items-center gap-1">
                    <Badge tone={row.isCorrect ? 'success' : row.isCorrect === false ? 'danger' : 'neutral'}>
                      {row.isCorrect ? 'Correct' : row.isCorrect === false ? 'Wrong' : 'Not marked'}
                    </Badge>
                    {row.teacherOverridden ? <Badge tone="info">Re-marked</Badge> : null}
                  </div>
                </div>
                <p className="text-ink-muted">
                  Answer: <span className="text-ink">{describeResponse(row.response)}</span> · {row.pointsAwarded}/
                  {row.pointsPossible} pts
                  {row.hintsUsed > 0 ? ` · ${row.hintsUsed} hint${row.hintsUsed === 1 ? '' : 's'}` : ''}
                </p>
                {row.teacherOverrideNote ? (
                  <p className="text-xs text-ink-muted">Re-mark note: {row.teacherOverrideNote}</p>
                ) : null}
                {canOverride ? (
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setRemarking(row)}>
                      Re-mark
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </QueryBoundary>
      </div>
      {remarking ? (
        <RemarkModal
          response={remarking}
          attemptId={attempt.id}
          studentId={studentId}
          onClose={() => setRemarking(null)}
          onDone={() => {
            setRemarking(null);
            void query.refetch();
          }}
        />
      ) : null}
    </Modal>
  );
}

function RemarkModal({
  response,
  attemptId,
  studentId,
  onClose,
  onDone,
}: {
  response: AttemptResponse;
  attemptId: string;
  studentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState<'correct' | 'wrong'>(response.isCorrect ? 'wrong' : 'correct');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const pointsValue = points.trim() === '' ? undefined : Number(points);

  const mutation = useMutation({
    mutationFn: () =>
      overrideResponse(response.id, { isCorrect: verdict === 'correct', pointsAwarded: pointsValue, note: note.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assessment.attempt(attemptId) });
      void queryClient.invalidateQueries({ queryKey: qk.assessment.attempts({ studentId, pageSize: 8 }) });
      void queryClient.invalidateQueries({ queryKey: qk.assessment.mastery(studentId) });
      onDone();
    },
  });

  const pointsInvalid =
    pointsValue !== undefined && (!Number.isFinite(pointsValue) || pointsValue < 0 || pointsValue > response.pointsPossible);

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title="Re-mark this answer"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            disabled={note.trim().length < 4 || pointsInvalid}
            onClick={() => mutation.mutate()}
          >
            Save mark
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink">{response.question.prompt}</p>
        <p className="text-sm text-ink-muted">Answer: {describeResponse(response.response)}</p>
        <Field label="Mark as">
          <Select
            value={verdict}
            onChange={(event) => setVerdict(event.target.value as 'correct' | 'wrong')}
            options={[
              { value: 'correct', label: 'Correct' },
              { value: 'wrong', label: 'Wrong' },
            ]}
          />
        </Field>
        <Field label="Points" hint={`Optional, 0 to ${response.pointsPossible}. Empty gives full marks if correct, none if wrong.`}>
          <Input type="number" min={0} max={response.pointsPossible} value={points} onChange={(event) => setPoints(event.target.value)} />
        </Field>
        <Field label="Why" isRequired hint="At least four characters. Kept with the mark.">
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Equivalent fraction accepted" />
        </Field>
      </div>
    </Modal>
  );
}
