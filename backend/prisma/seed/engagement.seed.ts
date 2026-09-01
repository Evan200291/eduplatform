// ─────────────────────────────────────────────────────────────────────────────
// Seed — engagement: points, badges, streaks, companions, missions, boards
// Blueprint 03. Unlike most seed modules, this one writes almost nothing by hand:
// every row goes through the same product code a live request would call —
// `earnPoints`, `recordStreakActivity`, `grantBadge`/`evaluateBadgesFor`,
// `growCompanion`, `ensureEnrolment`/`settleProgress`, `recomputeBoard` — so the
// demo behaves exactly like a school that earned all of this the slow way, and a
// change to any of those rules is automatically reflected here without this file
// needing to change.
//
// Order matters. Points, streaks and mastery are written first because badges are
// *measured* against them (`meetsCriteria` reads the ledger, the streak table and
// `MasteryRecord` directly); missions are settled last because `measureGoal` reads
// `ProgressRecord`, `AssignmentAttempt` and `TopicEvaluation`, all of which already
// exist from `evaluation.seed.ts` and `assignment.seed.ts` by the time this module
// runs. Companions and rewards sit in between: a companion's baseline growth is a
// standalone figure (see `engagement.plan.ts`), and a reward's affordability is
// checked against the balance the points steps above just produced.
//
// Idempotent, like every other seed module. `earnPoints` and `grantBadge` already
// key off `(studentId, reason/badge, sourceType, sourceId)`; `ensureEnrolment`
// writes only the rows still missing; this file adds the same guard for the two
// things it writes directly — `Companion` (unique on `studentId`) and
// `CompanionEvent` (no unique key, so existence is checked by `sourceType`/
// `sourceId` before writing).
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import {
  AssignmentState,
  MasteryLevel,
  PathItemStatus,
  PointsReason,
  StreakKind,
} from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import {
  growCompanion,
  levelFor,
  moodFor,
  readSettings,
  stageFor,
  writeEvent,
} from '../../src/modules/companion/companion.growth';
import { grantBadge, evaluateBadgesFor, type AwardableBadge } from '../../src/modules/gamification/gamification.rules';
import { balanceFor, earnPoints } from '../../src/modules/gamification/points.service';
import { recordStreakActivity } from '../../src/modules/gamification/streaks.service';
import { recomputeBoard } from '../../src/modules/leaderboard/leaderboard.service';
import { CONFIG_CORE } from '../../src/modules/leaderboard/leaderboard.ranking';
import { MISSION_CORE, PROGRESS_CORE, settleProgress } from '../../src/modules/missions/missions.rules';
import { ensureEnrolment } from '../../src/modules/missions/missions.service';
import { dispatchDueNotifications } from '../../src/modules/notifications/notifications.service';
import type { AssignmentFixture } from './assignment.seed';
import type { AttemptFixture } from './attempts.seed';
import { BADGES, REWARDS } from './engagement.catalog';
import {
  BASELINES,
  CARE_STREAKS,
  COMPANION_NAMES,
  RUNS,
  SPECIES,
  eventsFor,
  manualEntriesFor,
  rewardsFor,
  seriesFor,
} from './engagement.plan';
import { BOARDS, MISSIONS, type BoardTarget } from './engagement.missions';
import type { ContentFixture } from './content.seed';
import { daysAgo, daysAhead, hashInt, log, step } from './helpers';
import type { PeopleFixture } from './people.seed';
import type { SchoolFixture } from './school.seed';

export interface EngagementFixture {
  badges: number;
  rewards: number;
  pointsEntries: number;
  streakUpdates: number;
  badgesAwarded: number;
  companions: number;
  companionEvents: number;
  rewardsGranted: number;
  missions: number;
  missionProgress: number;
  missionsCompleted: number;
  boardsConfigured: number;
  boardsComputed: number;
}

// ── Catalogue ───────────────────────────────────────────────────────────────

