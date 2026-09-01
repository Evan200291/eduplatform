import { describe, expect, it } from 'vitest';
import {
  ACTIVE_WINDOW_DAYS,
  INACTIVITY_ALERT_DAYS,
  INACTIVITY_DORMANT_DAYS,
  INACTIVITY_NUDGE_DAYS,
  SIGNAL_REASONS,
  SIGNAL_SPECS,
  completionReading,
  daysSince,
  engagementReading,
  evaluateStudentSignals,
  headlineSignal,
  needsAttention,
  nextLearnerAction,
  signalSpec,
  startOfWeek,
  weeklyGoalReading,
} from './dashboard.insights';
import type { LearnerActionInput, StudentSignalInput } from './dashboard.insights';

const NOW = new Date('2026-05-20T09:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

// ── Engagement ──────────────────────────────────────────────────────────────

describe('engagementReading', () => {
  it('separates "has not started" from "has stopped"', () => {
    const never = engagementReading(null, NOW);
    expect(never.level).toBe('NEVER_STARTED');
    expect(never.daysSinceActivity).toBeNull();
    expect(engagementReading(daysAgo(30), NOW).level).toBe('DORMANT');
  });

  it('bands the quiet time at the declared thresholds', () => {
    expect(engagementReading(daysAgo(0), NOW).level).toBe('ACTIVE');
    expect(engagementReading(daysAgo(INACTIVITY_NUDGE_DAYS - 1), NOW).level).toBe('ACTIVE');
    expect(engagementReading(daysAgo(INACTIVITY_NUDGE_DAYS), NOW).level).toBe('SLOWING');
    expect(engagementReading(daysAgo(INACTIVITY_ALERT_DAYS - 1), NOW).level).toBe('SLOWING');
    expect(engagementReading(daysAgo(INACTIVITY_ALERT_DAYS), NOW).level).toBe('INACTIVE');
    expect(engagementReading(daysAgo(INACTIVITY_DORMANT_DAYS - 1), NOW).level).toBe('INACTIVE');
    expect(engagementReading(daysAgo(INACTIVITY_DORMANT_DAYS), NOW).level).toBe('DORMANT');
  });

  it('keeps the active window inside the nudge threshold, so "active" is never also "slowing"', () => {
    expect(ACTIVE_WINDOW_DAYS).toBeGreaterThanOrEqual(INACTIVITY_NUDGE_DAYS);
  });

  it('reads a future timestamp as active rather than as negative days of silence', () => {
    const reading = engagementReading(new Date(NOW.getTime() + 60_000), NOW);
    expect(reading.level).toBe('ACTIVE');
    expect(reading.label).toBe('Active today.');
  });

  it('counts whole elapsed days only', () => {
    expect(daysSince(daysAgo(2), NOW)).toBe(2);
    expect(daysSince(new Date(NOW.getTime() - DAY - 1000), NOW)).toBe(1);
    expect(daysSince(null, NOW)).toBeNull();
  });
});

// ── Completion ──────────────────────────────────────────────────────────────

describe('completionReading', () => {
  it('never reports 0% when nothing was set', () => {
    const reading = completionReading(0, 0);
    expect(reading.band).toBe('NO_DATA');
    expect(reading.percent).toBeNull();
    expect(reading.label).toBe('Nothing set yet.');
  });

  it('bands the percentage and always says what it means', () => {
    expect(completionReading(10, 10).band).toBe('STRONG');
    expect(completionReading(17, 20).band).toBe('STRONG');
    expect(completionReading(13, 20).band).toBe('ON_TRACK');
    expect(completionReading(8, 20).band).toBe('PATCHY');
    expect(completionReading(1, 20).band).toBe('AT_RISK');
    for (const [done, total] of [
      [10, 10],
      [13, 20],
      [8, 20],
      [1, 20],
    ] as const) {
      expect(completionReading(done, total).label.length).toBeGreaterThan(10);
    }
  });

  it('rounds rather than truncating', () => {
    expect(completionReading(2, 3).percent).toBe(67);
  });
});

// ── Signal catalogue ────────────────────────────────────────────────────────

describe('signal specs', () => {
  it('gives every signal an interpretation and a next action', () => {
    // Blueprint 04: no data without a reading and something to do about it.
    for (const reason of SIGNAL_REASONS) {
      const spec = signalSpec(reason);
      expect(spec.reason).toBe(reason);
      expect(spec.label.length).toBeGreaterThan(3);
      expect(spec.interpretation.length).toBeGreaterThan(20);
      expect(spec.nextAction.length).toBeGreaterThan(20);
      expect(spec.actionPath.startsWith('/')).toBe(true);
    }
  });

  it('is keyed by the reason list, so a new reason cannot be undefined', () => {
    expect(Object.keys(SIGNAL_SPECS).sort()).toEqual([...SIGNAL_REASONS].sort());
  });

  it('never ranks a celebration above a concern', () => {
    const concerns = SIGNAL_REASONS.map(signalSpec).filter((spec) => spec.kind === 'CONCERN');
    const celebrations = SIGNAL_REASONS.map(signalSpec).filter((spec) => spec.kind === 'CELEBRATION');
    expect(celebrations.length).toBeGreaterThan(0);
    for (const celebration of celebrations) expect(celebration.severity).toBe('INFO');
    for (const concern of concerns) expect(concern.severity).not.toBe('INFO');
  });
});

// ── Signal evaluation ───────────────────────────────────────────────────────

const settled: StudentSignalInput = {
  lastActivityAt: daysAgo(1),
  overdueCount: 0,
  dueSoonNotStartedCount: 0,
  strugglingTopics: 0,
  masteryEvidenceCount: 4,
  activityCount: 12,
  screeningCompleted: true,
  improvedTopics: 0,
  achievementsLast7Days: 0,
};

describe('evaluateStudentSignals', () => {
  it('raises nothing for a learner who is simply getting on with it', () => {
    expect(evaluateStudentSignals(settled, NOW)).toEqual([]);
    expect(needsAttention([])).toBe(false);
    expect(headlineSignal([])).toBeNull();
  });

  it('substitutes the measurement into the interpretation', () => {
    const [signal] = evaluateStudentSignals({ ...settled, overdueCount: 3 }, NOW);
    expect(signal?.reason).toBe('OVERDUE_WORK');
    expect(signal?.count).toBe(3);
    expect(signal?.interpretation).toContain('3 assignment');
    expect(signal?.interpretation).not.toContain('{count}');
  });

  it('ranks the most actionable signal first', () => {
    const signals = evaluateStudentSignals(
      {
        ...settled,
        lastActivityAt: daysAgo(9),
        overdueCount: 2,
        dueSoonNotStartedCount: 1,
        achievementsLast7Days: 2,
      },
      NOW,
    );
    expect(signals.map((signal) => signal.reason)).toEqual([
      'OVERDUE_WORK',
      'INACTIVE',
      'DUE_SOON',
      'MILESTONE',
    ]);
  });

  it('reports dormant instead of inactive, never both', () => {
    const signals = evaluateStudentSignals({ ...settled, lastActivityAt: daysAgo(40) }, NOW);
    const reasons = signals.map((signal) => signal.reason);
    expect(reasons).toContain('DORMANT');
    expect(reasons).not.toContain('INACTIVE');
    expect(signals[0]?.count).toBe(40);
  });

  it('does not tell a teacher that a learner who never started has no evidence', () => {
    const signals = evaluateStudentSignals(
      { ...settled, lastActivityAt: null, activityCount: 0, masteryEvidenceCount: 0 },
      NOW,
    );
    expect(signals.map((signal) => signal.reason)).not.toContain('NO_MASTERY_EVIDENCE');
  });

  it('raises missing evidence once there is activity to have evidence about', () => {
    const signals = evaluateStudentSignals({ ...settled, masteryEvidenceCount: 0 }, NOW);
    expect(signals.map((signal) => signal.reason)).toEqual(['NO_MASTERY_EVIDENCE']);
  });

  it('treats an unfinished screening as worth raising on its own', () => {
    const signals = evaluateStudentSignals({ ...settled, screeningCompleted: false }, NOW);
    expect(signals.map((signal) => signal.reason)).toEqual(['PLACEMENT_INCOMPLETE']);
    expect(needsAttention(signals)).toBe(true);
  });

  it('keeps good news out of the attention list', () => {
    const signals = evaluateStudentSignals(
      { ...settled, improvedTopics: 2, achievementsLast7Days: 1 },
      NOW,
    );
    expect(signals.every((signal) => signal.kind === 'CELEBRATION')).toBe(true);
    expect(needsAttention(signals)).toBe(false);
    expect(headlineSignal(signals)?.reason).toBe('STRONG_IMPROVEMENT');
  });

  it('does not promote work due soon into an attention case on its own', () => {
    const signals = evaluateStudentSignals({ ...settled, dueSoonNotStartedCount: 2 }, NOW);
    expect(signals.map((signal) => signal.reason)).toEqual(['DUE_SOON']);
    expect(needsAttention(signals)).toBe(false);
  });

  it('prefers a concern over a celebration for the headline', () => {
    const signals = evaluateStudentSignals(
      { ...settled, overdueCount: 1, achievementsLast7Days: 3 },
      NOW,
    );
    expect(headlineSignal(signals)?.reason).toBe('OVERDUE_WORK');
  });
});

// ── Learner next action ─────────────────────────────────────────────────────

const idle: LearnerActionInput = {
  screeningCompleted: true,
  screeningAssessmentId: null,
  overdueAssignmentId: null,
  resumableActivityId: null,
  openAssignmentId: null,
  nextPathItemId: null,
  nearlyDoneMissionId: null,
  weakestTopicId: null,
};

describe('nextLearnerAction', () => {
  it('always offers something, with a reason attached', () => {
    const action = nextLearnerAction(idle);
    expect(action.kind).toBe('EXPLORE');
    expect(action.reason.length).toBeGreaterThan(10);
    expect(action.targetId).toBeNull();
    expect(action.targetType).toBeNull();
  });

  it('puts screening first, because everything after it depends on placement', () => {
    const action = nextLearnerAction({
      ...idle,
      screeningCompleted: false,
      screeningAssessmentId: 'asm1',
      overdueAssignmentId: 'as1',
      resumableActivityId: 'act1',
    });
    expect(action.kind).toBe('FINISH_SCREENING');
    expect(action.targetId).toBe('asm1');
    expect(action.targetType).toBe('ASSESSMENT');
  });

  it('does not block a learner when screening is unfinished but unavailable', () => {
    const action = nextLearnerAction({
      ...idle,
      screeningCompleted: false,
      screeningAssessmentId: null,
      resumableActivityId: 'act1',
    });
    expect(action.kind).toBe('RESUME_ACTIVITY');
  });

  it('follows the declared order of usefulness', () => {
    const full: LearnerActionInput = {
      screeningCompleted: true,
      screeningAssessmentId: 'asm1',
      overdueAssignmentId: 'over1',
      resumableActivityId: 'act1',
      openAssignmentId: 'open1',
      nextPathItemId: 'item1',
      nearlyDoneMissionId: 'mis1',
      weakestTopicId: 'top1',
    };
    expect(nextLearnerAction(full).kind).toBe('FINISH_OVERDUE');
    expect(nextLearnerAction({ ...full, overdueAssignmentId: null }).kind).toBe('RESUME_ACTIVITY');
    expect(
      nextLearnerAction({ ...full, overdueAssignmentId: null, resumableActivityId: null }).kind,
    ).toBe('START_ASSIGNMENT');
    expect(
      nextLearnerAction({
        ...full,
        overdueAssignmentId: null,
        resumableActivityId: null,
        openAssignmentId: null,
      }).kind,
    ).toBe('CONTINUE_PATH');
    expect(
      nextLearnerAction({ ...idle, nearlyDoneMissionId: 'mis1', weakestTopicId: 'top1' }).kind,
    ).toBe('FINISH_MISSION');
    expect(nextLearnerAction({ ...idle, weakestTopicId: 'top1' }).kind).toBe('PRACTISE_TOPIC');
  });

  it('phrases late work without blame', () => {
    const action = nextLearnerAction({ ...idle, overdueAssignmentId: 'over1' });
    expect(action.reason).toBe('This one was due already. Finishing it now is enough.');
  });
});

// ── Weekly goal ─────────────────────────────────────────────────────────────

describe('weeklyGoalReading', () => {
  it('caps a keen week at 100 per cent', () => {
    const reading = weeklyGoalReading(240, 60);
    expect(reading.percent).toBe(100);
    expect(reading.reached).toBe(true);
    expect(reading.minutesLearned).toBe(240);
  });

  it('treats no target as no goal rather than dividing by zero', () => {
    const reading = weeklyGoalReading(15, 0);
    expect(reading.percent).toBe(0);
    expect(reading.reached).toBe(false);
    expect(Number.isFinite(reading.percent)).toBe(true);
  });

  it('invites rather than scolds at zero minutes', () => {
    expect(weeklyGoalReading(0, 60).label).toBe('A good moment to start this week.');
  });

  it('reports progress toward the goal', () => {
    const reading = weeklyGoalReading(30, 60);
    expect(reading.percent).toBe(50);
    expect(reading.label).toBe('30 of 60 minutes this week.');
  });

  it('never reports negative minutes', () => {
    expect(weeklyGoalReading(-10, 60).minutesLearned).toBe(0);
  });
});

describe('startOfWeek', () => {
  it('rolls a midweek moment back to Monday midnight', () => {
    // 2026-04-01 is a Wednesday.
    const start = startOfWeek(new Date(2026, 3, 1, 14, 37, 12));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(30);
    expect(start.getMonth()).toBe(2);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-04-05 is a Sunday; its week began on Monday 2026-03-30.
    const start = startOfWeek(new Date(2026, 3, 5, 9, 0, 0));
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(30);
  });

  it('leaves a Monday morning on its own day', () => {
    const start = startOfWeek(new Date(2026, 3, 6, 8, 15, 0));
    expect(start.getDate()).toBe(6);
    expect(start.getHours()).toBe(0);
  });

  it('does not mutate the date it was given', () => {
    const now = new Date(2026, 3, 1, 14, 0, 0);
    startOfWeek(now);
    expect(now.getDate()).toBe(1);
    expect(now.getHours()).toBe(14);
  });
});
