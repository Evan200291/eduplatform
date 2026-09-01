import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  IconAdd,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { ApiError } from '@/api/error';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import {
  archiveBadge,
  archiveReward,
  createBadge,
  createReward,
  fetchBadges,
  fetchRewards,
} from '@/gamification/gamification.api';
import { createMission, fetchMissions } from '@/missions/missions.api';
import { fetchGrowthConfig, updateGrowthConfig } from '@/companion/companion.api';
import type { GrowthConfig } from '@/companion/companion.types';
import { fetchStreakConfig, updateStreakConfig } from '@/gamification/gamification.api';
import type { StreakConfig } from '@/gamification/gamification.types';
import {
  createLeaderboard,
  fetchLeaderboards,
  updateLeaderboard,
} from '@/leaderboard/leaderboard.api';
import {
  LEADERBOARD_SCOPES_NEEDING_ID,
  type BoardSummary,
  type LeaderboardConfigInput,
  type LeaderboardIdentityMode,
  type LeaderboardRankingMode,
  type LeaderboardScope,
} from '@/leaderboard/leaderboard.types';
import { fetchClasses, fetchGrades, fetchSubjects } from '@/academic/academic.api';

/** Points, badges, rewards, missions catalogue, and leaderboard configuration. */
export function GamificationPage() {
  useDocumentTitle('Rewards & buddy');
  const canWriteBadges = useCan('badge.write');
  const canWriteRewards = useCan('reward.write');
  const canWriteMissions = useCan('mission.write');
  const canReadLeaderboard = useCan('leaderboard.read');
  const canConfigLeaderboard = useCan('leaderboard.config');
  const canConfigCompanion = useCan('companion.config');
  const canConfigGamification = useCan('gamification.config');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rewards & buddy"
        description="How points are earned, which badges and rewards exist, and the mission catalogue."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BadgesSection canWrite={canWriteBadges} />
        <RewardsSection canWrite={canWriteRewards} />
        <MissionsSection canWrite={canWriteMissions} />
      </div>
      {canReadLeaderboard ? <LeaderboardSection canWrite={canConfigLeaderboard} /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canConfigCompanion ? <CompanionGrowthSection /> : null}
        {canConfigGamification ? <StreakConfigSection /> : null}
      </div>
    </div>
  );
}