async function seedBadgeCatalogue(schoolId: string): Promise<Record<string, AwardableBadge>> {
  const byKey: Record<string, AwardableBadge> = {};
  for (const spec of BADGES) {
    const data = {
      name: spec.name,
      description: spec.description,
      tier: spec.tier,
      pointsValue: spec.pointsValue,
      recognisesEffort: spec.recognisesEffort,
      criteria: spec.criteria as Prisma.InputJsonValue,
      criteriaLabel: spec.criteriaLabel,
      iconKey: spec.iconKey,
      isActive: true,
      archivedAt: null,
    };
    const row = await prisma.badge.upsert({
      where: { schoolId_key: { schoolId, key: spec.key } },
      update: data,
      create: { schoolId, key: spec.key, ...data },
      select: { id: true, key: true, name: true, tier: true, pointsValue: true, criteria: true },
    });
    byKey[spec.key] = row;
  }
  return byKey;
}

async function seedRewardCatalogue(
  schoolId: string,
): Promise<Record<string, { id: string; pointsCost: number }>> {
  const byKey: Record<string, { id: string; pointsCost: number }> = {};
  for (const spec of REWARDS) {
    const data = {
      name: spec.name,
      description: spec.description,
      kind: spec.kind,
      pointsCost: spec.pointsCost,
      payload: spec.payload as Prisma.InputJsonValue,
      ageMode: spec.ageMode,
      isActive: true,
      archivedAt: null,
    };
    const row = await prisma.reward.upsert({
      where: { schoolId_key: { schoolId, key: spec.key } },
      update: data,
      create: { schoolId, key: spec.key, ...data },
      select: { id: true, pointsCost: true },
    });
    byKey[spec.key] = row;
  }
  return byKey;
}

// ── Points: what the evidence already earned ───────────────────────────────

/**
 * Credits points for work that is already on record — completed activities and
 * lessons, graded assessments, handed-in assignments, mastered topics — none of
 * which had a ledger entry before this ran. `earnPoints` is idempotent per source
 * event, so a second seed run tops up nothing.
 */
async function awardEvidencePoints(
  schoolId: string,
  people: PeopleFixture,
  attempts: AttemptFixture,
  assignments: AssignmentFixture,
  now: Date,
): Promise<number> {
  let count = 0;
  const studentIds = people.students.map((student) => student.id);

  const progress = await prisma.progressRecord.findMany({
    where: { schoolId, studentId: { in: studentIds }, status: PathItemStatus.COMPLETED },
    select: {
      id: true,
      studentId: true,
      activityId: true,
      completedAt: true,
      bestScorePercent: true,
    },
  });
  for (const row of progress) {
    const isActivity = row.activityId !== null;
    const points = isActivity ? 5 + Math.round((row.bestScorePercent ?? 60) / 20) : 8;
    const id = await earnPoints({
      schoolId,
      studentId: row.studentId,
      reason: isActivity ? PointsReason.ACTIVITY_COMPLETION : PointsReason.LESSON_COMPLETION,
      points,
      sourceType: 'ProgressRecord',
      sourceId: row.id,
      note: isActivity ? 'Finished an activity.' : 'Finished a lesson.',
      occurredAt: row.completedAt ?? now,
    });
    if (id) count += 1;
  }

  for (const attempt of attempts.attempts) {
    if (attempt.scorePercent === null || attempt.isPractice) continue;
    const points = Math.max(5, Math.min(25, Math.round(attempt.scorePercent / 4)));
    const id = await earnPoints({
      schoolId,
      studentId: attempt.studentId,
      reason: PointsReason.ASSESSMENT_COMPLETION,
      points,
      sourceType: 'AssessmentAttempt',
      sourceId: attempt.id,
      note: `Completed ${attempt.assessmentKey}.`,
      occurredAt: attempt.completedAt ?? attempt.startedAt,
    });
    if (id) count += 1;
  }

  for (const attempt of assignments.attempts) {
    if (attempt.state !== AssignmentState.COMPLETED && attempt.state !== AssignmentState.SUBMITTED) continue;
    const points = attempt.pointsAwarded > 0 ? attempt.pointsAwarded : 10;
    const id = await earnPoints({
      schoolId,
      studentId: attempt.studentId,
      reason: PointsReason.ASSIGNMENT_COMPLETION,
      points,
      sourceType: 'AssignmentAttempt',
      sourceId: attempt.id,
      note: `Handed in "${attempt.assignmentTitle}".`,
      occurredAt: attempt.completedAt ?? attempt.submittedAt ?? now,
    });
    if (id) count += 1;
  }

  const mastered = await prisma.masteryRecord.findMany({
    where: { schoolId, studentId: { in: studentIds }, level: MasteryLevel.MASTERED, objectiveId: null },
    select: { id: true, studentId: true, masteredAt: true, lastEvidenceAt: true },
  });
  for (const row of mastered) {
    const id = await earnPoints({
      schoolId,
      studentId: row.studentId,
      reason: PointsReason.MASTERY_MILESTONE,
      points: 20,
      sourceType: 'MasteryRecord',
      sourceId: row.id,
      note: 'Reached mastery on a topic.',
      occurredAt: row.masteredAt ?? row.lastEvidenceAt,
    });
    if (id) count += 1;
  }

  return count;
}

