import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, IconBack, IconSuccess, PageHeader, text } from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { fetchAssessment } from '@/assessment/assessment.api';
import type { SubmitAttemptResult } from '@/assessment/assessment.types';
import { fetchActivityDelivery } from '@/content/content.api';
import type { ActivityDelivery } from '@/content/content.types';
import { completePathItem } from '@/learning/learning.api';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { AssessmentPlayer } from '../components/AssessmentPlayer';
import { ActivityPlaceholder } from '../components/ActivityPlaceholder';
import { ReaderActivity } from '../components/ReaderActivity';
import { TeacherTaskActivity } from '../components/TeacherTaskActivity';

/**
 * Plays one activity, graded or not.
 *
 * `?kind=` (set by the link that sent the learner here — `ActivitiesPage`'s
 * `PathStepRow`) decides which of two very different things the route param
 * actually is:
 *  - `kind=assessment` (default, for backward compatibility with any old
 *    link): the param is an assessment id, and grading happens through the
 *    assessment attempt engine (`AssessmentPlayer`) — the only place a
 *    response is checked server-side against an answer key.
 *  - `kind=activity`: the param is an activity id with no assessment behind
 *    it. This is the path for EXPLANATION, WORKED_EXAMPLE, MINI_GAME,
 *    TEACHER_TASK and PRACTICE_SEQUENCE — content the backend can author and
 *    mark as complete but that was previously undeliverable to a student
 *    (see `requiresQuestions()` in `content.helpers.ts`). It's read directly
 *    via `GET /activities/:id/deliver` and finished with `completePathItem`,
 *    the same "mark this step done" action `LessonModal` uses for a lesson
 *    step — there's no assessment attempt to submit.
 *
 * `?pathId=&itemId=` are attached whenever this activity is a step on the
 * learner's path, so finishing it can unlock the next step.
 */
export function ActivityPlayerPage() {
  const { activityId = '' } = useParams<{ activityId: string }>();
  const [searchParams] = useSearchParams();
  const kind = searchParams.get('kind') === 'activity' ? 'activity' : 'assessment';
  const pathId = searchParams.get('pathId');
  const itemId = searchParams.get('itemId');
  const navigate = useNavigate();

  return kind === 'activity' ? (
    <ActivityOnlyPlayer activityId={activityId} pathId={pathId} itemId={itemId} onExit={() => navigate(paths.learn.activities)} />
  ) : (
    <AssessmentActivityPlayer activityId={activityId} pathId={pathId} itemId={itemId} onExit={() => navigate(paths.learn.activities)} />
  );
}

interface PlayerProps {
  activityId: string;
  pathId: string | null;
  itemId: string | null;
  onExit: () => void;
}

function AssessmentActivityPlayer({ activityId, pathId, itemId, onExit }: PlayerProps) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<SubmitAttemptResult | null>(null);

  const assessmentQuery = useQuery({
    queryKey: qk.assessment.definition(activityId),
    queryFn: () => fetchAssessment(activityId),
    enabled: Boolean(activityId),
  });

  const completeStep = useMutation({
    mutationFn: () => completePathItem(pathId as string, itemId as string),
    onSuccess: () => {
      if (pathId) void queryClient.invalidateQueries({ queryKey: qk.learningPaths.detail(pathId) });
    },
  });

  useDocumentTitle(assessmentQuery.data?.title ?? 'Activity');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
            onClick={onExit}
            className="-ml-2 self-start"
          >
            Back to my learning
          </Button>
        }
        title={assessmentQuery.data?.title ?? 'Activity'}
      />

      <QueryBoundary isLoading={assessmentQuery.isPending} error={assessmentQuery.error}>
        {!result ? (
          <AssessmentPlayer
            assessmentId={activityId}
            onComplete={(finalResult) => {
              setResult(finalResult);
              if (pathId && itemId) completeStep.mutate();
            }}
          />
        ) : (
          <Card
            className={cn(
              'border-2',
              result.passed ? 'border-success-muted bg-success-soft' : 'border-secondary-muted bg-secondary-soft',
            )}
          >
            <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-16 w-16 items-center justify-center rounded-full shadow-md',
                  result.passed
                    ? 'bg-success text-success-contrast'
                    : 'bg-secondary text-secondary-contrast',
                )}
              >
                <IconSuccess className="h-8 w-8" />
              </span>
              <p className={cn(text.heading, 'text-3xl tabular-nums')}>
                {result.itemsCorrect} of {result.itemsPresented}
              </p>
              <p className={cn(text.eyebrow, result.passed ? 'text-success-strong' : 'text-secondary-strong')}>
                questions correct
              </p>
              <p className="max-w-prose leading-body text-ink">
                {result.passed
                  ? 'Great work — that shows real progress.'
                  : 'Good effort — every attempt helps you learn. You can try again from your learning list.'}
              </p>
              <Button size="lg" onClick={onExit}>
                Continue learning
              </Button>
            </CardBody>
          </Card>
        )}
      </QueryBoundary>
    </div>
  );
}

