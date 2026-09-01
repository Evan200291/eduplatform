import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  IconCompanion,
  IconPoints,
  Input,
  PageHeader,
  ProgressBar,
  Select,
  text,
} from '@/components/ui';
import { QueryBoundary, ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { adoptCompanion, fetchMyCompanion, fetchSpecies, interactWithCompanion } from '@/companion/companion.api';
import type { SpeciesKey } from '@/companion/companion.types';
import { equipReward, fetchRewards, redeemReward } from '@/gamification/gamification.api';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { playAccent } from '../play-accents';

const SPECIES_LABEL: Record<SpeciesKey, string> = {
  'ember-fox': 'Ember Fox',
  'river-otter': 'River Otter',
  'meadow-hare': 'Meadow Hare',
  'star-owl': 'Star Owl',
  'cloud-turtle': 'Cloud Turtle',
  'pebble-badger': 'Pebble Badger',
};

/**
 * The learner's companion — a nurturing motivator, never a punishment
 * mechanic (blueprint §03: no default death, decay or anxiety-inducing loss).
 * Growth only ever moves forward, which is why there's no reset control here.
 *
 * The companion gets the warmest treatment on the surface: a full tinted panel
 * with the buddy at the centre and the growth bar directly under it, because
 * "look how much they've grown" is the entire emotional point of the feature.
 * The three interactions sit together as equal-weight buttons — none of them is
 * a wrong choice.
 */
export function CompanionPage() {
  useDocumentTitle('Your buddy');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.companion.mine(), queryFn: () => fetchMyCompanion() });

  const interact = useMutation({
    mutationFn: (kind: 'GREET' | 'PLAY' | 'PRAISE') => interactWithCompanion(kind),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.companion.mine() }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your buddy" description="They grow as you learn." />

      <QueryBoundary isLoading={query.isPending} error={query.error}>
        {query.data && !query.data.companion ? (
          <AdoptCard />
        ) : query.data?.companion ? (
          <Card className="border-2 border-play-2-soft bg-play-2-soft">
            <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-24 w-24 items-center justify-center rounded-full shadow-md',
                  playAccent(1).chip,
                )}
              >
                <IconCompanion className="h-12 w-12" />
              </span>
              <div>
                <p className={cn(text.heading, 'text-2xl')}>{query.data.companion.name}</p>
                <p className="text-sm font-medium text-ink">
                  {SPECIES_LABEL[query.data.companion.speciesKey]} · {query.data.companion.stageLabel}
                </p>
              </div>
              <Badge tone="info" variant="solid">
                {query.data.companion.mood}
              </Badge>
              <ProgressBar
                label="Growing"
                value={query.data.companion.stagePercent}
                className="w-full max-w-xs"
                tone="success"
              />
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" isLoading={interact.isPending} onClick={() => interact.mutate('GREET')}>
                  Say hello
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  isLoading={interact.isPending}
                  onClick={() => interact.mutate('PLAY')}
                >
                  Play
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  isLoading={interact.isPending}
                  onClick={() => interact.mutate('PRAISE')}
                >
                  Cheer them on
                </Button>
              </div>
              {interact.error ? <ErrorState error={interact.error} /> : null}
            </CardBody>
          </Card>
        ) : null}
      </QueryBoundary>

      <RewardsShop />
    </div>
  );
}

/**
 * The reward shop: cosmetic items and companion accessories a learner can
 * unlock with points and equip. Nothing here gates learning content
 * (blueprint §03) — nothing is required to keep playing.
 */
function RewardsShop() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.rewards.list({ page: 1, pageSize: 50, withMine: true }),
    queryFn: () => fetchRewards({ page: 1, pageSize: 50, withMine: true }),
  });

  const redeem = useMutation({
    mutationFn: (rewardId: string) => redeemReward(rewardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.rewards.list() });
      void queryClient.invalidateQueries({ queryKey: qk.companion.mine() });
    },
  });

  const equip = useMutation({
    mutationFn: ({ rewardId, equipValue }: { rewardId: string; equipValue: boolean }) =>
      equipReward(rewardId, { equip: equipValue }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.rewards.list() }),
  });

  return (
    <Card>
      <CardHeader title="Reward shop" description="Spend your points on something fun." />
      <CardBody>
        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          {(redeem.error || equip.error) ? <ErrorState error={redeem.error ?? equip.error} /> : null}
          {query.data && query.data.items.length === 0 ? (
            <EmptyState
              icon={<IconPoints aria-hidden className="h-8 w-8 text-play-4" />}
              title="The shop is being stocked"
              description="Keep collecting points — there will be things to spend them on soon."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {query.data?.items.map((reward, index) => {
                const owned = reward.mine?.owned ?? false;
                const equipped = reward.mine?.isEquipped ?? false;
                const affordable = reward.mine?.affordable ?? false;
                const accent = playAccent(index);
                return (
                  <li
                    key={reward.id}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border-2 p-3',
                      accent.borderSoft,
                      accent.surface,
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          accent.chip,
                        )}
                      >
                        <IconPoints className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{reward.name}</p>
                        <p className="text-xs font-medium text-ink">{reward.pointsCost} pts</p>
                      </div>
                    </div>
                    {owned ? (
                      <Button
                        size="sm"
                        variant={equipped ? 'outline' : 'primary'}
                        isLoading={equip.isPending}
                        onClick={() => equip.mutate({ rewardId: reward.id, equipValue: !equipped })}
                      >
                        {equipped ? 'Unequip' : 'Wear it'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!affordable}
                        isLoading={redeem.isPending}
                        onClick={() => redeem.mutate(reward.id)}
                      >
                        Unlock
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

function AdoptCard() {
  const queryClient = useQueryClient();
  const [species, setSpecies] = useState<SpeciesKey | ''>('');
  const [name, setName] = useState('');

  const speciesQuery = useQuery({ queryKey: qk.companion.species, queryFn: fetchSpecies });

  const adopt = useMutation({
    mutationFn: () => adoptCompanion({ speciesKey: species as SpeciesKey, name: name.trim() }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.companion.mine() }),
  });

  return (
    <Card className="border-2 border-play-2-soft bg-play-2-soft">
      <CardBody className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className={cn(
              'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-sm',
              playAccent(1).chip,
            )}
          >
            <IconCompanion className="h-7 w-7" />
          </span>
          <div>
            <p className={cn(text.heading, 'text-xl')}>Pick a friend to learn alongside you</p>
            <p className="text-sm text-ink">They grow every time you finish something.</p>
          </div>
        </div>
        <QueryBoundary isLoading={speciesQuery.isPending} error={speciesQuery.error}>
          <Field label="Choose a species" isRequired>
            <Select
              value={species}
              onChange={(event) => setSpecies(event.target.value as SpeciesKey)}
              placeholder="Pick one"
              options={(speciesQuery.data?.species ?? []).map((key) => ({
                value: key,
                label: SPECIES_LABEL[key] ?? key,
              }))}
            />
          </Field>
        </QueryBoundary>
        <Field label="Give them a name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
        </Field>
        {adopt.error ? <ErrorState error={adopt.error} /> : null}
        <Button
          size="lg"
          disabled={!species || name.trim().length < 2}
          isLoading={adopt.isPending}
          onClick={() => adopt.mutate()}
          className="self-start"
        >
          Adopt
        </Button>
      </CardBody>
    </Card>
  );
}