/**
 * The four `PointsReason` values no piece of evidence ever produces, plus the
 * `REVERSAL` that cancels one of them. See `manualEntriesFor` for which learner
 * gets which row and why the positions are deliberate rather than random.
 */
async function awardManualPoints(schoolId: string, people: PeopleFixture, now: Date): Promise<number> {
  let count = 0;

  for (const [index, student] of people.students.entries()) {
    const plan = manualEntriesFor(student, index);

    if (plan.teacherAward) {
      const entryId = await earnPoints({
        schoolId,
        studentId: student.id,
        reason: PointsReason.TEACHER_AWARD,
        points: plan.teacherAward.points,
        sourceType: 'SeedTeacherAward',
        sourceId: student.id,
        note: plan.teacherAward.note,
        occurredAt: daysAgo(plan.teacherAward.daysAgo, now),
      });
      if (entryId) count += 1;
      if (plan.reverseAward && entryId) {
        const reversed = await reverseIfNeeded(schoolId, entryId, 'Award entered twice by mistake.');
        if (reversed) count += 1;
      }
    }

    if (plan.adjustment) {
      const id = await earnPoints({
        schoolId,
        studentId: student.id,
        reason: PointsReason.MANUAL_ADJUSTMENT,
        points: plan.adjustment.points,
        sourceType: 'SeedAdjustment',
        sourceId: student.id,
        note: plan.adjustment.note,
        occurredAt: daysAgo(plan.adjustment.daysAgo, now),
      });
      if (id) count += 1;
    }

    const onboardingId = await earnPoints({
      schoolId,
      studentId: student.id,
      reason: PointsReason.ONBOARDING_COMPLETION,
      points: plan.onboarding.points,
      sourceType: 'SeedOnboarding',
      sourceId: student.id,
      note: plan.onboarding.note,
      occurredAt: daysAgo(plan.onboarding.daysAgo, now),
    });
    if (onboardingId) count += 1;

    if (plan.streakBonus) {
      const id = await earnPoints({
        schoolId,
        studentId: student.id,
        reason: PointsReason.STREAK_BONUS,
        points: plan.streakBonus.points,
        sourceType: 'SeedStreakBonus',
        sourceId: student.id,
        note: plan.streakBonus.note,
        occurredAt: daysAgo(plan.streakBonus.daysAgo, now),
      });
      if (id) count += 1;
    }
  }

  return count;
}

/**
 * The same pairing `points.service.reverseEntry` writes: the original is stamped
 * `reversedAt`, and a mirror-value entry pointing back at it is created. Guarded on
 * `reversedAt` so a second seed run — which finds the same original id from the now
 * idempotent `earnPoints` call above — writes nothing a second time.
 */
