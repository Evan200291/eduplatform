// ─────────────────────────────────────────────────────────────────────────────
// Seed — badges and rewards
// What a learner in the demo school can earn and hold. Pure data with no Prisma
// import, so the shape of the school's recognition layer can be read, reviewed and
// changed in one place. Missions and leaderboards — the things a learner is
// *measured against* — are in `engagement.missions.ts`.
//
// Every list here is deliberately *positional* rather than sampled. A `chance()`
// gate over fourteen badges can miss a whole `BadgeTier`, and a missing tier means
// a UI state nobody has ever seen with data in it. So each enum this file touches —
// `BadgeTier`, `RewardKind`, and all seven badge criteria variants — is covered by
// construction, and `engagement.seed.ts` asserts the ones that matter.
//
// Blueprint 03 is the constraint the contents obey, not just the schema:
//   • Effort and improvement are recognised, not only attainment — five badges
//     carry `recognisesEffort`, and one is awarded by a person rather than a rule.
//   • Rewards are cosmetic or recognition. Nothing here unlocks content.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode, BadgeTier, MasteryLevel, RewardKind, StreakKind } from '@prisma/client';

/**
 * A badge definition. `criteria` is typed loosely on purpose: it is validated
 * against the product's own `badgeCriteriaSchema` before it is written, so a rule
 * this file gets wrong fails the seed instead of quietly never awarding.
 */
export interface BadgeSpec {
  key: string;
  name: string;
  description: string;
  tier: BadgeTier;
  pointsValue: number;
  recognisesEffort: boolean;
  criteria: Record<string, unknown>;
  criteriaLabel: string;
  iconKey: string;
}

/**
 * Fourteen badges. Two things worth knowing before adding one:
 *
 *   1. A `points` badge pays nothing itself. `grantBadge` credits a badge's
 *      `pointsValue` through the ledger, so a badge earned *for* a balance that
 *      then raises that balance is a feedback loop — small, but it would make the
 *      next threshold arrive for the wrong reason.
 *   2. `manual` badges are never awarded by the engine (`meetsCriteria` returns
 *      false for them), so the one below is granted explicitly by a teacher.
 */
export const BADGES: readonly BadgeSpec[] = [
  {
    key: 'first-steps',
    name: 'First Steps',
    description: 'You finished your very first activity. Everything starts here.',
    tier: BadgeTier.BRONZE,
    pointsValue: 5,
    recognisesEffort: true,
    criteria: { type: 'activities', count: 1 },
    criteriaLabel: 'Finish one activity',
    iconKey: 'footprints',
  },
  {
    key: 'ten-activities',
    name: 'Ten Done',
    description: 'Ten activities finished. That is a real body of work.',
    tier: BadgeTier.BRONZE,
    pointsValue: 10,
    recognisesEffort: false,
    criteria: { type: 'activities', count: 10 },
    criteriaLabel: 'Finish ten activities',
    iconKey: 'list-checks',
  },
  {
    key: 'steady-week',
    name: 'Steady Week',
    description: 'Five days of learning in a row. Turning up is the hard part.',
    tier: BadgeTier.SILVER,
    pointsValue: 15,
    recognisesEffort: true,
    criteria: { type: 'streak', kind: StreakKind.DAILY_LEARNING, days: 5 },
    criteriaLabel: 'Learn on five days in a row',
    iconKey: 'flame',
  },
  {
    key: 'term-habit',
    name: 'Term Habit',
    description: 'Twenty days of learning in a row — a habit, not a burst.',
    tier: BadgeTier.GOLD,
    pointsValue: 40,
    recognisesEffort: true,
    criteria: { type: 'streak', kind: StreakKind.DAILY_LEARNING, days: 20 },
    criteriaLabel: 'Learn on twenty days in a row',
    iconKey: 'calendar-heart',
  },
  {
    key: 'week-on-week',
    name: 'Week on Week',
    description: 'Three school weeks running with learning in each one.',
    tier: BadgeTier.SILVER,
    pointsValue: 20,
    recognisesEffort: true,
    criteria: { type: 'streak', kind: StreakKind.WEEKLY_LEARNING, days: 3 },
    criteriaLabel: 'Learn in three weeks in a row',
    iconKey: 'calendar-range',
  },
  {
    key: 'always-on-time',
    name: 'Always On Time',
    description: 'Four pieces of work handed in on time, one after another.',
    tier: BadgeTier.SILVER,
    pointsValue: 20,
    recognisesEffort: false,
    criteria: { type: 'streak', kind: StreakKind.ASSIGNMENT_ON_TIME, days: 4 },
    criteriaLabel: 'Hand in four tasks on time in a row',
    iconKey: 'alarm-clock-check',
  },
  {
    key: 'careful-work',
    name: 'Careful Work',
    description: 'Three sessions in a row where the answers were checked properly.',
    tier: BadgeTier.GOLD,
    pointsValue: 25,
    recognisesEffort: false,
    criteria: { type: 'streak', kind: StreakKind.ACCURACY, days: 3 },
    criteriaLabel: 'Three accurate sessions in a row',
    iconKey: 'target',
  },
  {
    key: 'hundred-points',
    name: 'First Hundred',
    description: 'A hundred points earned. Spend them on something good.',
    tier: BadgeTier.BRONZE,
    pointsValue: 0,
    recognisesEffort: false,
    criteria: { type: 'points', threshold: 100 },
    criteriaLabel: 'Earn 100 points',
    iconKey: 'coins',
  },
  {
    key: 'five-hundred-points',
    name: 'Five Hundred Strong',
    description: 'Five hundred points. That is a whole term of showing up.',
    tier: BadgeTier.GOLD,
    pointsValue: 0,
    recognisesEffort: false,
    criteria: { type: 'points', threshold: 500 },
    criteriaLabel: 'Earn 500 points',
    iconKey: 'gem',
  },
  {
    key: 'three-topics',
    name: 'Three Topics Solid',
    description: 'Three topics understood well enough to build on.',
    tier: BadgeTier.SILVER,
    pointsValue: 25,
    recognisesEffort: false,
    criteria: { type: 'mastery', count: 3, minLevel: MasteryLevel.PROFICIENT },
    criteriaLabel: 'Reach proficient in three topics',
    iconKey: 'layers',
  },
  {
    key: 'mastered-two',
    name: 'Really Got It',
    description: 'Two topics mastered. Not just passed — mastered.',
    tier: BadgeTier.PLATINUM,
    pointsValue: 50,
    recognisesEffort: false,
    criteria: { type: 'mastery', count: 2, minLevel: MasteryLevel.MASTERED },
    criteriaLabel: 'Master two topics',
    iconKey: 'crown',
  },
  {
    key: 'homework-hero',
    name: 'Homework Hero',
    description: 'Five pieces of homework in on time. Your teacher noticed.',
    tier: BadgeTier.BRONZE,
    pointsValue: 15,
    recognisesEffort: false,
    criteria: { type: 'assignments', count: 5, onTimeOnly: true },
    criteriaLabel: 'Hand in five tasks on time',
    iconKey: 'backpack',
  },
  {
    key: 'big-improver',
    name: 'Big Improver',
    description: 'Twenty points better on a topic than when you started it.',
    tier: BadgeTier.GOLD,
    pointsValue: 30,
    recognisesEffort: true,
    criteria: { type: 'improvement', gainPercent: 20 },
    criteriaLabel: 'Improve by 20% on any topic',
    iconKey: 'trending-up',
  },
  {
    key: 'helping-hand',
    name: 'Helping Hand',
    description: 'Given by a teacher to someone who helped a classmate learn.',
    tier: BadgeTier.SPECIAL,
    pointsValue: 25,
    recognisesEffort: true,
    criteria: { type: 'manual' },
    criteriaLabel: 'Awarded by a teacher',
    iconKey: 'hand-heart',
  },
];

