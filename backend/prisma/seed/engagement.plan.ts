// ─────────────────────────────────────────────────────────────────────────────
// Seed plan — engagement data, pure functions
// Nothing here touches Prisma. `engagement.seed.ts` calls these to decide what a
// learner earned, when, and what their companion looks like, then writes the
// rows through the product's own services so the demo behaves exactly like a
// live school would.
//
// Three things this file exists to get right, all of them consequences of how the
// real services behave rather than preferences:
//
//   1. Streaks are planned as explicit date series, not derived from attempts. The
//      attempt history has gaps of five to sixteen days, so a `streak{days: 5}`
//      badge could never fire from it. `recordStreakActivity` also short-circuits
//      when `gap === 0`, which means a replay has to run in *ascending* date order
//      or the streak sticks at 1 — so the series below are stored oldest-first.
//   2. Every learner gets a *recent* run and an *earlier, longer* run, so
//      `longestLength > currentLength` for at least one band. Badges measure the
//      longest, dashboards show the current, and a seed where the two are always
//      equal leaves half of that UI untested.
//   3. Companion stages are positional. `growCompanion` stamps `new Date()` for
//      every timestamp it writes, so a companion built purely by replaying events
//      would finish with all six weeks of history at "now" and a care streak of
//      one. Instead each companion is created with a *baseline* growth figure
//      standing for the history before the evidence window, and the backdated
//      events are appended separately.
// ─────────────────────────────────────────────────────────────────────────────

import { StreakKind } from '@prisma/client';

import { hashInt, pick } from './helpers';
import type { DemoStudent } from './people.seed';

/** Days-ago offsets, oldest first. Replayed in this order for the reasons above. */
export type DateSeries = readonly number[];

export interface CompanionEventPlan {
  kind: string;
  description: string;
  growthDelta: number;
  daysAgo: number;
  sourceType: string;
  /** `CompanionEvent.sourceId` is VarChar(32), so these stay short. */
  sourceId: string;
}

/** A ledger row no piece of evidence would produce — staff discretion, mostly. */
export interface ManualEntryPlan {
  points: number;
  daysAgo: number;
  note: string;
}

/**
 * How hard each band works, per streak kind, as (recent run, earlier run) lengths.
 *
 * The earlier run is longer than the recent one for two of the three bands, which is
 * what makes `longestLength > currentLength` real data rather than a special case. A
 * thriving learner is the exception: their best run *is* the one they are on, which
 * is the state the "personal best" banner is drawn for.
 */
export const RUNS: Record<DemoStudent['band'], Record<StreakKind, readonly [number, number]>> = {
  thriving: {
    [StreakKind.DAILY_LEARNING]: [12, 8],
    [StreakKind.WEEKLY_LEARNING]: [5, 3],
    [StreakKind.ASSIGNMENT_ON_TIME]: [5, 4],
    [StreakKind.ACCURACY]: [4, 3],
  },
  steady: {
    [StreakKind.DAILY_LEARNING]: [5, 9],
    [StreakKind.WEEKLY_LEARNING]: [3, 4],
    [StreakKind.ASSIGNMENT_ON_TIME]: [3, 4],
    [StreakKind.ACCURACY]: [2, 3],
  },
  'needs-support': {
    [StreakKind.DAILY_LEARNING]: [2, 6],
    [StreakKind.WEEKLY_LEARNING]: [1, 3],
    [StreakKind.ASSIGNMENT_ON_TIME]: [1, 2],
    [StreakKind.ACCURACY]: [1, 2],
  },
};

/** One period in days, matching how `streaks.service` buckets each kind. */
export const PERIOD_DAYS: Record<StreakKind, number> = {
  [StreakKind.DAILY_LEARNING]: 1,
  [StreakKind.WEEKLY_LEARNING]: 7,
  [StreakKind.ASSIGNMENT_ON_TIME]: 1,
  [StreakKind.ACCURACY]: 1,
};

/**
 * Two contiguous runs of qualifying days, oldest first, with a real break between
 * them so the second one genuinely restarts the count.
 *
 * The gap is `period * 3`, which is wider than the single freeze a streak carries by
 * default — a two-period gap would be absorbed by the freeze and silently merge the
 * two runs into one, leaving `longestLength` equal to `currentLength` again.
 */