async function reverseIfNeeded(schoolId: string, originalId: string, note: string): Promise<boolean> {
  const original = await prisma.pointsLedger.findUnique({
    where: { id: originalId },
    select: { id: true, studentId: true, points: true, reversedAt: true },
  });
  if (!original || original.reversedAt) return false;

  const now = new Date();
  await prisma.$transaction([
    prisma.pointsLedger.update({
      where: { id: original.id },
      data: { reversedAt: now },
    }),
    prisma.pointsLedger.create({
      data: {
        schoolId,
        studentId: original.studentId,
        reason: PointsReason.REVERSAL,
        points: -original.points,
        sourceType: 'PointsLedger',
        sourceId: original.id,
        note,
        reversesEntryId: original.id,
        occurredAt: now,
      },
    }),
  ]);
  return true;
}

// ── Streaks ─────────────────────────────────────────────────────────────────

/**
 * Replays each learner's synthetic run through the real `recordStreakActivity`,
 * oldest date first — see `engagement.plan.ts` for why the series is explicit
 * rather than derived from the attempt history.
 */
async function seedStreaks(schoolId: string, people: PeopleFixture, now: Date): Promise<number> {
  let updates = 0;
  for (const student of people.students) {
    const runs = RUNS[student.band];
    for (const kind of Object.values(StreakKind)) {
      const [recent, earlier] = runs[kind];
      for (const daysBack of seriesFor(kind, recent, earlier)) {
        await recordStreakActivity(schoolId, student.id, kind, daysAgo(daysBack, now));
        updates += 1;
      }
    }
  }
  return updates;
}

// ── Companions ──────────────────────────────────────────────────────────────

/**
 * One companion per learner, created with a baseline growth figure standing for
 * the history before this seed's evidence window, plus a backdated event history.
 * A small extra growth credit is then routed through the real `growCompanion` so
 * the same path a live learner's work takes is exercised at least once per
 * companion — see `engagement.plan.ts` for why the baseline cannot be built by
 * replaying that call instead.
 */
async function seedCompanions(
  schoolId: string,
  people: PeopleFixture,
  now: Date,
): Promise<{ companions: number; events: number }> {
  const settings = await readSettings(schoolId);
  if (!settings.companionEnabled) return { companions: 0, events: 0 };

  let companions = 0;
  let events = 0;

  for (const [index, student] of people.students.entries()) {
    const baseline = BASELINES[index % BASELINES.length];
    const careStreak = CARE_STREAKS[index % CARE_STREAKS.length];
    const plannedEvents = eventsFor(student, baseline);
    const lastVisitDaysAgo = Math.min(...plannedEvents.map((event) => event.daysAgo));
    const speciesKey = SPECIES[index % SPECIES.length];
    const name = COMPANION_NAMES[index % COMPANION_NAMES.length];

    let companion = await prisma.companion.findUnique({ where: { studentId: student.id } });
    if (!companion) {
      const stage = stageFor(baseline);
      const lastInteractionAt = daysAgo(lastVisitDaysAgo, now);
      const mood = moodFor({ lastInteractionAt, careStreak, stage }, settings.companionDecayEnabled, now);
      const hatchedAt = baseline >= 50 ? daysAgo(hashInt(`hatch-at:${student.code}`, 30, 44), now) : null;
      companion = await prisma.companion.create({
        data: {
          schoolId,
          studentId: student.id,
          speciesKey,
          name,
          stage,
          mood,
          growthPoints: baseline,
          level: levelFor(baseline),
          careStreak,
          lastInteractionAt,
          hatchedAt,
          lastStageChangeAt: hatchedAt,
        },
      });
      companions += 1;
    }

    for (const event of plannedEvents) {
      const existing = await prisma.companionEvent.findFirst({
        where: { companionId: companion.id, sourceType: event.sourceType, sourceId: event.sourceId },
        select: { id: true },
      });
      if (existing) continue;
      const written = await writeEvent(companion.id, {
        kind: event.kind,
        description: event.description,
        growthDelta: event.growthDelta,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        occurredAt: daysAgo(event.daysAgo, now),
      });
      if (written) events += 1;
    }

    // `once` keys this off the student, so a second run credits nothing further.
    await growCompanion({
      schoolId,
      studentId: student.id,
      growthPoints: hashInt(`recent-growth:${student.code}`, 3, 9),
      description: 'You did some learning.',
      kind: 'GROWTH',
      sourceType: 'SeedRecentGrowth',
      sourceId: student.id,
      countsAsVisit: true,
      once: true,
    });
  }

  return { companions, events };
}

