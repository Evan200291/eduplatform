// ─────────────────────────────────────────────────────────────────────────────
// Seed — missions and leaderboards
// The other half of the demo school's engagement catalogue, split from
// `engagement.catalog.ts` (badges and rewards) only because the two together run
// past the length this codebase keeps files to. The seam is what the rows are for:
// a badge or reward is something a learner *holds*, a mission or a board is
// something they are *measured against*, and the measuring is done by product code
// (`missions.rules.measureGoal`, `leaderboard.ranking.scoresFor`) rather than here.
//
// Pure data, no Prisma import. Ids are named indirectly — a class code, a grade key,
// a subject key — and resolved against the seeded school in `engagement.seed.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { LeaderboardIdentityMode, LeaderboardRankingMode, LeaderboardScope } from '@prisma/client';

/** Where a mission or a board points. Resolved against the seeded school. */
export interface TopicRef {
  subjectKey: string;
  gradeKey: string;
  /** Position in curriculum order for that subject and grade. */
  index: number;
}

export interface MissionSpec {
  key: string;
  title: string;
  description: string;
  goalType: string;
  goalTarget: number;
  pointsReward: number;
  /** Badge handed over on completion, by catalogue key. */
  rewardBadgeKey: string | null;
  /** Limits the mission to one class, by class code. */
  classCode: string | null;
  topicRef: TopicRef | null;
  /** Days before `now` the mission opened. */
  startsDaysAgo: number;
  /** Days from `now` it closes. Negative means it already has. Null never closes. */
  endsInDays: number | null;
  isRecurring: boolean;
  recurrenceDays: number | null;
  isActive: boolean;
}

/**
 * Nine missions. All six goal types appear, because each one is measured by a
 * different query in `missions.rules.measureGoal` and a goal type with no mission
 * behind it is a query nobody has ever run against real rows.
 *
 * Three are deliberately awkward: one closed last week (so `EXPIRED` is reachable),
 * one is still a draft (`isActive: false`), and one is limited to a single class.
 * The titles are the learner-facing text; `goalLabel` supplies the sub-line, so the
 * wording of "Finish 5 activities" lives in the product, not here.
 */
export const MISSIONS: readonly MissionSpec[] = [
  {
    key: 'five-this-week',
    title: 'Five this week',
    description: 'Pick any five activities and finish them before the week is out.',
    goalType: 'ACTIVITIES_COMPLETED',
    goalTarget: 5,
    pointsReward: 30,
    rewardBadgeKey: null,
    classCode: null,
    topicRef: null,
    startsDaysAgo: 6,
    endsInDays: 1,
    isRecurring: true,
    recurrenceDays: 7,
    isActive: true,
  },
  {
    key: 'half-hour-week',
    title: 'Half an hour of learning',
    description: 'Thirty minutes across the week. Ten minutes three times counts.',
    goalType: 'MINUTES_LEARNED',
    goalTarget: 30,
    pointsReward: 20,
    rewardBadgeKey: null,
    classCode: null,
    topicRef: null,
    startsDaysAgo: 6,
    endsInDays: 1,
    isRecurring: true,
    recurrenceDays: 7,
    isActive: true,
  },
  {
    key: 'fractions-focus',
    title: 'Get fractions solid',
    description: 'Work on this one topic until it is properly understood.',
    goalType: 'TOPICS_MASTERED',
    goalTarget: 1,
    pointsReward: 40,
    rewardBadgeKey: 'three-topics',
    classCode: null,
    topicRef: { subjectKey: 'mathematics', gradeKey: 'year-4', index: 1 },
    startsDaysAgo: 21,
    endsInDays: 14,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'three-on-time',
    title: 'Three in on time',
    description: 'Hand in three pieces of work before their deadlines.',
    goalType: 'ASSIGNMENTS_ON_TIME',
    goalTarget: 3,
    pointsReward: 25,
    rewardBadgeKey: 'homework-hero',
    classCode: null,
    topicRef: null,
    startsDaysAgo: 28,
    endsInDays: 7,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'eighty-percent',
    title: 'Aim for eighty',
    description: 'Reach 80% accuracy across everything you answer this month.',
    goalType: 'ACCURACY_PERCENT',
    goalTarget: 80,
    pointsReward: 35,
    rewardBadgeKey: 'careful-work',
    classCode: null,
    topicRef: null,
    startsDaysAgo: 30,
    endsInDays: 3,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'ten-day-run',
    title: 'Ten days running',
    description: 'Learn something on ten days in a row. Short days count.',
    goalType: 'STREAK_DAYS',
    goalTarget: 10,
    pointsReward: 50,
    rewardBadgeKey: 'term-habit',
    classCode: null,
    topicRef: null,
    startsDaysAgo: 30,
    endsInDays: 30,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'ash-teamwork',
    title: 'Ash class: four each',
    description: 'Everyone in Year 3 Ash finishes four activities. Help each other.',
    goalType: 'ACTIVITIES_COMPLETED',
    goalTarget: 4,
    pointsReward: 20,
    rewardBadgeKey: null,
    classCode: '3A',
    topicRef: null,
    startsDaysAgo: 10,
    endsInDays: 4,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'last-fortnight',
    title: 'Eight before half term',
    description: 'Eight activities before the break. This one has closed.',
    goalType: 'ACTIVITIES_COMPLETED',
    goalTarget: 8,
    pointsReward: 30,
    rewardBadgeKey: null,
    classCode: null,
    topicRef: null,
    startsDaysAgo: 24,
    endsInDays: -6,
    isRecurring: false,
    recurrenceDays: null,
    isActive: true,
  },
  {
    key: 'summer-quest-draft',
    title: 'Summer quest',
    description: 'Twelve activities over the holidays. Not published yet.',
    goalType: 'ACTIVITIES_COMPLETED',
    goalTarget: 12,
    pointsReward: 60,
    rewardBadgeKey: null,
    classCode: null,
    topicRef: null,
    startsDaysAgo: 0,
    endsInDays: 60,
    isRecurring: false,
    recurrenceDays: null,
    isActive: false,
  },
];

