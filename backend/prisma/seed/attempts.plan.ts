// ─────────────────────────────────────────────────────────────────────────────
// Seed — attempt plan (pure, no database)
// Blueprint 03 (screening, unit checks, topic checks) and blueprint 12 (evidence).
//
// Why this is its own file. Which attempts a demo student owns, what state each
// one is in, and how well the student did is judgement, not persistence — and it
// is the part most likely to be retuned once someone looks at the dashboards.
// Keeping the decisions away from the Prisma writes means the shape of the demo
// history can be changed, and checked, without a database or an `.env`.
//
// Everything here is deterministic: the same student and the same slot always
// yield the same plan, so re-running the seed rewrites the same rows rather than
// inventing new ones. `attempts.marking.ts` then decides what each answer is
// worth, so the seeded scores are the ones the real marker would produce.
// ─────────────────────────────────────────────────────────────────────────────

import { AttemptStatus, DifficultyBand } from '@prisma/client';

import { chance, hashInt } from './helpers';
import type { DemoStudent } from './people.seed';

/** Ordered easiest → hardest, mirroring `BAND_LADDER` in `assessment.helpers.ts`. */
export const BAND_LADDER: readonly DifficultyBand[] = [
  DifficultyBand.FOUNDATION,
  DifficultyBand.DEVELOPING,
  DifficultyBand.SECURE,
  DifficultyBand.CHALLENGE,
  DifficultyBand.EXTENSION,
];

/** Whichever band sits higher on the ladder. A null left-hand side ranks lowest. */
export function higherBand(left: DifficultyBand | null, right: DifficultyBand): DifficultyBand {
  if (!left) return right;
  return BAND_LADDER.indexOf(left) >= BAND_LADDER.indexOf(right) ? left : right;
}

/**
 * Accuracy window per cohort, as a percentage of items answered correctly.
 * `DemoStudent.band` is assigned in `people.seed.ts`; the three windows overlap
 * deliberately so a class list does not look sorted into tidy blocks.
 */
const ACCURACY: Record<DemoStudent['band'], readonly [number, number]> = {
  thriving: [82, 100],
  steady: [62, 84],
  'needs-support': [28, 58],
};

/** Which seeded assessment a slot refers to. Resolved in `attempts.seed.ts`. */
export type AttemptSlotTarget =
  | { kind: 'screening'; programKey: string }
  | { kind: 'topic-check'; topicId: string }
  | { kind: 'unit-check'; unitKey: string }
  | { kind: 'reassessment'; programKey: string }
  | { kind: 'teacher-test'; programKey: string };

/** One attempt to write, before it is matched to real assessment and question rows. */
export interface AttemptSlot {
  target: AttemptSlotTarget;
  /** Part of the `(assessmentId, studentId, attemptNumber)` unique key. */
  attemptNumber: number;
  status: AttemptStatus;
  isPractice: boolean;
  /** Share of the items reached that the student gets right, 0–100. */
  accuracy: number;
  /** How long ago the attempt started, in days. */
  daysBack: number;
  /** Share of the item set the student reached. 1 for a finished attempt. */
  coverage: number;
  /** Every hint in this bank costs nothing, so this only colours the evidence. */
  usesHints: boolean;
}

/** One programme a student is taught, in teaching order. */
export interface StudentProgram {
  programKey: string;
  /** Topic ids in teaching order. */
  topicIds: string[];
  /** First unit of the programme, already keyed as `${programKey}:${unitKey}`. */
  unitKey: string;
}

/** Deterministic accuracy inside the student's window, shifted by `bias` points. */
function accuracyFor(student: DemoStudent, key: string, bias = 0): number {
  const window = ACCURACY[student.band];
  const base = hashInt(`accuracy:${student.id}:${key}`, window[0], window[1]);
  return Math.max(5, Math.min(100, base + bias));
}

/**
 * The demo history for one student: a screening placement per programme, the
 * first two topic checks of each, a practised unit check plus one attempt left
 * open, and deterministic coverage of the states a dashboard has to survive —
 * a retry after support, an abandoned run, an expired one, and one still waiting
 * to be marked.
 *
 * `programs` arrives in curriculum order, so `programs[0]` is the student's first
 * taught subject; the plan does not care which subject that is. `cohortIndex` is
 * the student's position in `people.students`, used only to spread the awkward
 * attempt states evenly across the class.
 */
