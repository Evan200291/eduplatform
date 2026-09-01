import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  IconLeaderboard,
  IconPoints,
  PageHeader,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { fetchMyStandings, setLeaderboardOptOut } from '@/leaderboard/leaderboard.api';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { playAccent } from '../play-accents';

/**
 * Off by default per school setting — this page simply renders nothing to opt
 * into if disabled.
 *
 * Rank is the thing a learner looks for, so it is a large medallion rather than
 * a line of text, and each board takes its own colour from the decorative
 * rotation so several boards stay tellable apart. Movement keeps the semantic
 * success/warning tones: up and down are the one piece of state here.
 */
export function LeaderboardPage() {
  useDocumentTitle('Top scores');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.leaderboard.mine(),
    queryFn: () => fetchMyStandings(),
  });

  const optOut = useMutation({
    mutationFn: ({ boardId, hidden }: { boardId: string; hidden: boolean }) =>
      setLeaderboardOptOut(boardId, hidden),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.leaderboard.mine() }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Top scores" description="How your class is doing." />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.standings.length === 0}
        emptyState={
          <EmptyState
            icon={<IconLeaderboard aria-hidden className="h-8 w-8 text-play-4" />}
            title="No leaderboards yet"
            description="Your school hasn't turned these on — your points still count towards badges and missions."
          />
        }
      >
        <div className="flex flex-col gap-4">
          {query.data?.standings.map((standing, index) => {
            const accent = playAccent(index);

            return (
              <Card
                key={standing.board.id}
                className={cn('border-l-4', accent.borderLeft, accent.surface)}
              >
                <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-sm',
                        accent.chip,
                      )}
                    >
                      <span className={cn(text.heading, 'text-2xl tabular-nums text-ink-on-brand')}>
                        {standing.rank}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className={cn(text.eyebrow, accent.text)}>Rank {standing.rank}</p>
                      <p className={cn(text.heading, 'truncate text-lg')}>{standing.board.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                        <IconPoints aria-hidden className={cn('h-4 w-4', accent.text)} />
                        {standing.score} pts
                        {standing.movement ? (
                          <Badge
                            tone={standing.movement > 0 ? 'success' : 'warning'}
                            variant="solid"
                          >
                            {standing.movement > 0 ? '↑' : '↓'} {Math.abs(standing.movement)}
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={optOut.isPending}
                    onClick={() => optOut.mutate({ boardId: standing.board.id, hidden: !standing.optedOut })}
                  >
                    {standing.optedOut ? 'Show me' : 'Hide me'}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </QueryBoundary>
    </div>
  );
}