export function seriesFor(kind: StreakKind, recent: number, earlier: number): DateSeries {
  const period = PERIOD_DAYS[kind];
  const days: number[] = [];

  // The recent run ends today (or this week), so the streak reads as live.
  const recentStart = (recent - 1) * period;
  const gapStart = recentStart + period * 3;
  const earlierStart = gapStart + (earlier - 1) * period;

  for (let index = 0; index < earlier; index += 1) days.push(earlierStart - index * period);
  for (let index = 0; index < recent; index += 1) days.push(recentStart - index * period);

  // Descending days-ago is ascending in time, which is the order the replay needs.
  return days.sort((left, right) => right - left);
}

/**
 * Growth baselines, walked positionally across the cohort so every `CompanionStage`
 * appears. The figures sit just above `STAGE_THRESHOLDS` (0/50/150/350/700/1400) with
 * a little headroom, so the replayed learning events push a companion *within* its
 * stage rather than tipping it into the next one — a seeded ADULT should still be an
 * ADULT after the seed finishes, or the summary line would be a lie.
 *
 * RADIANT is reachable, and deliberately rare: it is meant to represent a year of
 * use, and a demo school where a third of the learners have one would misrepresent
 * what the stage means to anybody reading the dashboards.
 */
export const BASELINES: readonly number[] = [0, 60, 180, 400, 760, 1_460, 90, 240];

/**
 * Care streaks, positional for the same reason as the baselines: `moodFor` derives
 * mood from this number, and a `chance()` gate over 24 learners can easily miss
 * PROUD or CONTENT entirely.
 *
 * Two moods are *not* reachable here and that is a product finding, not an omission.
 * SLEEPY needs `companionDecayEnabled`, which the demo school leaves off, and
 * `CompanionMood.EXCITED` is never returned by `moodFor` at all — it is the only
 * value of that enum with no writer anywhere in `src/`.
 */
export const CARE_STREAKS: readonly number[] = [9, 4, 1, 0, 7, 3, 12, 2];

/** Cosmetic only. Named so a screenshot of the companion page reads like a class. */
export const COMPANION_NAMES: readonly string[] = [
  'Pip', 'Nutmeg', 'Sable', 'Willow', 'Comet', 'Poppy', 'Juniper', 'Rusty',
  'Marlow', 'Clover', 'Bramble', 'Tuppence',
];

export const SPECIES: readonly string[] = [
  'ember-fox',
  'river-otter',
  'meadow-hare',
  'star-owl',
  'cloud-turtle',
  'pebble-badger',
];

/**
 * The companion's own history — hellos, praise, a milestone — as opposed to the
 * growth its owner's learning produces, which `engagement.seed.ts` credits
 * separately through `growCompanion` and which therefore writes its own events.
 *
 * `INTERACTION` events carry no growth: visiting a companion is affection, not
 * evidence of learning, and paying growth for a tap would let a learner grow one by
 * opening the page repeatedly. Every event kind the schema names appears across the
 * cohort so `listEvents` has each one to render.
 */
export function eventsFor(student: DemoStudent, baseline: number): CompanionEventPlan[] {
  const events: CompanionEventPlan[] = [
    {
      kind: 'INTERACTION',
      description: 'You said hello.',
      growthDelta: 0,
      daysAgo: hashInt(`greet:${student.code}`, 1, 4),
      sourceType: 'Interaction',
      sourceId: `greet-${student.code}`,
    },
    {
      kind: 'INTERACTION',
      description: 'You told them you were proud of them.',
      growthDelta: 0,
      daysAgo: hashInt(`praise:${student.code}`, 5, 12),
      sourceType: 'Interaction',
      sourceId: `praise-${student.code}`,
    },
  ];

  // A hatching only makes sense for a companion that got past the egg, and the egg
  // threshold is 50 — so a learner still on zero growth has nothing to celebrate yet.
  if (baseline >= 50) {
    events.push({
      kind: 'MILESTONE',
      description: 'They came out of their egg.',
      growthDelta: 0,
      daysAgo: hashInt(`hatch:${student.code}`, 30, 44),
      sourceType: 'Milestone',
      sourceId: `hatch-${student.code}`,
    });
  }

  if (baseline >= 350) {
    events.push({
      kind: 'ACCESSORY_UNLOCK',
      description: 'A new hat arrived for them.',
      growthDelta: 0,
      daysAgo: hashInt(`hat:${student.code}`, 8, 20),
      sourceType: 'Accessory',
      sourceId: `hat-${student.code}`,
    });
  }

  return events.sort((left, right) => right.daysAgo - left.daysAgo);
}

