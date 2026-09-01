import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconBadge,
  IconCompanion,
  IconLearningPath,
  IconPoints,
  Field,
  Input,
  Modal,
  PageHeader,
  text,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { updateOwnProfile } from '@/users/users.api';
import { authActions } from '@/auth';
import { cn } from '@/lib/cn';
import { useProfile } from '@/auth';
import { fetchEnrolledClasses } from '@/academic/academic.api';
import { fetchMyCompanion } from '@/companion/companion.api';
import { fetchGamificationProfile } from '@/gamification/gamification.api';
import { fetchActivePath } from '@/learning/learning.api';
import type { PathMode } from '@/learning/learning.types';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { OnboardingTour, useOnboardingTour } from '../components/OnboardingTour';
import { playAccent } from '../play-accents';

const PATH_MODE_LABEL: Record<PathMode, string> = {
  GRADE_BASED: 'following your grade level',
  SUBJECT_BASED: 'focused on this subject',
  TOPIC_BASED: 'focused on a topic',
  HYBRID: 'a mix picked for you',
};

/**
 * A simple view of the learner's identity, badges, companion and current path —
 * no raw analytics.
 *
 * Opens on a tinted identity banner, then the two things a child comes here to
 * look at: their points total, sized like the reward it is, and their badge
 * shelf, where each badge takes its own colour from the decorative rotation so
 * a row of them looks like a collection rather than a tag list.
 */
