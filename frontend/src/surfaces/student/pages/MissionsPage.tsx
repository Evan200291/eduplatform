import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  IconMission,
  IconPoints,
  PageHeader,
  ProgressBar,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { acknowledgeMissionProgress, fetchMyMissions } from '@/missions/missions.api';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useEffect } from 'react';
import { playAccent, stateChip } from '../play-accents';

const STATUS_TONE = { NOT_STARTED: 'neutral', ACTIVE: 'brand', COMPLETED: 'success', EXPIRED: 'neutral' } as const;

const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  ACTIVE: 'In progress',
  COMPLETED: 'Complete',
  EXPIRED: 'Finished',
} as const;

/**
 * Short-term goals layered on top of ordinary learning — see blueprint §03.
 *
 * Each mission is a tinted card with its own colour from the decorative
 * rotation, so a grid of them reads as a set of distinct challenges. The
 * progress bar and the points reward are the two things a learner actually
 * scans for, so both are given real weight rather than being footnote text. A
 * completed mission drops its decorative colour for the success tone — the one
 * colour on the page that carries meaning.
 */
export function MissionsPage() {
  useDocumentTitle('Missions');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.missions.mine(),
    queryFn: () => fetchMyMissions(),
  });

  useEffect(() => {
    if (query.data && query.data.counts.unseen > 0) {
      void acknowledgeMissionProgress().then(() =>
        queryClient.invalidateQueries({ queryKey: qk.dashboard.learner() }),
      );
    }
  }, [query.data, queryClient]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Missions" description="Short challenges to finish this week." />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.items.length === 0}
        emptyState={
          <EmptyState
            icon={<IconMission aria-hidden className="h-8 w-8 text-play-3" />}
            title="No missions right now"
            description="New challenges land here when your teacher sets them up — keep learning in the meantime!"
          />
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {query.data?.items.map((row, index) => {
            const accent = playAccent(index);
            const isDone = row.status === 'COMPLETED';

            return (
              <Card
                key={row.id}
                className={cn(
                  'border-t-4',
                  isDone ? 'border-t-success bg-success-soft' : cn(accent.border, accent.surface),
                )}
              >
                <CardBody className="flex flex-col gap-3 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm',
                          isDone ? stateChip.success : accent.chip,
                        )}
                      >
                        <IconMission className="h-5 w-5" />
                      </span>
                      <p className={cn(text.heading, 'text-lg')}>{row.mission.title}</p>
                    </div>
                    <Badge tone={STATUS_TONE[row.status]} variant="solid" className="shrink-0">
                      {STATUS_LABEL[row.status]}
                    </Badge>
                  </div>
                  {row.mission.description ? (
                    <p className="text-sm leading-body text-ink">{row.mission.description}</p>
                  ) : null}
                  <ProgressBar
                    label={row.mission.goalLabel}
                    value={row.percent}
                    tone={isDone ? 'success' : 'brand'}
                  />
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <IconPoints
                      aria-hidden
                      className={cn('h-4 w-4', isDone ? 'text-success-strong' : accent.text)}
                    />
                    Worth {row.mission.pointsReward} points
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </QueryBoundary>
    </div>
  );
}
