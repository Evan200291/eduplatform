import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  IconActivity,
  IconAssignment,
  IconBadge,
  IconCompanion,
  IconLeaderboard,
  IconMission,
  IconNotifications,
  IconPoints,
  IconProgress,
  IconStart,
  IconStreak,
  text,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { useCan, useProfile } from '@/auth';
import { fetchLearnerDashboard } from '@/dashboard/dashboard.api';
import { qk } from '@/query/keys';
import { itemsPerRow, useAgeMode } from '@/theme';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { Tile } from '../components/Tile';
import { OnboardingTour, useOnboardingTour } from '../components/OnboardingTour';
import { playAccent } from '../play-accents';

/**
 * The learner's home page.
 *
 * Leads with one clear next action (blueprint §03: "the student must always
 * understand ... what they can do next"), pulled from the server-computed
 * `nextAction` rather than guessed client-side — the backend already weighs
 * screening, overdue work, and the active path to pick it. It is deliberately
 * the loudest thing on the screen: a full-width brand panel with the only
 * large button, so a child scanning the page finds it before anything else.
 *
 * Everything below it is quieter and colour-coded. The stat row and the tile
 * grid each rotate through the decorative `play` accents (see
 * `../play-accents`) so a learner recognises "the orange one" by shape and
 * colour rather than by reading five near-identical white cards. A stat that
 * carries actual state — overdue work, an urgent message — drops its
 * decorative colour and takes the semantic tone instead, so the one colour on
 * the row that *means* something is never competing with five that do not.
 * The tile grid stays permission-gated per tile, so a school with a feature
 * switched off simply has one fewer, no disabled state.
 */
