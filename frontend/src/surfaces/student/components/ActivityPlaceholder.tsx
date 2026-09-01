import { Badge, Button, Card, CardBody, IconGamification, text } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ActivityDelivery } from '@/content/content.types';
import { playAccent } from '../play-accents';

export interface ActivityPlaceholderProps {
  activity: ActivityDelivery;
  isCompleting: boolean;
  onDone: () => void;
}

function readNumber(config: unknown, key: string): number | null {
  if (!config || typeof config !== 'object') return null;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function readString(config: unknown, key: string): string | null {
  if (!config || typeof config !== 'object') return null;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * MINI_GAME and PRACTICE_SEQUENCE activities have real authoring and backend
 * completion support, but their `config` is metadata for a game engine or
 * question-picker this platform doesn't have on the student surface (seeded
 * shapes: `{ game, rounds, secondsPerRound, livesAllowed }` for MINI_GAME,
 * `{ itemCount, shuffle, allowHints, stopAfterConsecutiveWrong }` for
 * PRACTICE_SEQUENCE — no actual gameplay or question payload travels with
 * either). Rather than invent gameplay that isn't backed by real content,
 * this shows the learner what to expect and lets them finish the step
 * honestly, so it doesn't dead-end like it did before.
 */
export function ActivityPlaceholder({ activity, isCompleting, onDone }: ActivityPlaceholderProps) {
  const isMiniGame = activity.type === 'MINI_GAME';
  const rounds = readNumber(activity.config, 'rounds');
  const game = readString(activity.config, 'game');
  const itemCount = readNumber(activity.config, 'itemCount');
  // Two visual identities so a game and a practice round are not the same card
  // with different words. Neither colour carries state.
  const accent = playAccent(isMiniGame ? 2 : 5);

  return (
    <Card className={cn('border-2', accent.borderSoft, accent.surface)}>
      <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
        <span
          aria-hidden
          className={cn(
            'inline-flex h-16 w-16 items-center justify-center rounded-full shadow-md',
            accent.chip,
          )}
        >
          <IconGamification className="h-8 w-8" />
        </span>
        <p className={cn(text.heading, 'text-xl')}>
          {isMiniGame ? 'A quick game' : 'A round of practice'}
        </p>
        {activity.instructions ? (
          <p className="max-w-prose whitespace-pre-line leading-body text-ink">{activity.instructions}</p>
        ) : (
          <p className="max-w-prose leading-body text-ink">
            {isMiniGame
              ? 'A quick game for this topic — more game modes are coming soon.'
              : 'A round of practice questions for this topic.'}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {isMiniGame && game ? <Badge tone="brand" variant="solid">{game.replace(/-/g, ' ')}</Badge> : null}
          {isMiniGame && rounds ? <Badge tone="neutral">{rounds} rounds</Badge> : null}
          {!isMiniGame && itemCount ? <Badge tone="neutral">About {itemCount} questions</Badge> : null}
        </div>
        <Button size="lg" isLoading={isCompleting} onClick={onDone}>
          Mark as done
        </Button>
      </CardBody>
    </Card>
  );
}
