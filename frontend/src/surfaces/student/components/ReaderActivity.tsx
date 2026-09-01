import { Button, Card, CardBody, IconLesson, text } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ActivityDelivery } from '@/content/content.types';
import { playAccent } from '../play-accents';

export interface ReaderActivityProps {
  activity: ActivityDelivery;
  isCompleting: boolean;
  onDone: () => void;
}

/**
 * EXPLANATION and WORKED_EXAMPLE activities carry no questions — they're
 * read-only (see `requiresQuestions()` in `content.helpers.ts`). The prose is
 * `activity.instructions`; `config` only ever holds presentation metadata
 * (`{ pages, allowSkip }` in the seed data), nothing worth rendering as its
 * own field. Reading to the end and pressing "Got it" is the whole
 * interaction, mirroring the `LessonModal` pattern on `ActivitiesPage`.
 *
 * The prose sits on the page background rather than a tint, with the tint
 * reserved for the header strip: a wall of body text on a coloured field is
 * harder to read, and this is the one student screen that is mostly reading.
 */
export function ReaderActivity({ activity, isCompleting, onDone }: ReaderActivityProps) {
  const accent = playAccent(0);

  return (
    <Card>
      <div className={cn('flex items-center gap-3 border-b border-line p-4', accent.surface)}>
        <span
          aria-hidden
          className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', accent.chip)}
        >
          <IconLesson className="h-5 w-5" />
        </span>
        <p className={cn(text.eyebrow, accent.text)}>Have a read</p>
      </div>
      <CardBody className="flex flex-col gap-4 p-6">
        {activity.instructions ? (
          <p className="max-w-prose whitespace-pre-line text-lg leading-body text-ink">
            {activity.instructions}
          </p>
        ) : (
          <p className="max-w-prose text-lg leading-body text-ink">
            Take a moment to read through this, then mark it done.
          </p>
        )}
        <Button size="lg" isLoading={isCompleting} onClick={onDone} className="self-start">
          Got it
        </Button>
      </CardBody>
    </Card>
  );
}
