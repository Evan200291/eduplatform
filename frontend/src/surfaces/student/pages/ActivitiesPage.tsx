import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  IconActivity,
  IconAssessment,
  IconCheck,
  IconLesson,
  IconLock,
  IconStart,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  text,
} from '@/components/ui';
import { QueryBoundary, ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { fetchEnrolledClasses } from '@/academic/academic.api';
import { fetchLesson } from '@/content/content.api';
import { completePathItem, fetchActivePath } from '@/learning/learning.api';
import type { PathItem } from '@/learning/learning.types';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { playAccent, stateChip } from '../play-accents';

const STATUS_TONE = {
  LOCKED: 'neutral',
  AVAILABLE: 'brand',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  SKIPPED: 'neutral',
  REMOVED_BY_TEACHER: 'neutral',
} as const;

/** Plain-language wording; the raw enum never reaches a learner. */
const STATUS_LABEL = {
  LOCKED: 'Locked',
  AVAILABLE: 'Ready',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Done',
  SKIPPED: 'Skipped',
  REMOVED_BY_TEACHER: 'Removed',
} as const;

/**
 * The learner's active learning path for one subject.
 *
 * Presented as a numbered climb rather than a list: the path's own summary
 * rides at the top as a progress panel, and every step wears a numbered
 * medallion and a coloured left edge. The colour rotation is decorative — it
 * exists so twelve steps do not read as twelve identical rows — and steps that
 * carry real state override it: a completed step goes green, a locked one goes
 * grey and loses its tint entirely, so "what can I actually do next" is legible
 * at arm's length.
 *
 * A step with an `assessmentId` is graded and opens the activity player. A
 * step with only a `lessonId` (or an `activityId` with no assessment behind
 * it) has no server-side grading to plug into, so it opens inline for reading
 * and is marked done directly — the same model the backend itself uses for a
 * lesson step (see `learning.items.service.ts`).
 */
export function ActivitiesPage() {
  useDocumentTitle('Learn');
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<{ item: PathItem } | null>(null);

  const classesQuery = useQuery({
    queryKey: qk.classes.mine,
    queryFn: fetchEnrolledClasses,
  });

  const subjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const cls of classesQuery.data ?? []) {
      for (const { subject } of cls.classSubjects) map.set(subject.id, subject);
    }
    return [...map.values()];
  }, [classesQuery.data]);

  const activeSubjectId = subjectId ?? subjects[0]?.id ?? null;

  const pathQuery = useQuery({
    queryKey: qk.activePath(activeSubjectId ?? 'none'),
    queryFn: () => fetchActivePath(activeSubjectId as string),
    enabled: Boolean(activeSubjectId),
  });

  const summary = pathQuery.data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Learn"
        description="Your lessons and activities, in order."
        actions={
          subjects.length > 1 ? (
            <Select
              aria-label="Subject"
              value={activeSubjectId ?? ''}
              onChange={(event) => setSubjectId(event.target.value)}
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              className="w-48"
            />
          ) : null
        }
      />

      <QueryBoundary isLoading={classesQuery.isPending} error={classesQuery.error}>
        {!activeSubjectId ? (
          <EmptyState
            icon={<IconActivity aria-hidden className="h-8 w-8 text-play-1" />}
            title="Your subjects are on their way"
            description="Ask your teacher to add you to a class, and your activities will show up right here."
          />
        ) : (
          <QueryBoundary
            isLoading={pathQuery.isPending}
            error={pathQuery.error}
            isEmpty={!pathQuery.data}
            emptyState={
              <EmptyState
                icon={<IconActivity aria-hidden className="h-8 w-8 text-play-1" />}
                title="Nothing set up just yet"
                description="Your teacher is still putting your learning path together for this subject. Check back soon!"
              />
            }
          >
            {pathQuery.data ? (
              <div className="flex flex-col gap-4">
                {summary ? (
                  <Card className="border-2 border-primary-muted bg-primary-soft">
                    <CardBody className="flex flex-col gap-3 p-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className={cn(text.eyebrow, 'text-primary-strong')}>
                            {pathQuery.data.subject.name}
                          </p>
                          <p className={cn(text.heading, 'mt-1 text-xl')}>
                            {summary.stepsCompleted} of {summary.stepsTotal} steps done
                          </p>
                        </div>
                        <p className={cn(text.heading, 'text-3xl tabular-nums text-primary-strong')}>
                          {Math.round(summary.completionPercent)}%
                        </p>
                      </div>
                      <ProgressBar
                        label="Your path"
                        value={summary.completionPercent}
                        showValue={false}
                        tone={summary.completionPercent >= 100 ? 'success' : 'brand'}
                      />
                    </CardBody>
                  </Card>
                ) : null}

                <ol className="flex flex-col gap-3">
                  {pathQuery.data.items
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item, index) => (
                      <li key={item.id}>
                        <PathStepRow
                          item={item}
                          stepNumber={index + 1}
                          accentIndex={index}
                          pathId={pathQuery.data!.id}
                          onOpenLesson={() => setOpenLesson({ item })}
                        />
                      </li>
                    ))}
                </ol>
              </div>
            ) : null}
          </QueryBoundary>
        )}
      </QueryBoundary>

      {openLesson ? (
        <LessonModal
          item={openLesson.item}
          pathId={pathQuery.data?.id ?? ''}
          onClose={() => setOpenLesson(null)}
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: qk.activePath(activeSubjectId ?? 'none') });
            setOpenLesson(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PathStepRow({
  item,
  stepNumber,
  accentIndex,
  pathId,
  onOpenLesson,
}: {
  item: PathItem;
  stepNumber: number;
  accentIndex: number;
  pathId: string;
  onOpenLesson: () => void;
}) {
  const title = item.assessment?.title ?? item.activity?.title ?? item.lesson?.title ?? item.topic?.name ?? 'Step';
  const icon = item.assessment ? IconAssessment : item.lesson ? IconLesson : IconActivity;
  const Icon = item.status === 'LOCKED' ? IconLock : item.status === 'COMPLETED' ? IconCheck : icon;
  const isLocked = item.status === 'LOCKED';
  const isDone = item.status === 'COMPLETED';
  const isPlayable = !isLocked && !isDone;
  // A topic-only step (no lesson/activity/assessment linked yet) has nothing
  // for the student to open — that's a content gap upstream, not a reason to
  // show a button that leads nowhere.
  const hasContent = Boolean(item.assessmentId || item.activityId || item.lessonId);

  const accent = playAccent(accentIndex);
  // State outranks decoration: a step the learner cannot open, or has already
  // finished, says so with a semantic colour and gives up its accent.
  const edge = isLocked ? 'border-l-line-strong' : isDone ? 'border-l-success' : accent.borderLeft;
  const chip = isLocked ? stateChip.locked : isDone ? stateChip.success : accent.chip;

  // A step with `assessmentId` is graded through the assessment engine (see
  // `ActivityPlayerPage`'s `kind=assessment` branch). A step with only
  // `activityId` — EXPLANATION, WORKED_EXAMPLE, MINI_GAME, TEACHER_TASK,
  // PRACTICE_SEQUENCE and any other activity never wrapped in an assessment —
  // has no attempt to start, so it opens the same page in its `kind=activity`
  // branch instead, which reads the activity directly.
  const href = item.assessmentId
    ? `${paths.learn.activity(item.assessmentId)}?kind=assessment&pathId=${encodeURIComponent(pathId)}&itemId=${encodeURIComponent(item.id)}`
    : item.activityId
      ? `${paths.learn.activity(item.activityId)}?kind=activity&pathId=${encodeURIComponent(pathId)}&itemId=${encodeURIComponent(item.id)}`
      : null;

  return (
    <Card
      className={cn(
        'border-l-4',
        edge,
        isLocked ? 'opacity-80' : isDone ? 'bg-success-soft' : accent.surface,
      )}
    >
      <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className={cn(
              'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm',
              chip,
            )}
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className={cn(text.eyebrow, isLocked ? undefined : accent.text, isDone && 'text-success-strong')}>
              Step {stepNumber}
            </p>
            <p className={cn(text.heading, 'truncate text-lg')}>{title}</p>
            <Badge
              tone={STATUS_TONE[item.status]}
              variant={isLocked ? 'soft' : 'solid'}
              className="mt-2"
            >
              {STATUS_LABEL[item.status]}
            </Badge>
          </div>
        </div>
        {isPlayable && hasContent ? (
          href ? (
            <ButtonLink
              to={href}
              size="lg"
              leadingIcon={<IconStart aria-hidden className="h-4 w-4" />}
            >
              {item.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
            </ButtonLink>
          ) : (
            <Button size="lg" onClick={onOpenLesson}>
              Open
            </Button>
          )
        ) : isPlayable ? (
          <p className="shrink-0 text-sm text-ink-muted">More on this soon</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function LessonModal({
  item,
  pathId,
  onClose,
  onDone,
}: {
  item: PathItem;
  pathId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const lessonId = item.lesson?.id;
  const query = useQuery({
    queryKey: qk.lessons.detail(lessonId ?? 'none'),
    queryFn: () => fetchLesson(lessonId as string),
    enabled: Boolean(lessonId),
  });

  const markDone = useMutation({
    mutationFn: () => completePathItem(pathId, item.id),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={query.data?.title ?? item.lesson?.title ?? 'Lesson'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button isLoading={markDone.isPending} onClick={() => markDone.mutate()}>
            Mark as done
          </Button>
        </>
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error}>
        <div className="flex flex-col gap-4">
          {query.data?.summary ? (
            <p className="rounded-lg bg-primary-soft p-4 leading-body text-ink">{query.data.summary}</p>
          ) : null}
          {(query.data?.sections ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((section, index) => (
              <div key={section.id} className={cn('rounded-lg border-l-4 p-4', playAccent(index).borderLeft, playAccent(index).surface)}>
                <h3 className={cn(text.heading, 'text-lg')}>{section.heading}</h3>
                <p className="mt-1 whitespace-pre-line leading-body text-ink">{section.body}</p>
              </div>
            ))}
        </div>
      </QueryBoundary>
      {markDone.error ? <ErrorState error={markDone.error} /> : null}
    </Modal>
  );
}
