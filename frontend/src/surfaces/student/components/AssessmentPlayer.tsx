import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  IconStart,
  IconSuccess,
  ProgressBar,
  Spinner,
  text,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import {
  abandonAttempt,
  fetchNextItem,
  startAttempt,
  submitAttempt,
  submitResponse,
} from '@/assessment/assessment.api';
import type { NextItemResult, SubmitAttemptResult, SubmitResponseInput } from '@/assessment/assessment.types';
import { qk } from '@/query/keys';
import { QuestionCard } from './QuestionCard';
import { ReportProblemButton } from './ReportProblem';

export interface AssessmentPlayerProps {
  assessmentId: string;
  isPractice?: boolean;
  /** Set when a teacher or the school deliberately timed this assessment. */
  timeLimitMinutes?: number | null;
  onComplete: (result: SubmitAttemptResult) => void;
}

/**
 * Drives one assessment attempt end to end: start → (fetch next item → submit
 * a response) in a loop → submit the whole attempt.
 *
 * This is the one place in the student surface that talks to the assessment
 * engine, so the screening check and an ordinary topic quiz share it — they
 * differ only in which `assessmentId` is passed in. Placement/band language is
 * deliberately never shown here: `SubmitAttemptResult` withholds it from a
 * learner server-side, and this component doesn't try to reconstruct it.
 *
 * PRD v2.5 on time: a visible time limit appears only when the assessment was
 * deliberately timed. The server stamps `expiresAt` on the attempt and refuses
 * answers after it, so the clock here reads that value rather than keeping its
 * own. When it runs out the attempt is closed (the server records it as
 * expired, not abandoned) and the learner is told kindly what happened.
 *
 * After a wrong answer the next question waits for the learner, so the
 * explanation or clue is actually read rather than replaced after a moment.
 */