// ── Badges ──────────────────────────────────────────────────────────────────

/**
 * Every automatic badge is checked against the evidence just written; the one
 * manual badge in the catalogue (`helping-hand`) is handed out by a teacher to a
 * few learners, because the rules engine refuses to award it by design.
 */
async function sweepBadges(
  schoolId: string,
  people: PeopleFixture,
  badgeByKey: Record<string, AwardableBadge>,
): Promise<number> {
  let awarded = 0;
  for (const student of people.students) {
    awarded += await evaluateBadgesFor(schoolId, student.id);
  }

  const manual = badgeByKey['helping-hand'];
  if (manual) {
    for (const [index, student] of people.students.entries()) {
      if (index % 7 !== 3) continue;
      const result = await grantBadge(manual, schoolId, student.id, {
        awardedById: people.leadTeacherIds[student.classCode] ?? people.teacherIds[0] ?? null,
        reason: 'Helped a classmate understand a tricky topic.',
      });
      if (!result.alreadyHeld) awarded += 1;
    }
  }
  return awarded;
}

// ── Rewards ─────────────────────────────────────────────────────────────────

/**
 * Unlocks the rewards `rewardsFor` plans for each learner, checking the real
 * balance first — `earnPoints` and `evaluateBadgesFor` above have already settled
 * it, so this reads the same figure the shop would.
 */
