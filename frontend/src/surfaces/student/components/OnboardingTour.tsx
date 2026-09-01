import { useEffect, useState } from 'react';
import { Button, IconActivity, IconCompanion, IconMission, IconProgress, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useProfile } from '@/auth';
import { playAccent } from '../play-accents';

/**
 * There's no backend field for "has this student seen the tour" — adding one
 * would mean a schema migration, and this session owns the frontend only (a
 * parallel session owns `backend/`; see the repo's split). Tracking it in
 * `localStorage` instead is a deliberate trade: it's per-device rather than
 * per-account, but it's genuinely additive (nothing to migrate, nothing for
 * the other session to collide with) and it still satisfies the actual
 * requirement — skippable, replayable, never blocking a return visit.
 */
function storageKeyFor(studentId: string | undefined): string | null {
  return studentId ? `midas.student.onboarding-seen.${studentId}` : null;
}

export function useOnboardingTour() {
  const profile = useProfile();
  const storageKey = storageKeyFor(profile?.id);
  const [isOpen, setIsOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!storageKey || hasChecked) return;
    let alreadySeen = true;
    try {
      alreadySeen = window.localStorage.getItem(storageKey) === '1';
    } catch {
      // Storage can be unavailable (private browsing, locked-down profile).
      // Default to "seen" so a tour never gets stuck open because of it.
      alreadySeen = true;
    }
    setHasChecked(true);
    if (!alreadySeen) setIsOpen(true);
  }, [storageKey, hasChecked]);

  function close() {
    setIsOpen(false);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Nothing to do if storage isn't available — the tour just reappears
      // next visit, which is a safe failure mode.
    }
  }

  function replay() {
    setIsOpen(true);
  }

  return { isOpen, close, replay };
}

interface Step {
  title: string;
  body: string;
  icon: typeof IconActivity;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Midas!',
    body: "This is your learning space. Let's take a quick look around — it only takes a minute, and you can always come back to this tour from your profile.",
    icon: IconActivity,
  },
  {
    title: 'Learn',
    body: 'The Learn tab is where your lessons and activities live. Work through them in order — your teacher sets up what comes next.',
    icon: IconActivity,
  },
  {
    title: 'Missions',
    body: 'Missions are fun challenges you can complete for extra points and badges. Check in on them whenever you like.',
    icon: IconMission,
  },
  {
    title: 'Your buddy',
    body: 'You have a companion who grows alongside you as you learn. Say hello, play, and cheer them on from the Your buddy page.',
    icon: IconCompanion,
  },
  {
    title: 'My progress',
    body: "Your progress page shows what you've learned and how you're doing, in plain language — no confusing numbers.",
    icon: IconProgress,
  },
];

export interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A short, skippable, replayable first-run walkthrough. See `useOnboardingTour` for how it's tracked. */
export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const Icon = step.icon;
  // Each step wears a different decorative colour, so a child can see they are
  // moving through the tour even before reading the dots.
  const accent = playAccent(stepIndex);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Skip
          </Button>
          {stepIndex > 0 ? (
            <Button variant="outline" onClick={() => setStepIndex((i) => i - 1)}>
              Back
            </Button>
          ) : null}
          <Button onClick={() => (isLast ? onClose() : setStepIndex((i) => i + 1))}>
            {isLast ? "Let's go" : 'Next'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span
          aria-hidden
          className={cn(
            'inline-flex h-20 w-20 items-center justify-center rounded-full shadow-md',
            accent.chip,
          )}
        >
          <Icon className="h-10 w-10" />
        </span>
        <p className="text-lg leading-body text-ink">{step.body}</p>
        <div className="flex gap-2" role="presentation">
          {STEPS.map((s, index) => (
            <span
              key={s.title}
              className={cn(
                'h-2 w-2 rounded-full transition-colors duration-fast ease-standard',
                index === stepIndex ? 'bg-primary' : 'bg-line-strong',
              )}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
