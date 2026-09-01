import { Badge, Button, Card, CardBody, IconAssignment, text } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ActivityDelivery } from '@/content/content.types';
import { playAccent } from '../play-accents';

export interface TeacherTaskActivityProps {
  activity: ActivityDelivery;
  isCompleting: boolean;
  onDone: () => void;
}

/** Recognises the handful of shapes seen in seeded config; anything else is skipped. */
function readTaskConfig(config: unknown): { evidence?: string; groupWork?: boolean } {
  if (!config || typeof config !== 'object') return {};
  const evidence = (config as { evidence?: unknown }).evidence;
  const groupWork = (config as { groupWork?: unknown }).groupWork;
  return {
    evidence: typeof evidence === 'string' ? evidence : undefined,
    groupWork: typeof groupWork === 'boolean' ? groupWork : undefined,
  };
}

const EVIDENCE_LABEL: Record<string, string> = {
  'photo-or-note': 'a photo or a short note',
  photo: 'a photo',
  note: 'a short note',
};

/**
 * TEACHER_TASK is, per the backend's own doc comment on `requiresQuestions()`,
 * "completed away from the screen" — there is no question to answer here.
 * There is also no data model for a learner to submit evidence (no upload
 * field, no review queue entry created from the student surface), so this is
 * a plain self-report: the learner tells the app they did it, the same
 * "mark this step done" action every other activity-only step uses, plus a
 * reminder that the real check-off is their teacher's.
 */
export function TeacherTaskActivity({ activity, isCompleting, onDone }: TeacherTaskActivityProps) {
  const config = readTaskConfig(activity.config);
  const accent = playAccent(3);

  return (
    <Card className={cn('border-2', accent.borderSoft, accent.surface)}>
      <CardBody className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full shadow-sm', accent.chip)}
          >
            <IconAssignment className="h-6 w-6" />
          </span>
          <p className={cn(text.heading, 'text-xl')}>Something to do away from the screen</p>
        </div>
        {activity.instructions ? (
          <p className="whitespace-pre-line leading-body text-ink">{activity.instructions}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info" variant="solid">
            Off-screen task
          </Badge>
          {config.groupWork ? <Badge tone="neutral">Can be done with others</Badge> : null}
        </div>
        <p className="leading-body text-ink">
          This is something you do away from the app
          {config.evidence ? ` — bring ${EVIDENCE_LABEL[config.evidence] ?? config.evidence} to show your teacher` : ''}.
          Ask your teacher to check it off once you&apos;ve finished, or let us know here when you&apos;re done.
        </p>
        <Button size="lg" isLoading={isCompleting} onClick={onDone} className="self-start">
          I did this
        </Button>
      </CardBody>
    </Card>
  );
}