function ActivityOnlyPlayer({ activityId, pathId, itemId, onExit }: PlayerProps) {
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const activityQuery = useQuery({
    queryKey: qk.activities.delivery(activityId),
    queryFn: () => fetchActivityDelivery(activityId),
    enabled: Boolean(activityId),
  });

  const completeStep = useMutation({
    mutationFn: () => completePathItem(pathId as string, itemId as string),
    onSuccess: () => {
      setDone(true);
      if (pathId) void queryClient.invalidateQueries({ queryKey: qk.learningPaths.detail(pathId) });
    },
  });

  useDocumentTitle(activityQuery.data?.title ?? 'Activity');

  const activity = activityQuery.data;
  const canComplete = Boolean(pathId && itemId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
            onClick={onExit}
            className="-ml-2 self-start"
          >
            Back to my learning
          </Button>
        }
        title={activity?.title ?? 'Activity'}
      />

      <QueryBoundary isLoading={activityQuery.isPending} error={activityQuery.error}>
        {done || !canComplete ? (
          done ? (
            <Card className="border-2 border-success-muted bg-success-soft">
              <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
                <span
                  aria-hidden
                  className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-contrast shadow-md"
                >
                  <IconSuccess className="h-8 w-8" />
                </span>
                <p className={cn(text.heading, 'text-2xl')}>Done!</p>
                <p className="max-w-prose leading-body text-ink">
                  Nice work — that&apos;s marked complete.
                </p>
                <Button size="lg" onClick={onExit}>
                  Continue learning
                </Button>
              </CardBody>
            </Card>
          ) : activity ? (
            <ActivityBody activity={activity} isCompleting={false} onDone={onExit} />
          ) : null
        ) : activity ? (
          <ActivityBody activity={activity} isCompleting={completeStep.isPending} onDone={() => completeStep.mutate()} />
        ) : null}
      </QueryBoundary>
    </div>
  );
}

function ActivityBody({
  activity,
  isCompleting,
  onDone,
}: {
  activity: ActivityDelivery;
  isCompleting: boolean;
  onDone: () => void;
}) {
  switch (activity.type) {
    case 'EXPLANATION':
    case 'WORKED_EXAMPLE':
      return <ReaderActivity activity={activity} isCompleting={isCompleting} onDone={onDone} />;
    case 'TEACHER_TASK':
      return <TeacherTaskActivity activity={activity} isCompleting={isCompleting} onDone={onDone} />;
    case 'MINI_GAME':
    case 'PRACTICE_SEQUENCE':
      return <ActivityPlaceholder activity={activity} isCompleting={isCompleting} onDone={onDone} />;
    default:
      // A question-based type reached this branch (an activity-only path step
      // with no assessment behind it) — nothing to grade against here, so
      // fall back to the same honest placeholder rather than a dead end.
      return <ActivityPlaceholder activity={activity} isCompleting={isCompleting} onDone={onDone} />;
  }
}