/** Blueprint 03: cosmetic or recognition only. Nothing here unlocks learning. */
export interface RewardSpec {
  key: string;
  name: string;
  description: string;
  kind: RewardKind;
  /** 0 means "granted by a rule or a teacher", not "free to everyone". */
  pointsCost: number;
  payload: Record<string, unknown>;
  ageMode: AgeMode | null;
}

/**
 * Seven rewards across all six `RewardKind` values. The two costing nothing are the
 * ones a person hands over — a certificate at the end of term, a teacher's written
 * recognition — and the age-gated frame exists so the `ageMode` column is exercised
 * by something a Year 3 learner correctly cannot see.
 */
export const REWARDS: readonly RewardSpec[] = [
  {
    key: 'star-frame',
    name: 'Star Frame',
    description: 'A ring of small stars around your picture.',
    kind: RewardKind.COSMETIC_ITEM,
    pointsCost: 50,
    payload: { slot: 'frame', assetKey: 'star-frame' },
    ageMode: null,
  },
  {
    key: 'wizard-hat',
    name: 'Wizard Hat',
    description: 'For your companion. Slightly too big, which is the point.',
    kind: RewardKind.COMPANION_ACCESSORY,
    pointsCost: 120,
    payload: { slot: 'hat', assetKey: 'wizard-hat' },
    ageMode: null,
  },
  {
    key: 'explorer-avatar',
    name: 'Explorer Avatar',
    description: 'A little explorer with a map and a very determined face.',
    kind: RewardKind.AVATAR_ITEM,
    pointsCost: 80,
    payload: { slot: 'avatar', assetKey: 'explorer' },
    ageMode: null,
  },
  {
    key: 'ocean-theme',
    name: 'Ocean Theme',
    description: 'Turns the whole app the colour of a calm sea.',
    kind: RewardKind.THEME_UNLOCK,
    pointsCost: 200,
    payload: { themeKey: 'ocean-breeze' },
    ageMode: null,
  },
  {
    key: 'term-certificate',
    name: 'Effort Certificate',
    description: 'A printable certificate for consistent effort this term.',
    kind: RewardKind.CERTIFICATE,
    pointsCost: 0,
    payload: { template: 'term-effort', printable: true },
    ageMode: null,
  },
  {
    key: 'reading-champion',
    name: 'Reading Champion',
    description: "Your teacher's written recognition, kept on your profile.",
    kind: RewardKind.TEACHER_RECOGNITION,
    pointsCost: 0,
    payload: { citation: 'Read aloud to the class every week this term.' },
    ageMode: null,
  },
  {
    key: 'sunrise-frame',
    name: 'Sunrise Frame',
    description: 'A quieter frame, for older learners who asked for one.',
    kind: RewardKind.COSMETIC_ITEM,
    pointsCost: 300,
    payload: { slot: 'frame', assetKey: 'sunrise-frame' },
    ageMode: AgeMode.UPPER_SECONDARY,
  },
];