async function grantRewards(
  schoolId: string,
  people: PeopleFixture,
  rewardByKey: Record<string, { id: string; pointsCost: number }>,
  now: Date,
): Promise<number> {
  let granted = 0;

  for (const [index, student] of people.students.entries()) {
    const balance = await balanceFor(student.id);
    for (const key of rewardsFor(student.band, index)) {
      const reward = rewardByKey[key];
      if (!reward || reward.pointsCost > balance) continue;

      const existing = await prisma.studentReward.findUnique({
        where: { studentId_rewardId: { studentId: student.id, rewardId: reward.id } },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.studentReward.create({
        data: {
          schoolId,
          studentId: student.id,
          rewardId: reward.id,
          pointsSpent: reward.pointsCost,
          unlockedAt: daysAgo(hashInt(`unlock:${student.code}:${key}`, 1, 30), now),
        },
      });
      granted += 1;
    }
  }

  return granted;
}

// ── Missions ────────────────────────────────────────────────────────────────

/** Resolves `TopicRef` against the seeded curriculum by position, not by fixture. */
async function resolveTopicId(
  schoolId: string,
  subjectId: string | undefined,
  gradeId: string | undefined,
  index: number,
): Promise<string | null> {
  if (!subjectId || !gradeId) return null;
  const topics = await prisma.topic.findMany({
    where: { schoolId, subjectId, gradeId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return topics[index]?.id ?? null;
}

/**
 * The mission catalogue, enrolment and settlement, in that order per mission.
 * `settleProgress` measures each row against the real `ProgressRecord`,
 * `AssignmentAttempt`, `TopicEvaluation` and `Streak` rows already on disk, so a
 * mission completes, sits active or lapses exactly as the live job would decide.
 */
async function seedMissionsCatalogue(
  fixture: SchoolFixture,
  people: PeopleFixture,
  badgeByKey: Record<string, AwardableBadge>,
  now: Date,
): Promise<{ missions: number; progress: number; completed: number }> {
  let missions = 0;
  let progress = 0;
  let completed = 0;

  for (const spec of MISSIONS) {
    const classId = spec.classCode ? (fixture.classIds[spec.classCode] ?? null) : null;
    const topicId = spec.topicRef
      ? await resolveTopicId(
          fixture.schoolId,
          fixture.subjectIds[spec.topicRef.subjectKey],
          fixture.gradeIds[spec.topicRef.gradeKey],
          spec.topicRef.index,
        )
      : null;
    const rewardBadgeId = spec.rewardBadgeKey ? (badgeByKey[spec.rewardBadgeKey]?.id ?? null) : null;

    const data = {
      title: spec.title,
      description: spec.description,
      classId,
      topicId,
      goalType: spec.goalType,
      goalTarget: spec.goalTarget,
      pointsReward: spec.pointsReward,
      rewardBadgeId,
      startsAt: daysAgo(spec.startsDaysAgo, now),
      endsAt: spec.endsInDays === null ? null : daysAhead(spec.endsInDays, now),
      isRecurring: spec.isRecurring,
      recurrenceDays: spec.recurrenceDays,
      isActive: spec.isActive,
      autoEnrol: true,
    };

    const mission = await prisma.mission.upsert({
      where: { schoolId_key: { schoolId: fixture.schoolId, key: spec.key } },
      update: data,
      create: { schoolId: fixture.schoolId, key: spec.key, ...data },
      select: MISSION_CORE,
    });
    missions += 1;

    // A draft reaches nobody: matches how `openEligibleMissions` only opens active
    // missions, and leaves the "not published yet" mission with no rows at all.
    if (!mission.isActive) continue;

    const cohort = spec.classCode
      ? people.students.filter((student) => student.classCode === spec.classCode).map((student) => student.id)
      : people.students.map((student) => student.id);

    await ensureEnrolment(mission, cohort, now);

    const rows = await prisma.missionProgress.findMany({
      where: { missionId: mission.id, studentId: { in: cohort } },
      select: PROGRESS_CORE,
    });
    for (const row of rows) {
      const result = await settleProgress(mission, row, now);
      progress += 1;
      if (result.justCompleted) completed += 1;
    }
  }

  return { missions, progress, completed };
}

// ── Leaderboard boards ──────────────────────────────────────────────────────

function scopeIdFor(target: BoardTarget, fixture: SchoolFixture, people: PeopleFixture): string | null {
  switch (target.kind) {
    case 'class':
      return fixture.classIds[target.code] ?? null;
    case 'grade':
      return fixture.gradeIds[target.key] ?? null;
    case 'subject':
      return fixture.subjectIds[target.key] ?? null;
    case 'support-group':
      return people.supportGroupId;
    case 'school':
    default:
      return null;
  }
}

/**
 * Boards are configured whether or not the school switch is on (it is off by
 * design — see `school.seed.ts`), so an administrator who enables leaderboards
 * finds standings already computed rather than an empty page. `recomputeBoard` is
 * the same function the hourly job calls.
 */
async function seedBoards(fixture: SchoolFixture, people: PeopleFixture, now: Date): Promise<number> {
  let computed = 0;

  for (const spec of BOARDS) {
    const scopeId = scopeIdFor(spec.target, fixture, people);
    const data = {
      scope: spec.scope,
      scopeId,
      identityMode: spec.identityMode,
      rankingMode: spec.rankingMode,
      isActive: spec.isActive,
      periodDays: spec.periodDays,
      minParticipants: spec.minParticipants,
      showTopN: spec.showTopN,
      allowOptOut: spec.allowOptOut,
      startsAt: spec.startsDaysAgo === null ? null : daysAgo(spec.startsDaysAgo, now),
      endsAt: spec.endsInDays === null ? null : daysAhead(spec.endsInDays, now),
    };

    const existing = await prisma.leaderboardConfiguration.findFirst({
      where: { schoolId: fixture.schoolId, name: spec.name },
      select: { id: true },
    });
    const config = existing
      ? await prisma.leaderboardConfiguration.update({ where: { id: existing.id }, data, select: CONFIG_CORE })
      : await prisma.leaderboardConfiguration.create({
          data: { schoolId: fixture.schoolId, name: spec.name, ...data },
          select: CONFIG_CORE,
        });

    if (config.isActive) {
      await recomputeBoard(config, now);
      computed += 1;
    }
  }

  return computed;
}

// ── Orchestration ───────────────────────────────────────────────────────────

/**
 * Points, badges, streaks, companions, rewards, missions and leaderboard boards
 * for the demo cohort. Depends on curriculum, content, attempts, evaluation and
 * assignments all having been seeded first: every figure here is measured against
 * evidence those steps wrote, not invented.
 *
 * `content` is accepted for parity with the call site — lesson and activity ids
 * are read back through `ProgressRecord` rather than the fixture, since that is
 * what the badge and mission rules measure against.
 */
export async function seedEngagement(
  fixture: SchoolFixture,
  people: PeopleFixture,
  _content: ContentFixture,
  attempts: AttemptFixture,
  assignments: AssignmentFixture,
  now: Date,
): Promise<EngagementFixture> {
  step('Engagement: points, badges, streaks, companions, missions (blueprint 03)');
  const studentIds = people.students.map((student) => student.id);

  const badgeByKey = await seedBadgeCatalogue(fixture.schoolId);
  const rewardByKey = await seedRewardCatalogue(fixture.schoolId);
  log(`${BADGES.length} badges, ${REWARDS.length} rewards in the catalogue`);

  await awardEvidencePoints(fixture.schoolId, people, attempts, assignments, now);
  await awardManualPoints(fixture.schoolId, people, now);

  // Streak replay evaluates badges as it goes (`recordStreakActivity` calls
  // `evaluateBadgesFor` internally), so most non-manual badges are already awarded
  // by the time the explicit sweep below runs — that sweep exists as a safety net
  // for whatever the replay order missed, not as the primary award path.
  const streakUpdates = await seedStreaks(fixture.schoolId, people, now);
  log(`${streakUpdates} streak updates across ${Object.keys(StreakKind).length} kinds`);

  const { companions, events: companionEvents } = await seedCompanions(fixture.schoolId, people, now);
  log(`${companions} companions adopted, ${companionEvents} history events`);

  await sweepBadges(fixture.schoolId, people, badgeByKey);

  const rewardsGranted = await grantRewards(fixture.schoolId, people, rewardByKey, now);
  log(`${rewardsGranted} rewards unlocked this run`);

  const missionResult = await seedMissionsCatalogue(fixture, people, badgeByKey, now);
  log(
    `${missionResult.missions} missions, ${missionResult.progress} progress rows ` +
      `(${missionResult.completed} completed by this run)`,
  );

  const boardsComputed = await seedBoards(fixture, people, now);
  log(`${BOARDS.length} leaderboard boards configured, ${boardsComputed} recomputed`);

  // Delivers whatever badge/mission/companion notifications the steps above just
  // enqueued, so the inbox shows a realistic mix of delivered and pending.
  await dispatchDueNotifications();

  // Points and badges are written from several places in this file — direct
  // ledger entries, plus `grantBadge` and `settleProgress` firing from inside the
  // streak replay and the mission settlement above — so the honest total is read
  // back from the tables rather than accumulated from each step's own counter.
  const [pointsEntries, badgesAwarded] = await Promise.all([
    prisma.pointsLedger.count({ where: { schoolId: fixture.schoolId, studentId: { in: studentIds } } }),
    prisma.studentBadge.count({ where: { schoolId: fixture.schoolId, revokedAt: null } }),
  ]);
  log(`${pointsEntries} points ledger entries across every PointsReason, ${badgesAwarded} badges held`);

  return {
    badges: BADGES.length,
    rewards: REWARDS.length,
    pointsEntries,
    streakUpdates,
    badgesAwarded,
    companions,
    companionEvents,
    rewardsGranted,
    missions: missionResult.missions,
    missionProgress: missionResult.progress,
    missionsCompleted: missionResult.completed,
    boardsConfigured: BOARDS.length,
    boardsComputed,
  };
}