export function AssessmentPlayer({ assessmentId, isPractice, timeLimitMinutes, onComplete }: AssessmentPlayerProps) {
  const queryClient = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{ isCorrect?: boolean; feedback?: string } | null>(null);
  const [waitingOn, setWaitingOn] = useState<string | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [ended, setEnded] = useState<'stopped' | 'time-up' | null>(null);

  const start = useMutation({
    mutationFn: () => startAttempt(assessmentId, { isPractice }),
    onSuccess: (attempt) => {
      setAttemptId(attempt.id);
      setExpiresAt(attempt.expiresAt ? Date.parse(attempt.expiresAt) : null);
      setEnded(null);
    },
  });

  const nextItemQuery = useQuery({
    queryKey: qk.assessment.nextItem(attemptId ?? 'none'),
    queryFn: () => fetchNextItem(attemptId as string),
    enabled: Boolean(attemptId),
  });

  const advance = () => {
    setLastFeedback(null);
    setWaitingOn(null);
    if (attemptId) void queryClient.invalidateQueries({ queryKey: qk.assessment.nextItem(attemptId) });
  };

  const answer = useMutation({
    mutationFn: (input: SubmitResponseInput) => submitResponse(attemptId as string, input),
    onSuccess: (result, input) => {
      setLastFeedback(
        result.isCorrect === undefined && !result.feedback
          ? { feedback: undefined }
          : { isCorrect: result.isCorrect, feedback: result.feedback },
      );
      if (result.isCorrect === false) {
        setWaitingOn(input.questionId);
      } else {
        // A short pause so a correct/recorded badge is readable before the
        // next question replaces it.
        window.setTimeout(advance, 700);
      }
    },
  });

  const finish = useMutation({
    mutationFn: () => submitAttempt(attemptId as string),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: qk.gamification.summary });
      onComplete(result);
    },
  });

  /** Closing the attempt properly, so a half-finished one is not left open or counted. */
  const close = useMutation({
    mutationFn: (reason: 'stopped' | 'time-up') =>
      abandonAttempt(attemptId as string, reason === 'time-up' ? 'Time limit reached' : 'Stopped by the learner'),
    onSettled: (_data, _error, reason) => {
      // Even if the call fails the attempt cannot take more answers, so the
      // learner is not left facing a question the server will refuse.
      setConfirmingStop(false);
      setAttemptId(null);
      setExpiresAt(null);
      setWaitingOn(null);
      setLastFeedback(null);
      setEnded(reason);
      start.reset();
    },
  });

  const secondsLeft = useSecondsLeft(expiresAt);
  const { mutate: closeAttempt, isPending: isClosing } = close;
  useEffect(() => {
    if (secondsLeft === 0 && attemptId && !isClosing) closeAttempt('time-up');
  }, [secondsLeft, attemptId, isClosing, closeAttempt]);

  if (!attemptId) {
    return (
      <Card className="border-2 border-primary-muted bg-primary-soft">
        <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
          {start.error ? <ErrorState error={start.error} /> : null}
          {ended === 'stopped' ? (
            <p className="text-ink">You stopped that one. Nothing you answered counts against you — start again whenever you like.</p>
          ) : null}
          {ended === 'time-up' ? (
            <p className="text-ink" role="status">
              Time is up for this one. The answers you gave before the time ran out are kept, and your teacher can see
              how far you got.
            </p>
          ) : null}
          <p className={cn(text.heading, 'text-xl')}>
            {ended === 'stopped' ? 'Start again?' : ended === 'time-up' ? 'Well done for trying' : 'Ready when you are'}
          </p>
          {timeLimitMinutes && ended !== 'time-up' ? (
            <p className="text-ink-muted">
              This one has a time limit of {timeLimitMinutes} minute{timeLimitMinutes === 1 ? '' : 's'}. The clock
              starts when you press Start.
            </p>
          ) : null}
          {ended !== 'time-up' ? (
            <Button
              size="lg"
              isLoading={start.isPending}
              leadingIcon={<IconStart aria-hidden className="h-5 w-5" />}
              onClick={() => start.mutate()}
            >
              Start
            </Button>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  if (nextItemQuery.isPending) {
    return (
      <Card>
        <CardBody className="flex justify-center py-10">
          <Spinner label="Loading the next question" />
        </CardBody>
      </Card>
    );
  }

  if (nextItemQuery.error) {
    return <ErrorState error={nextItemQuery.error} onRetry={() => void nextItemQuery.refetch()} />;
  }

  const data = nextItemQuery.data as NextItemResult;

  if (data.done) {
    return (
      <Card className="border-2 border-success-muted bg-success-soft">
        <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
          <span
            aria-hidden
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-contrast shadow-md"
          >
            <IconSuccess className="h-8 w-8" />
          </span>
          <p className={cn(text.heading, 'text-2xl')}>Nice work — that&apos;s everything.</p>
          <Button size="lg" isLoading={finish.isPending} onClick={() => finish.mutate()}>
            See how it went
          </Button>
          {finish.error ? <ErrorState error={finish.error} /> : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border-2 border-primary-muted bg-primary-soft p-4">
        <ProgressBar
          label={`Question ${data.itemsAnswered + 1} of ${data.itemsTotal || '?'}`}
          value={data.itemsTotal ? (data.itemsAnswered / data.itemsTotal) * 100 : 0}
          showValue={false}
        />
        {secondsLeft !== null ? <TimeLeft secondsLeft={secondsLeft} /> : null}
      </div>
      {data.item.questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          isSubmitting={answer.isPending}
          feedback={answer.isSuccess && answer.variables?.questionId === question.id ? lastFeedback : null}
          onContinue={waitingOn === question.id ? advance : undefined}
          onSubmit={(response, hintsUsed) => answer.mutate({ questionId: question.id, response, hintsUsed })}
        />
      ))}
      {answer.error ? <ErrorState error={answer.error} /> : null}
      {isPractice ? <Badge tone="info">Practice — this won&apos;t count toward your score.</Badge> : null}
      {close.error ? <ErrorState error={close.error} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {confirmingStop ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink">Stop now? You can start again later.</span>
            <Button size="sm" variant="danger" isLoading={close.isPending} onClick={() => close.mutate('stopped')}>
              Yes, stop
            </Button>
            <Button size="sm" variant="outline" disabled={close.isPending} onClick={() => setConfirmingStop(false)}>
              Keep going
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingStop(true)}>
            Stop for now
          </Button>
        )}
        <ReportProblemButton key={data.item.activityId} activityId={data.item.activityId} />
      </div>
    </div>
  );
}

/** Seconds until `expiresAt`, ticking once a second. Null when there is no limit. */
function useSecondsLeft(expiresAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/**
 * The visible clock. Screen readers are told at five minutes and at one
 * minute rather than every second, which would drown out the questions.
 */
function TimeLeft({ secondsLeft }: { secondsLeft: number }) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isLow = secondsLeft <= 60;
  const announcement =
    secondsLeft <= 60 && secondsLeft > 55
      ? 'One minute left.'
      : secondsLeft <= 300 && secondsLeft > 295
        ? 'Five minutes left.'
        : '';
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-ink-muted">Time left</span>
      <Badge tone={isLow ? 'warning' : 'neutral'} variant={isLow ? 'solid' : 'soft'}>
        <span role="timer" aria-label={`${minutes} minutes ${seconds} seconds left`} className="tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
      </Badge>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