/**
 * How a board's cohort is named. `participantsFor` reads `scopeId` differently per
 * scope — a class id, a grade id, a subject id, a group id — so the spec says which
 * kind of thing it wants and `engagement.seed.ts` looks the id up.
 */
export type BoardTarget =
  | { kind: 'class'; code: string }
  | { kind: 'grade'; key: string }
  | { kind: 'subject'; key: string }
  | { kind: 'support-group' }
  | { kind: 'school' };

export interface BoardSpec {
  /** `LeaderboardConfiguration` has no unique key, so the name locates the row. */
  name: string;
  scope: LeaderboardScope;
  target: BoardTarget;
  identityMode: LeaderboardIdentityMode;
  rankingMode: LeaderboardRankingMode;
  isActive: boolean;
  /** Null is an all-time board, which pins its window to `startsAt`. */
  periodDays: number | null;
  minParticipants: number;
  showTopN: number;
  allowOptOut: boolean;
  startsDaysAgo: number | null;
  endsInDays: number | null;
}

/**
 * Seven boards covering all six scopes, all five ranking modes and all four identity
 * modes. Two are drafts, because blueprint 03 says leaderboards are off by default
 * and the demo school has the school-wide switch off as well — these rows exist so
 * an administrator turning the feature on finds something already configured rather
 * than an empty page, and so the ranking maths has been exercised against real
 * evidence before anybody's name appears on it.
 */
export const BOARDS: readonly BoardSpec[] = [
  {
    name: 'Ash class effort this week',
    scope: LeaderboardScope.CLASS,
    target: { kind: 'class', code: '3A' },
    identityMode: LeaderboardIdentityMode.NICKNAME,
    rankingMode: LeaderboardRankingMode.ACTIVITY_COUNT,
    isActive: true,
    periodDays: 7,
    minParticipants: 3,
    showTopN: 10,
    allowOptOut: true,
    startsDaysAgo: 42,
    endsInDays: null,
  },
  {
    name: 'Year 4 personal bests',
    scope: LeaderboardScope.GRADE,
    target: { kind: 'grade', key: 'year-4' },
    identityMode: LeaderboardIdentityMode.AVATAR_ONLY,
    rankingMode: LeaderboardRankingMode.PERSONAL_BEST,
    isActive: true,
    periodDays: 30,
    minParticipants: 3,
    showTopN: 10,
    allowOptOut: true,
    startsDaysAgo: 42,
    endsInDays: null,
  },
  {
    name: 'Mathematics points',
    scope: LeaderboardScope.SUBJECT,
    target: { kind: 'subject', key: 'mathematics' },
    identityMode: LeaderboardIdentityMode.ANONYMOUS_RANK,
    rankingMode: LeaderboardRankingMode.POINTS,
    isActive: true,
    periodDays: 7,
    minParticipants: 5,
    showTopN: 10,
    allowOptOut: true,
    startsDaysAgo: 42,
    endsInDays: null,
  },
  {
    name: 'Support group, together',
    scope: LeaderboardScope.COHORT,
    target: { kind: 'support-group' },
    identityMode: LeaderboardIdentityMode.REAL_NAME,
    rankingMode: LeaderboardRankingMode.COOPERATIVE_TEAM,
    isActive: true,
    periodDays: null,
    minParticipants: 2,
    showTopN: 20,
    allowOptOut: false,
    startsDaysAgo: 42,
    endsInDays: null,
  },
  {
    name: 'Whole school: topics understood',
    scope: LeaderboardScope.SCHOOL,
    target: { kind: 'school' },
    identityMode: LeaderboardIdentityMode.NICKNAME,
    rankingMode: LeaderboardRankingMode.MASTERY_GAIN,
    isActive: true,
    periodDays: 30,
    minParticipants: 5,
    showTopN: 10,
    allowOptOut: true,
    startsDaysAgo: 42,
    endsInDays: null,
  },
  {
    name: 'Reading week challenge',
    scope: LeaderboardScope.EVENT,
    target: { kind: 'school' },
    identityMode: LeaderboardIdentityMode.NICKNAME,
    rankingMode: LeaderboardRankingMode.POINTS,
    isActive: false,
    periodDays: 14,
    minParticipants: 5,
    showTopN: 5,
    allowOptOut: true,
    startsDaysAgo: 28,
    endsInDays: -7,
  },
  {
    name: 'Cedar class points',
    scope: LeaderboardScope.CLASS,
    target: { kind: 'class', code: '5C' },
    identityMode: LeaderboardIdentityMode.REAL_NAME,
    rankingMode: LeaderboardRankingMode.POINTS,
    isActive: false,
    periodDays: 7,
    minParticipants: 5,
    showTopN: 10,
    allowOptOut: true,
    startsDaysAgo: 14,
    endsInDays: null,
  },
];
