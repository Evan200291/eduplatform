import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, IconStart, IconSuccess, ProgressBar, Spinner, text } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import {
  fetchNextItem,
  startAttempt,
  submitAttempt,
  submitResponse,
} from '@/assessment/assessment.api';
import type { NextItemResult, SubmitAttemptResult, SubmitResponseInput } from '@/assessment/assessment.types';
import { qk } from '@/query/keys';
import { QuestionCard } from './QuestionCard';

export interface AssessmentPlayerProps {
  assessmentId: string;
  isPractice?: boolean;
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
 */
export function AssessmentPlayer({ assessmentId, isPractice, onComplete }: AssessmentPlayerProps) {
  const queryClient = useQueryClient();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{ isCorrect?: boolean; feedback?: string } | null>(null);

  const start = useMutation({
    mutationFn: () => startAttempt(assessmentId, { isPractice }),
    onSuccess: (attempt) => setAttemptId(attempt.id),
  });

  const nextItemQuery = useQuery({
    queryKey: qk.assessment.nextItem(attemptId ?? 'none'),
    queryFn: () => fetchNextItem(attemptId as string),
    enabled: Boolean(attemptId),
  });

  const answer = useMutation({
    mutationFn: (input: SubmitResponseInput) => submitResponse(attemptId as string, input),
    onSuccess: (result) => {
      setLastFeedback(
        result.isCorrect === undefined && !result.feedback
          ? { feedback: undefined }
          : { isCorrect: result.isCorrect, feedback: result.feedback },
      );
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

  if (!attemptId) {
    return (
      <Card className="border-2 border-primary-muted bg-primary-soft">
        <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
          {start.error ? <ErrorState error={start.error} /> : null}
          <p className={cn(text.heading, 'text-xl')}>Ready when you are</p>
          <Button
            size="lg"
            isLoading={start.isPending}
            leadingIcon={<IconStart aria-hidden className="h-5 w-5" />}
            onClick={() => start.mutate()}
          >
            Start
          </Button>
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
      <div className="rounded-lg border-2 border-primary-muted bg-primary-soft p-4">
        <ProgressBar
          label={`Question ${data.itemsAnswered + 1} of ${data.itemsTotal || '?'}`}
          value={data.itemsTotal ? (data.itemsAnswered / data.itemsTotal) * 100 : 0}
          showValue={false}
        />
      </div>
      {data.item.questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          isSubmitting={answer.isPending}
          feedback={answer.isSuccess && answer.variables?.questionId === question.id ? lastFeedback : null}
          onSubmit={(response, hintsUsed) => {
            answer.mutate(
              { questionId: question.id, response, hintsUsed },
              {
                onSuccess: () => {
                  // A short pause so a correct/incorrect badge is actually readable
                  // before the next question replaces it.
                  window.setTimeout(() => {
                    setLastFeedback(null);
                    void queryClient.invalidateQueries({ queryKey: qk.assessment.nextItem(attemptId) });
                  }, 700);
                },
              },
            );
          }}
        />
      ))}
      {answer.error ? <ErrorState error={answer.error} /> : null}
      {isPractice ? <Badge tone="info">Practice — this won&apos;t count toward your score.</Badge> : null}
    </div>
  );
}