export function planAttempts(
  student: DemoStudent,
  programs: StudentProgram[],
  cohortIndex: number,
): AttemptSlot[] {
  const slots: AttemptSlot[] = [];

  programs.forEach((program, index) => {
    slots.push({
      target: { kind: 'screening', programKey: program.programKey },
      attemptNumber: 1,
      status: AttemptStatus.COMPLETED,
      isPractice: false,
      accuracy: accuracyFor(student, `screening:${program.programKey}`),
      daysBack: 42 - index * 2,
      coverage: 1,
      usesHints: false,
    });

    program.topicIds.slice(0, 2).forEach((topicId, order) => {
      slots.push({
        target: { kind: 'topic-check', topicId },
        attemptNumber: 1,
        status: AttemptStatus.COMPLETED,
        isPractice: false,
        // The second topic is met with more of the programme already behind them.
        accuracy: accuracyFor(student, `topic:${topicId}`, order * 3),
        daysBack: 26 - index * 3 - order * 4,
        coverage: 1,
        usesHints: false,
      });
    });
  });

  const primary = programs[0];
  if (primary) {
    // Practice first — blueprint 03 keeps practice out of the mastery record —
    // then the graded sitting, left open so "resume" has something to resume.
    slots.push({
      target: { kind: 'unit-check', unitKey: primary.unitKey },
      attemptNumber: 1,
      status: AttemptStatus.COMPLETED,
      isPractice: true,
      accuracy: accuracyFor(student, `practice:${primary.unitKey}`, 8),
      daysBack: 12,
      coverage: 1,
      usesHints: true,
    });
    slots.push({
      target: { kind: 'unit-check', unitKey: primary.unitKey },
      attemptNumber: 2,
      status: AttemptStatus.IN_PROGRESS,
      isPractice: false,
      accuracy: accuracyFor(student, `unit:${primary.unitKey}`),
      daysBack: 0,
      coverage: 0.55,
      usesHints: false,
    });

    if (student.band === 'needs-support') {
      // The intervention story: a weak sitting, support, then a better retry.
      slots.push({
        target: { kind: 'reassessment', programKey: primary.programKey },
        attemptNumber: 1,
        status: AttemptStatus.COMPLETED,
        isPractice: false,
        accuracy: accuracyFor(student, `reassess-1:${primary.programKey}`, -10),
        daysBack: 20,
        coverage: 1,
        usesHints: true,
      });
      slots.push({
        target: { kind: 'reassessment', programKey: primary.programKey },
        attemptNumber: 2,
        status: AttemptStatus.COMPLETED,
        isPractice: false,
        accuracy: accuracyFor(student, `reassess-2:${primary.programKey}`, 16),
        daysBack: 5,
        coverage: 1,
        usesHints: true,
      });
    }
  }

  // States that are easy to forget and awkward to fake later. They are handed out
  // by position in the cohort rather than by a hash, because a hash can miss a
  // state entirely in a class of twenty-four and then a dashboard ships untested.
  // One student in five carries each, and the same student always carries it.
  const extra = cohortIndex % 5;
  const second = programs[1];
  const secondTopic = second?.topicIds[0];
  if (secondTopic && extra === 0) {
    slots.push({
      target: { kind: 'topic-check', topicId: secondTopic },
      attemptNumber: 2,
      status: AttemptStatus.ABANDONED,
      isPractice: false,
      accuracy: accuracyFor(student, `abandon:${secondTopic}`, -12),
      daysBack: 9,
      coverage: 0.3,
      usesHints: false,
    });
  }

  const third = programs[2];
  if (third && extra === 1) {
    slots.push({
      target: { kind: 'teacher-test', programKey: third.programKey },
      attemptNumber: 1,
      status: AttemptStatus.EXPIRED,
      isPractice: false,
      accuracy: accuracyFor(student, `expire:${third.programKey}`),
      daysBack: 7,
      coverage: 0.45,
      usesHints: false,
    });
  }

  const thirdTopic = third?.topicIds[1];
  if (thirdTopic && extra === 2) {
    slots.push({
      target: { kind: 'topic-check', topicId: thirdTopic },
      attemptNumber: 2,
      status: AttemptStatus.SUBMITTED,
      isPractice: false,
      accuracy: accuracyFor(student, `submitted:${thirdTopic}`, 6),
      daysBack: 1,
      coverage: 1,
      usesHints: false,
    });
  }

  return slots;
}

/** What an attempt adds up to, once every answer it reached has been marked. */
export interface AttemptTally {
  presented: number;
  correct: number;
  pointsAwarded: number;
  pointsPossible: number;
  timeSpentSeconds: number;
  /** Hardest band the student answered correctly, or null if none. */
  bandPassed: DifficultyBand | null;
}

/** Only these states carry a score; the rest leave the score columns null. */
export function isScored(status: AttemptStatus): boolean {
  return status === AttemptStatus.COMPLETED || status === AttemptStatus.SUBMITTED;
}

export function scorePercent(tally: AttemptTally): number {
  if (tally.pointsPossible <= 0) return 0;
  return Math.round((tally.pointsAwarded / tally.pointsPossible) * 100);
}

/**
 * The line a teacher reads on the attempt list (blueprint 12). Well inside the
 * 600 characters `AssessmentAttempt.outcomeSummary` allows.
 */
export function attemptSummary(label: string, status: AttemptStatus, tally: AttemptTally): string {
  const items = `${tally.presented} item${tally.presented === 1 ? '' : 's'}`;
  if (!isScored(status)) {
    const state = status === AttemptStatus.IN_PROGRESS ? 'in progress' : status.toLowerCase();
    return `${label} — ${state} after ${items}`;
  }
  const band = tally.bandPassed ? `, reached ${tally.bandPassed.toLowerCase()}` : '';
  return `${label} — ${tally.correct}/${tally.presented} correct (${scorePercent(tally)}%)${band}`;
}

/** Whether one item is answered correctly, at the slot's planned accuracy. */
export function shouldAnswerCorrectly(accuracy: number, key: string): boolean {
  return chance(key, accuracy);
}

/** A wrong answer is sometimes left blank rather than guessed at. */
export function shouldSkip(key: string): boolean {
  return chance(key, 14);
}