export function StudentHomePage() {
  useDocumentTitle('Home');
  const profile = useProfile();
  const ageMode = useAgeMode();
  const columns = itemsPerRow(ageMode);

  const canLearn = useCan('activity.read');
  const canSeeMissions = useCan('mission.read');
  const canSeeCompanion = useCan('companion.read');
  const canSeeLeaderboard = useCan('leaderboard.read');
  const canSeeProgress = useCan('progress.read.own');

  const firstName = profile?.nickname ?? profile?.firstName ?? '';
  const tour = useOnboardingTour();

  const dashboard = useQuery({
    queryKey: qk.dashboard.learner(),
    queryFn: () => fetchLearnerDashboard(),
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className={text.eyebrow}>Your learning</p>
        <h1 className={cn(text.heading, 'text-3xl')}>
          {firstName ? `Hello, ${firstName}!` : 'Hello!'}
        </h1>
        <p className="text-lg text-ink-muted">Pick something to do.</p>
      </header>

      <QueryBoundary isLoading={dashboard.isPending} error={dashboard.error}>
        {dashboard.data ? (
          <div className="flex flex-col gap-4">
            {dashboard.data.nextAction ? (
              <Card className="border-2 border-primary-muted bg-primary-soft">
                <CardBody className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      aria-hidden
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-contrast shadow-sm"
                    >
                      <IconStart className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn(text.eyebrow, 'text-primary-strong')}>Next up</p>
                      <p className={cn(text.heading, 'mt-1 text-xl')}>
                        {dashboard.data.nextAction.label}
                      </p>
                    </div>
                  </div>
                  <ButtonLink to={dashboard.data.nextAction.path} size="lg">
                    Continue
                  </ButtonLink>
                </CardBody>
              </Card>
            ) : null}

            {dashboard.data.recentAchievement ? (
              <Card className="border-2 border-success-muted bg-success-soft">
                <CardBody className="flex flex-wrap items-center gap-3 p-4">
                  <span
                    aria-hidden
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-success-contrast"
                  >
                    <IconBadge className="h-5 w-5" />
                  </span>
                  <div>
                    <p className={cn(text.eyebrow, 'text-success-strong')}>New achievement</p>
                    <p className={cn(text.heading, 'text-lg')}>
                      {dashboard.data.recentAchievement.label}
                    </p>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatChip
                label="Day streak"
                icon={<IconStreak className="h-5 w-5" />}
                accentIndex={3}
                value={dashboard.data.streak ? dashboard.data.streak.currentLength : '—'}
                unit={dashboard.data.streak ? 'days' : undefined}
              />
              <StatChip
                label="Points"
                icon={<IconPoints className="h-5 w-5" />}
                accentIndex={1}
                value={dashboard.data.rewards ? dashboard.data.rewards.points : '—'}
              />
              <StatChip
                label="Assignments"
                icon={<IconAssignment className="h-5 w-5" />}
                accentIndex={0}
                value={dashboard.data.assignments.open}
                tone={dashboard.data.assignments.overdue > 0 ? 'danger' : 'neutral'}
                note={dashboard.data.assignments.overdue > 0 ? 'overdue' : undefined}
              />
              <StatChip
                label="Messages"
                icon={<IconNotifications className="h-5 w-5" />}
                accentIndex={5}
                value={dashboard.data.notifications.unread}
                tone={dashboard.data.notifications.highPriority > 0 ? 'warning' : 'neutral'}
                note={dashboard.data.notifications.highPriority > 0 ? 'needs a look' : undefined}
              />
            </div>
          </div>
        ) : null}
      </QueryBoundary>

      <section className="flex flex-col gap-3">
        <h2 className={cn(text.eyebrow, 'sr-only sm:not-sr-only')}>Where to go</h2>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {canLearn ? (
            <Tile
              to={paths.learn.activities}
              label="Learn"
              description="Your next activities."
              icon={IconActivity}
              accentIndex={0}
            />
          ) : null}
          {canSeeMissions ? (
            <Tile
              to={paths.learn.missions}
              label="Missions"
              description="Challenges to finish."
              icon={IconMission}
              accentIndex={1}
            />
          ) : null}
          {canSeeCompanion ? (
            <Tile
              to={paths.learn.companion}
              label="Your buddy"
              description="Ask for a hint."
              icon={IconCompanion}
              accentIndex={2}
            />
          ) : null}
          {canSeeProgress ? (
            <Tile
              to={paths.learn.progress}
              label="My progress"
              description="What you have learned."
              icon={IconProgress}
              accentIndex={4}
            />
          ) : null}
          {canSeeLeaderboard ? (
            <Tile
              to={paths.learn.leaderboard}
              label="Top scores"
              description="How your class is doing."
              icon={IconLeaderboard}
              accentIndex={5}
            />
          ) : null}
        </div>
      </section>

      <OnboardingTour isOpen={tour.isOpen} onClose={tour.close} />
    </div>
  );
}

/**
 * One number, big. A neutral chip wears a decorative accent; a chip that has
 * something to flag drops it and wears the matching semantic tone, so colour
 * only ever *means* something in the one place it needs to.
 */
function StatChip({
  label,
  value,
  unit,
  icon,
  accentIndex,
  tone = 'neutral',
  note,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: ReactNode;
  accentIndex: number;
  tone?: 'neutral' | 'warning' | 'danger';
  note?: string;
}) {
  const accent = playAccent(accentIndex);
  const stateful = tone !== 'neutral';

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border-2 p-4 shadow-sm',
        tone === 'danger'
          ? 'border-danger-muted bg-danger-soft'
          : tone === 'warning'
            ? 'border-warning-muted bg-warning-soft'
            : cn(accent.borderSoft, accent.surface),
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full',
          tone === 'danger'
            ? 'bg-danger text-danger-contrast'
            : tone === 'warning'
              ? 'bg-warning text-warning-contrast'
              : accent.chip,
        )}
      >
        {icon}
      </span>
      <p className={cn(text.heading, 'text-2xl tabular-nums')}>
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-ink-muted">{unit}</span> : null}
      </p>
      <p className="text-xs font-medium text-ink">{label}</p>
      {stateful && note ? (
        <Badge tone={tone} variant="solid" className="self-start">
          {note}
        </Badge>
      ) : null}
    </div>
  );
}