/**
 * Rewards a learner has unlocked, cheapest first.
 *
 * The two zero-cost rows are recognition rather than purchases — a certificate and a
 * teacher's shout-out — so everybody who has one has it because somebody gave it to
 * them. The priced ones are only *planned* here: `engagement.seed.ts` checks the
 * real balance through `balanceFor` before unlocking, so no learner ends up owning a
 * frame they could not have afforded.
 *
 * `sunrise-frame` is deliberately absent. It is gated to `UPPER_SECONDARY` and every
 * demo learner is `PRIMARY`, so granting it would put a row in the database that the
 * product's own age check would refuse to create.
 */
export function rewardsFor(band: DemoStudent['band'], index: number): readonly string[] {
  const keys: string[] = ['term-certificate'];

  if (band === 'thriving') keys.push('star-frame', 'explorer-avatar', 'wizard-hat');
  else if (band === 'steady') keys.push('star-frame');

  // One learner per class gets the teacher's recognition, so the rarest reward kind
  // is present without being universal.
  if (index % 8 === 2) keys.push('reading-champion');
  // And one whole-cohort position reaches the expensive theme unlock.
  if (index === 0) keys.push('ocean-theme');

  return keys;
}

/**
 * The rows no piece of evidence would ever produce. Between them these cover the
 * four `PointsReason` values that only ever arrive by hand — TEACHER_AWARD,
 * MANUAL_ADJUSTMENT, ONBOARDING_COMPLETION and STREAK_BONUS — plus REVERSAL, which
 * is written as the cancellation of a real award rather than as a bare negative row.
 *
 * Positional again: with 24 learners a probability gate can leave a reason with no
 * rows at all, and an empty filter tab on the points ledger is precisely the kind of
 * gap this seed exists to rule out.
 */
export function manualEntriesFor(
  student: DemoStudent,
  index: number,
): {
  teacherAward: ManualEntryPlan | null;
  adjustment: ManualEntryPlan | null;
  onboarding: ManualEntryPlan;
  streakBonus: ManualEntryPlan | null;
  /** Reverse the teacher award afterwards, so `REVERSAL` appears in the ledger with a
   *  consistent pair of rows rather than as an orphan negative entry. */
  reverseAward: boolean;
} {
  const award = index % 4 === 0;
  const correction = index % 6 === 1;
  const bonus = index % 3 === 0;

  return {
    teacherAward: award
      ? {
          points: hashInt(`award:${student.code}`, 5, 25),
          daysAgo: hashInt(`award-day:${student.code}`, 2, 18),
          note: pick(
            ['Helped a classmate all week.', 'Asked a really good question.', 'Kept going when it was hard.'],
            `award-note:${student.code}`,
          ),
        }
      : null,
    // Negative for one learner in twelve: a correction is not always a top-up, and
    // the ledger view has to render a negative row without looking like a penalty.
    adjustment: correction
      ? {
          points: index % 12 === 1 ? -hashInt(`adj:${student.code}`, 3, 10) : hashInt(`adj:${student.code}`, 3, 15),
          daysAgo: hashInt(`adj-day:${student.code}`, 4, 22),
          note: 'Corrected after a marking review.',
        }
      : null,
    // Everybody finished the welcome tour, because everybody has signed in.
    onboarding: { points: 15, daysAgo: hashInt(`intro:${student.code}`, 38, 44), note: 'Finished the welcome tour.' },
    streakBonus: bonus
      ? { points: 10, daysAgo: hashInt(`bonus:${student.code}`, 1, 9), note: 'Ten days in a row.' }
      : null,
    // Only where there is an award to cancel, and only for one learner, so the pair
    // is legible in the ledger instead of half the school having reversed rows.
    reverseAward: award && index === 4,
  };
}
