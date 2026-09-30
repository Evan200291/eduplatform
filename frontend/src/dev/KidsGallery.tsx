import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  IconActivity,
  IconAssessment,
  IconCompanion,
  IconLeaderboard,
  IconLesson,
  IconLock,
  IconMission,
  IconCheck,
  ProgressBar,
  text,
} from '@/components/ui';
import { Buddy, Confetti, LessonPath, ReadAloudButton, type BuddyMood, type LessonPathNode } from '@/components/kids';
import { QuestionCard } from '@/surfaces/student/components/QuestionCard';
import { Tile } from '@/surfaces/student/components/Tile';
import { AGE_MODE_LABELS, DEFAULT_AGE_MODE, ThemeContext, applyAgeMode, type ThemeContextValue } from '@/theme';
import { cn } from '@/lib/cn';
import type { DeliveryQuestion } from '@/content/content.types';
import type { AgeMode } from '@/types/enums';

/**
 * A living style guide for the young-learner design. DEV ONLY (routed only when
 * `import.meta.env.DEV`), and deliberately made of real components with fixed
 * data, so it needs no API and no sign-in.
 *
 * Switch the age mode at the top to see the same components change between the
 * kid layer and the standard look. The full-page prototypes for every screen live
 * in docs/design/kids/index.html.
 */

const MODES: AgeMode[] = ['EARLY_YEARS', 'PRIMARY', 'LOWER_SECONDARY'];
const MOODS: BuddyMood[] = ['happy', 'cheer', 'think', 'sleepy', 'oops'];

const QUESTION: DeliveryQuestion = {
  id: 'q1',
  type: 'MULTIPLE_CHOICE',
  prompt: 'Which shape shows a half?',
  config: {},
  promptMediaId: null,
  difficultyBand: 'FOUNDATION',
  pointsValue: 1,
  sortOrder: 1,
  timeLimitSeconds: null,
  objectiveId: null,
  options: [
    { id: 'a', label: 'Pizza cut in 2 equal parts', sortOrder: 1, mediaId: null },
    { id: 'b', label: 'Cake cut in 4 equal parts', sortOrder: 2, mediaId: null },
    { id: 'c', label: 'A whole cookie', sortOrder: 3, mediaId: null },
  ],
  hints: [{ id: 'h1', body: 'A half means 2 equal parts.', sortOrder: 1, pointsCost: 0 }],
};

const PATH: LessonPathNode[] = [
  { id: '1', label: 'Counting to 20', state: 'done', icon: <IconCheck /> },
  { id: '2', label: 'Number bonds', state: 'done', icon: <IconCheck /> },
  { id: '3', label: 'Halves and quarters', state: 'now', icon: <IconLesson />, href: '#now' },
  { id: '4', label: 'Fractions check', state: 'open', icon: <IconAssessment />, href: '#open' },
  { id: '5', label: 'Fraction of a set', state: 'locked', icon: <IconLock />, reason: 'Finish the fractions check first.' },
  { id: '6', label: 'Play: fractions', state: 'locked', icon: <IconActivity /> },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={cn(text.heading, 'text-2xl')}>{title}</h2>
      {children}
    </section>
  );
}

export function KidsGallery() {
  const [mode, setMode] = useState<AgeMode>('EARLY_YEARS');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean } | null>(null);

  // The page attribute drives the CSS; the context drives components that branch
  // on `isYoungLearner` (QuestionCard's read-aloud and buddy). Both must agree.
  useEffect(() => {
    applyAgeMode(mode);
    return () => applyAgeMode(DEFAULT_AGE_MODE);
  }, [mode]);
  const theme = useMemo<ThemeContextValue>(() => ({ schoolSlug: null, ageMode: mode, isReady: true }), [mode]);

  return (
    <ThemeContext.Provider value={theme}>
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 bg-canvas px-gutter py-8">
      <header className="flex flex-col gap-3">
        <h1 className={cn(text.heading, 'text-3xl')}>Sunny kid design — living style guide</h1>
        <p className="text-ink-muted">
          Real components, fixed data. Currently: <b>{AGE_MODE_LABELS[mode]}</b>. The kid layer is
          on for Early years and Primary only.
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <Button key={m} size="sm" variant={m === mode ? 'primary' : 'outline'} onClick={() => setMode(m)}>
              {AGE_MODE_LABELS[m]}
            </Button>
          ))}
        </div>
      </header>

      <Section title="Pip, the buddy">
        <div className="flex flex-wrap items-end gap-4">
          {MOODS.map((m) => (
            <figure key={m} className="flex flex-col items-center gap-1">
              <Buddy mood={m} size={110} />
              <figcaption className="text-sm font-medium text-ink-muted">{m}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Buttons (press them)">
        <div className="flex flex-wrap gap-3">
          <Button size="lg">Continue</Button>
          <Button variant="secondary" size="lg">Play</Button>
          <Button variant="danger">Stop</Button>
          <Button variant="outline">Need a clue?</Button>
          <Button variant="subtle">Rename</Button>
          <Button variant="ghost">Skip</Button>
          <Button disabled>Locked</Button>
        </div>
      </Section>

      <Section title="Cards, tiles and progress">
        <div className="grid grid-cols-2 gap-4">
          <Tile to="#learn" label="Learn" description="Your next activities." icon={IconActivity} accentIndex={0} />
          <Tile to="#missions" label="Missions" description="Challenges to finish." icon={IconMission} accentIndex={1} />
          <Tile to="#buddy" label="Your buddy" description="Ask for a hint." icon={IconCompanion} accentIndex={2} />
          <Tile to="#scores" label="Top scores" description="How your class is doing." icon={IconLeaderboard} accentIndex={5} />
        </div>
        <Card>
          <CardBody className="flex flex-col gap-3 p-6">
            <div className="flex items-center justify-between">
              <p className={cn(text.heading, 'text-xl')}>3 of 8 steps done</p>
              <Badge tone="success">On track</Badge>
            </div>
            <ProgressBar label="Your path" value={38} showValue={false} />
            <ProgressBar label="Streak goal" value={72} tone="warning" />
          </CardBody>
        </Card>
      </Section>

      <Section title="Read-aloud">
        <div className="flex items-center gap-3">
          <ReadAloudButton text="Which shape shows a half?" />
          <span className="text-lg">Tap the speaker — it reads the words out loud.</span>
        </div>
      </Section>

      <Section title="The learning path">
        <LessonPath nodes={PATH} />
      </Section>

      <Section title="A question (the real QuestionCard)">
        <QuestionCard
          question={QUESTION}
          isSubmitting={false}
          feedback={feedback}
          onSubmit={(response) => setFeedback({ isCorrect: JSON.stringify(response).includes('"a"') })}
          onContinue={() => setFeedback(null)}
        />
      </Section>

      <Section title="Celebration">
        <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-lg border-2 border-line bg-surface">
          <Confetti />
          <div className="flex items-center gap-4">
            <Buddy mood="cheer" size={120} />
            <p className={cn(text.heading, 'text-2xl')}>Nice work!</p>
          </div>
        </div>
      </Section>
    </div>
    </ThemeContext.Provider>
  );
}