export function StudentProfilePage() {
  useDocumentTitle('My profile');
  const profile = useProfile();
  const tour = useOnboardingTour();

  const gamificationQuery = useQuery({
    queryKey: qk.gamification.profile(),
    queryFn: () => fetchGamificationProfile(),
  });

  const companionQuery = useQuery({
    queryKey: qk.companion.mine(),
    queryFn: () => fetchMyCompanion(),
  });

  const classesQuery = useQuery({
    queryKey: qk.classes.mine,
    queryFn: fetchEnrolledClasses,
  });

  const subjects = (classesQuery.data ?? []).flatMap((cls) => cls.classSubjects.map((cs) => cs.subject));
  const uniqueSubjects = [...new Map(subjects.map((s) => [s.id, s])).values()];
  const firstSubjectId = uniqueSubjects[0]?.id ?? null;

  const activePathQuery = useQuery({
    queryKey: qk.activePath(firstSubjectId ?? 'none'),
    queryFn: () => fetchActivePath(firstSubjectId as string),
    enabled: Boolean(firstSubjectId),
  });

  const [editingName, setEditingName] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My profile"
        actions={
          <button
            type="button"
            onClick={tour.replay}
            className="text-sm font-medium text-primary-strong underline-offset-2 hover:underline"
          >
            Replay the welcome tour
          </button>
        }
      />

      <Card className="border-2 border-play-2-soft bg-play-2-soft">
        <CardBody className="flex flex-wrap items-center gap-4 p-6">
          <Avatar
            name={profile?.displayName ?? '?'}
            src={profile?.avatarUrl}
            size="lg"
            // A pale avatar on a pale banner disappears; the solid fill makes
            // the learner's own initials the anchor of their own page.
            className={cn('shadow-sm', playAccent(1).chip)}
          />
          <div className="min-w-0">
            <p className={cn(text.heading, 'text-2xl')}>{profile?.nickname ?? profile?.displayName}</p>
            <p className="text-sm font-medium text-ink">{profile?.school?.name}</p>
          </div>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => setEditingName(true)}>
              Change my name
            </Button>
          </div>
        </CardBody>
      </Card>

      {editingName ? <NicknameModal onClose={() => setEditingName(false)} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2 border-play-4-soft bg-play-4-soft">
          <CardBody className="flex items-center gap-4 p-6">
            <span
              aria-hidden
              className={cn(
                'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm',
                playAccent(3).chip,
              )}
            >
              <IconPoints className="h-6 w-6" />
            </span>
            <div>
              <p className={cn(text.heading, 'text-3xl tabular-nums')}>
                {gamificationQuery.data?.points.balance ?? '—'}
              </p>
              <p className="text-sm font-medium text-ink">total points earned</p>
            </div>
          </CardBody>
        </Card>

        <Card className="border-2 border-play-6-soft bg-play-6-soft">
          <CardBody className="flex flex-wrap items-center justify-between gap-4 p-6">
            <QueryBoundary isLoading={companionQuery.isPending} error={companionQuery.error}>
              {companionQuery.data?.companion ? (
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm',
                      playAccent(5).chip,
                    )}
                  >
                    <IconCompanion className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className={cn(text.eyebrow, 'text-play-6')}>Your buddy</p>
                    <p className={cn(text.heading, 'truncate text-lg')}>
                      {companionQuery.data.companion.name}
                    </p>
                    <p className="text-sm text-ink">{companionQuery.data.companion.stageLabel}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-ink">
                  You haven&apos;t adopted a buddy yet — pick one to learn alongside you.
                </p>
              )}
            </QueryBoundary>
            <ButtonLink to={paths.learn.companion} variant="outline" size="sm">
              Visit
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      {activePathQuery.data?.subject ? (
        <Card className="border-l-4 border-l-play-1 bg-play-1-soft">
          <CardBody className="flex items-start gap-4 p-6">
            <span
              aria-hidden
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm',
                playAccent(0).chip,
              )}
            >
              <IconLearningPath className="h-5 w-5" />
            </span>
            <div>
              <p className={cn(text.eyebrow, 'text-play-1')}>Where you&apos;re headed</p>
              <p className="mt-1 leading-body text-ink">
                In <span className="font-medium">{activePathQuery.data.subject.name}</span>, you&apos;re on a path{' '}
                {PATH_MODE_LABEL[activePathQuery.data.mode] ?? 'set up for you'}.{' '}
                <span className="font-medium">
                  {activePathQuery.data.summary?.stepsCompleted ?? 0} of{' '}
                  {activePathQuery.data.summary?.stepsTotal ?? 0}
                </span>{' '}
                steps done so far.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Badges" description="Everything you have earned so far." />
        <CardBody>
          <QueryBoundary
            isLoading={gamificationQuery.isPending}
            error={gamificationQuery.error}
            isEmpty={gamificationQuery.data?.badges.earned.length === 0}
            emptyState={
              <EmptyState
                icon={<IconBadge aria-hidden className="h-8 w-8 text-play-2" />}
                title="Your badge shelf is empty — for now"
                description="Finish an activity or a mission and your first badge lands right here."
              />
            }
          >
            <ul className="flex flex-wrap gap-3">
              {gamificationQuery.data?.badges.earned.map((award, index) => {
                const accent = playAccent(index);
                return (
                  <li
                    key={award.id}
                    className={cn(
                      'flex items-center gap-2 rounded-full border-2 py-2 pl-2 pr-4',
                      accent.borderSoft,
                      accent.surface,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-full',
                        accent.chip,
                      )}
                    >
                      <IconBadge className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-ink">{award.badge.name}</span>
                  </li>
                );
              })}
            </ul>
          </QueryBoundary>
        </CardBody>
      </Card>

      <OnboardingTour isOpen={tour.isOpen} onClose={tour.close} />
    </div>
  );
}

/**
 * The one thing a learner may change about their own account.
 *
 * The nickname is what appears on leaderboards, so it goes through the server's
 * language check (`PATCH /users/me`) rather than being trusted here — a client
 * can always be bypassed. The rejection comes back as a normal validation
 * error, which is why the message is shown rather than swallowed.
 */
function NicknameModal({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');

  const save = useMutation({
    mutationFn: () => updateOwnProfile({ nickname: nickname.trim() }),
    onSuccess: async () => {
      // The signed-in profile is what the banner and the top bar render from,
      // so it has to be re-read before the new name shows anywhere.
      await authActions.reloadProfile();
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="Change my name">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {save.error ? <ErrorState error={save.error} /> : null}
        <Field
          label="What should we call you?"
          hint="This is the name other people see on leaderboards."
          isRequired
        >
          <Input
            autoFocus
            required
            maxLength={60}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