function SectionCard({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} actions={actions} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function BadgesSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.badges.list({ page, pageSize: 10 }),
    queryFn: () => fetchBadges({ page, pageSize: 10 }),
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsThreshold, setPointsThreshold] = useState('100');

  const create = useMutation({
    mutationFn: () =>
      createBadge({
        key: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        description,
        criteria: { type: 'points', threshold: Number(pointsThreshold) },
        criteriaLabel: `Earn ${pointsThreshold} points`,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.badges.list() });
      setOpen(false);
      setName('');
      setDescription('');
    },
  });

  const archive = useMutation({
    mutationFn: (badgeId: string) => archiveBadge(badgeId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.badges.list() }),
  });

  return (
    <SectionCard
      title="Badges"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No badges yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((badge) => (
              <li key={badge.id} className="flex items-center justify-between gap-2">
                <span className="text-ink">{badge.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={badge.archivedAt ? 'neutral' : 'brand'}>
                    {badge.archivedAt ? 'Archived' : badge.tier}
                  </Badge>
                  {canWrite && !badge.archivedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={archive.isPending && archive.variables === badge.id}
                      onClick={() => archive.mutate(badge.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
      </QueryBoundary>
      {archive.error ? <ErrorState error={archive.error} /> : null}
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a badge">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            {create.error ? <ErrorState error={create.error} /> : null}
            <Field label="Name" isRequired>
              <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Description" isRequired>
              <Textarea
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Points needed to earn it" isRequired hint="Simple points-threshold criteria.">
              <Input
                type="number"
                min={1}
                required
                value={pointsThreshold}
                onChange={(event) => setPointsThreshold(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={create.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </SectionCard>
  );
}

function RewardsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.rewards.list({ page, pageSize: 10 }),
    queryFn: () => fetchRewards({ page, pageSize: 10 }),
  });

  const [name, setName] = useState('');
  const [kind, setKind] = useState('COSMETIC_ITEM');
  const [pointsCost, setPointsCost] = useState('50');

  const create = useMutation({
    mutationFn: () =>
      createReward({
        key: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        kind,
        pointsCost: Number(pointsCost),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.rewards.list() });
      setOpen(false);
      setName('');
    },
  });

  const archive = useMutation({
    mutationFn: (rewardId: string) => archiveReward(rewardId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.rewards.list() }),
  });

  return (
    <SectionCard
      title="Rewards"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No rewards yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((reward) => (
              <li key={reward.id} className="flex items-center justify-between gap-2">
                <span className="text-ink">{reward.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">
                    {reward.isActive ? `${reward.pointsCost} pts` : 'Archived'}
                  </span>
                  {canWrite && reward.isActive ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={archive.isPending && archive.variables === reward.id}
                      onClick={() => archive.mutate(reward.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
      </QueryBoundary>
      {archive.error ? <ErrorState error={archive.error} /> : null}
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a reward">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            {create.error ? <ErrorState error={create.error} /> : null}
            <Field label="Name" isRequired>
              <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Kind" isRequired>
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                options={[
                  { value: 'COSMETIC_ITEM', label: 'Cosmetic item' },
                  { value: 'COMPANION_ACCESSORY', label: 'Companion accessory' },
                  { value: 'AVATAR_ITEM', label: 'Avatar item' },
                  { value: 'THEME_UNLOCK', label: 'Theme unlock' },
                  { value: 'CERTIFICATE', label: 'Certificate' },
                  { value: 'TEACHER_RECOGNITION', label: 'Teacher recognition' },
                ]}
              />
            </Field>
            <Field label="Points cost" isRequired>
              <Input
                type="number"
                min={0}
                required
                value={pointsCost}
                onChange={(event) => setPointsCost(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={create.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </SectionCard>
  );
}

function MissionsSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.missions.list({ page, pageSize: 10 }),
    queryFn: () => fetchMissions({ page, pageSize: 10 }),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalType, setGoalType] = useState('ACTIVITIES_COMPLETED');
  const [goalTarget, setGoalTarget] = useState('5');
  const [pointsReward, setPointsReward] = useState('20');

  const create = useMutation({
    mutationFn: () =>
      createMission({
        key: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title,
        description,
        goalType,
        goalTarget: Number(goalTarget),
        pointsReward: Number(pointsReward),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.missions.list() });
      setOpen(false);
      setTitle('');
      setDescription('');
    },
  });

  return (
    <SectionCard
      title="Missions"
      actions={
        canWrite ? (
          <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data && query.data.items.length === 0 ? (
          <EmptyState title="No missions yet" />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {query.data?.items.map((mission) => (
              <li key={mission.id} className="flex items-center justify-between">
                <span className="text-ink">{mission.title}</span>
                <Badge tone={mission.isActive ? 'success' : 'neutral'}>
                  {mission.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
      </QueryBoundary>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a mission">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            {create.error ? <ErrorState error={create.error} /> : null}
            <Field label="Title" isRequired>
              <Input required value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Description" isRequired>
              <Textarea
                required
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Goal type" isRequired>
              <Select
                value={goalType}
                onChange={(event) => setGoalType(event.target.value)}
                options={[
                  { value: 'ACTIVITIES_COMPLETED', label: 'Activities completed' },
                  { value: 'MINUTES_LEARNED', label: 'Minutes learned' },
                  { value: 'TOPICS_MASTERED', label: 'Topics mastered' },
                  { value: 'ASSIGNMENTS_ON_TIME', label: 'Assignments on time' },
                  { value: 'ACCURACY_PERCENT', label: 'Accuracy percent' },
                  { value: 'STREAK_DAYS', label: 'Streak days' },
                ]}
              />
            </Field>
            <Field label="Goal target" isRequired>
              <Input
                type="number"
                min={1}
                required
                value={goalTarget}
                onChange={(event) => setGoalTarget(event.target.value)}
              />
            </Field>
            <Field label="Points reward">
              <Input
                type="number"
                min={0}
                value={pointsReward}
                onChange={(event) => setPointsReward(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={create.isPending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </SectionCard>
  );
}

const IDENTITY_MODE_OPTIONS: { value: LeaderboardIdentityMode; label: string }[] = [
  { value: 'NICKNAME', label: 'Nickname' },
  { value: 'REAL_NAME', label: 'Real name' },
  { value: 'AVATAR_ONLY', label: 'Avatar only' },
  { value: 'ANONYMOUS_RANK', label: 'Anonymous rank' },
];

const RANKING_MODE_OPTIONS: { value: LeaderboardRankingMode; label: string }[] = [
  { value: 'PERSONAL_BEST', label: 'Personal best' },
  { value: 'POINTS', label: 'Points' },
  { value: 'MASTERY_GAIN', label: 'Mastery gain' },
  { value: 'ACTIVITY_COUNT', label: 'Activity count' },
  { value: 'COOPERATIVE_TEAM', label: 'Cooperative team' },
];

const SCOPE_OPTIONS: { value: LeaderboardScope; label: string }[] = [
  { value: 'CLASS', label: 'Class' },
  { value: 'GRADE', label: 'Grade' },
  { value: 'SUBJECT', label: 'Subject' },
  { value: 'COHORT', label: 'Cohort' },
  { value: 'SCHOOL', label: 'Whole school' },
  { value: 'EVENT', label: 'Event' },
];

/**
 * Configuration behind the "Leaderboard enabled" switch in Settings: which
 * boards exist, their identity/ranking mode, scope, and publish state.
 * Requires `leaderboard.config` to create or edit; `leaderboard.read` to view.
 */
function LeaderboardSection({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [isOpen, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.leaderboard.config({ page, pageSize: 10, includeArchived: false }),
    queryFn: () => fetchLeaderboards({ page, pageSize: 10, includeArchived: false }),
  });

  const gradesQuery = useQuery({ queryKey: ['leaderboard-config', 'grades'], queryFn: fetchGrades, enabled: isOpen });
  const subjectsQuery = useQuery({
    queryKey: ['leaderboard-config', 'subjects'],
    queryFn: fetchSubjects,
    enabled: isOpen,
  });
  const classesQuery = useQuery({
    queryKey: ['leaderboard-config', 'classes'],
    queryFn: () => fetchClasses(),
    enabled: isOpen,
  });

  const [name, setName] = useState('');
  const [scope, setScope] = useState<LeaderboardScope>('CLASS');
  const [scopeId, setScopeId] = useState('');
  const [identityMode, setIdentityMode] = useState<LeaderboardIdentityMode>('NICKNAME');
  const [rankingMode, setRankingMode] = useState<LeaderboardRankingMode>('PERSONAL_BEST');
  const [periodDays, setPeriodDays] = useState('7');

  const needsScopeId = LEADERBOARD_SCOPES_NEEDING_ID.includes(scope);
  const scopeTargets = useMemo(() => {
    if (scope === 'CLASS') return classesQuery.data?.items.map((c) => ({ id: c.id, name: c.name })) ?? [];
    if (scope === 'GRADE') return gradesQuery.data?.items.map((g) => ({ id: g.id, name: g.name })) ?? [];
    if (scope === 'SUBJECT') return subjectsQuery.data?.items.map((s) => ({ id: s.id, name: s.name })) ?? [];
    return [];
  }, [scope, classesQuery.data, gradesQuery.data, subjectsQuery.data]);

  const resetForm = () => {
    setName('');
    setScope('CLASS');
    setScopeId('');
    setIdentityMode('NICKNAME');
    setRankingMode('PERSONAL_BEST');
    setPeriodDays('7');
  };

  const create = useMutation({
    mutationFn: () => {
      const input: LeaderboardConfigInput = {
        name,
        scope,
        identityMode,
        rankingMode,
        periodDays: periodDays.trim() ? Number(periodDays) : null,
      };
      if (needsScopeId) input.scopeId = scopeId;
      return createLeaderboard(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      setOpen(false);
      resetForm();
    },
  });

  const toggleActive = useMutation({
    mutationFn: (board: BoardSummary) => updateLeaderboard(board.id, { isActive: !board.isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
  });

  const toggleActiveErrorMessage = !toggleActive.error
    ? null
    : toggleActive.error instanceof ApiError && toggleActive.error.code === 'FEATURE_DISABLED'
      ? 'Leaderboards are switched off for this school — turn on "Leaderboard enabled" in Settings before publishing a board.'
      : 'Could not update that board.';

  return (
    <Card>
      <CardHeader
        title="Leaderboard configuration"
        actions={
          canWrite ? (
            <Button size="sm" leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setOpen(true)}>
              Add board
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <p className="mb-3 text-sm text-ink-muted">
          Boards sit behind the school's "Leaderboard enabled" switch in Settings. Each board has
          its own identity display, ranking basis, and scope; a new board always starts switched off.
        </p>
        {toggleActiveErrorMessage ? (
          <ErrorState error={new Error(toggleActiveErrorMessage)} className="mb-3" />
        ) : null}
        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          {query.data && query.data.items.length === 0 ? (
            <EmptyState title="No leaderboards configured" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {query.data?.items.map((board) => (
                <li
                  key={board.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-ink">{board.name}</span>
                    <span className="text-xs text-ink-muted">
                      {SCOPE_OPTIONS.find((o) => o.value === board.scope)?.label ?? board.scope} ·{' '}
                      {IDENTITY_MODE_OPTIONS.find((o) => o.value === board.identityMode)?.label ??
                        board.identityMode}{' '}
                      ·{' '}
                      {RANKING_MODE_OPTIONS.find((o) => o.value === board.rankingMode)?.label ??
                        board.rankingMode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={board.isActive ? 'success' : 'neutral'}>
                      {board.isActive ? 'Published' : 'Off'}
                    </Badge>
                    {canWrite ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={toggleActive.isPending}
                        onClick={() => toggleActive.mutate(board)}
                      >
                        {board.isActive ? 'Turn off' : 'Publish'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} className="px-0" /> : null}
        </QueryBoundary>
      </CardBody>
      {isOpen ? (
        <Modal isOpen onClose={() => setOpen(false)} title="Add a leaderboard">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            {create.error ? <ErrorState error={create.error} /> : null}
            <Field label="Name" isRequired>
              <Input required value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Scope" isRequired>
              <Select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as LeaderboardScope);
                  setScopeId('');
                }}
                options={SCOPE_OPTIONS}
              />
            </Field>
            {needsScopeId ? (
              <Field
                label={`${SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope} covered`}
                isRequired
                hint="The specific class, grade or subject this board ranks."
              >
                <Select
                  required
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  options={[
                    { value: '', label: 'Select one...' },
                    ...scopeTargets.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </Field>
            ) : null}
            <Field label="Identity display" isRequired hint="How a student appears to peers on this board.">
              <Select
                value={identityMode}
                onChange={(event) => setIdentityMode(event.target.value as LeaderboardIdentityMode)}
                options={IDENTITY_MODE_OPTIONS}
              />
            </Field>
            <Field label="Ranking basis" isRequired>
              <Select
                value={rankingMode}
                onChange={(event) => setRankingMode(event.target.value as LeaderboardRankingMode)}
                options={RANKING_MODE_OPTIONS}
              />
            </Field>
            <Field label="Rolling window, in days" hint="Leave blank for all-time.">
              <Input
                type="number"
                min={1}
                max={365}
                value={periodDays}
                onChange={(event) => setPeriodDays(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={create.isPending} disabled={needsScopeId && !scopeId}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </Card>
  );
}

const STAGE_LABELS: Record<string, string> = {
  EGG: 'Egg',
  HATCHLING: 'Hatchling',
  JUVENILE: 'Juvenile',
  ADOLESCENT: 'Adolescent',
  ADULT: 'Adult',
  RADIANT: 'Radiant',
};

/**
 * The growth-point threshold for each companion stage. Existing companions are
 * unaffected by a change here — stages only ever move forward — this only
 * changes what the *next* growth update measures against. `companion.config`.
 */
function CompanionGrowthSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.companion.growthConfig, queryFn: fetchGrowthConfig });
  const [thresholds, setThresholds] = useState<GrowthConfig['thresholds'] | null>(null);

  const active = thresholds ?? query.data?.thresholds ?? [];

  const save = useMutation({
    mutationFn: (next: GrowthConfig['thresholds']) => updateGrowthConfig(next),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.companion.growthConfig, updated);
      setThresholds(null);
    },
  });

  return (
    <SectionCard title="Companion growth stages">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        <p className="mb-3 text-sm text-ink-muted">
          Growth points needed to reach each stage. Stages only move forward for a companion already
          past a threshold — lowering one only speeds up learners who have not reached it yet.
        </p>
        {query.data?.isCustom ? (
          <Badge tone="brand" className="mb-3">
            Custom
          </Badge>
        ) : (
          <Badge tone="neutral" className="mb-3">
            Default
          </Badge>
        )}
        {save.error ? <ErrorState error={save.error} className="mb-3" /> : null}
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(active);
          }}
        >
          {active.map((step, index) => (
            <Field key={step.stage} label={STAGE_LABELS[step.stage] ?? step.stage}>
              <Input
                type="number"
                min={0}
                disabled={index === 0}
                value={step.growthPoints}
                onChange={(event) => {
                  const next = active.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, growthPoints: Number(event.target.value) } : entry,
                  );
                  setThresholds(next);
                }}
              />
            </Field>
          ))}
          <div className="flex justify-end">
            <Button type="submit" size="sm" isLoading={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      </QueryBoundary>
    </SectionCard>
  );
}

/**
 * Grace-period freezes, whether weekends count toward a daily streak, and the
 * freeze cap. Changing these does not touch any streak already in progress — it
 * only changes what a *new or broken* streak starts with, and what a future
 * freeze grant is capped at. `gamification.config`.
 */
function StreakConfigSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.streaks.config, queryFn: fetchStreakConfig });
  const [form, setForm] = useState<StreakConfig | null>(null);

  const active = form ?? query.data ?? null;

  const save = useMutation({
    mutationFn: (input: StreakConfig) => updateStreakConfig(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.streaks.config, updated);
      setForm(null);
    },
  });

  return (
    <SectionCard title="Streak behavior">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {active ? (
          <>
            <p className="mb-3 text-sm text-ink-muted">
              How much grace a missed day gets, and whether weekends count toward a daily streak.
            </p>
            {save.error ? <ErrorState error={save.error} className="mb-3" /> : null}
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(active);
              }}
            >
              <Field label="Freezes granted to a new or reset streak" hint="Restored to this amount when a run breaks.">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={active.defaultFreezes}
                  onChange={(event) => setForm({ ...active, defaultFreezes: Number(event.target.value) })}
                />
              </Field>
              <Checkbox
                label="Saturday and Sunday count toward a daily streak"
                checked={active.weekendsCount}
                onChange={(event) => setForm({ ...active, weekendsCount: event.target.checked })}
              />
              <Field label="Maximum accumulated freezes" hint="Leave blank for no cap.">
                <Input
                  type="number"
                  min={0}
                  max={90}
                  placeholder="Unlimited"
                  value={active.maxFreezes ?? ''}
                  onChange={(event) =>
                    setForm({
                      ...active,
                      maxFreezes: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" size="sm" isLoading={save.isPending}>
                  Save
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </QueryBoundary>
    </SectionCard>
  );
}
