// ─────────────────────────────────────────────────────────────────────────────
// Dashboard interpretation rules
// Blueprint 04 states the constraint this whole module is built around: "The
// dashboard should avoid presenting data without a clear interpretation or next
// action." A count on its own ("4 overdue") is not a dashboard; it is homework
// for the reader. So every signal declared here carries three things together —
// what was measured, what it means, and what to do about it — and the type makes
// it impossible to add a fourth signal that omits one of them.
//
// Blueprint 04 also lists positive alerts ("Strong improvement or milestone")
// beside the worrying ones, so a signal declares its `kind`: a celebration must
// never be rendered in the same red block as an overdue pile.
//
// Nothing here touches the database. The services collect counts; this file
// decides what those counts mean, which is why it can be unit-tested — see
// ./dashboard.insights.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// ── Thresholds ──────────────────────────────────────────────────────────────
// One place, named, so "inactive" means the same thing on the teacher dashboard,
// in the attention list and in a notification.

/** A learner is counted as active when they did something in this window. */
export const ACTIVE_WINDOW_DAYS = 7;
/** Quiet for this long is worth a gentle nudge, not an alert. */
export const INACTIVITY_NUDGE_DAYS = 3;
/** Blueprint 04 "significant inactivity". */
export const INACTIVITY_ALERT_DAYS = 7;
/** Long enough that the cause is usually access, not motivation. */
export const INACTIVITY_DORMANT_DAYS = 21;
/** Accuracy at or below this on a topic reads as "not landing yet". */
export const LOW_ACCURACY_PERCENT = 50;
/** Repeating the same activity this many times is blueprint 04 "repeated difficulty". */
export const REPEATED_ATTEMPT_THRESHOLD = 4;
/** Assignment due inside this window is "coming up" rather than "later". */
export const DUE_SOON_DAYS = 3;

export function daysSince(when: Date | null, now: Date): number | null {
  if (!when) return null;
  return Math.floor((now.getTime() - when.getTime()) / DAY_MS);
}

/**
 * Monday 00:00 in server time — the boundary the weekly goal and "this week"
 * counts share. A learner who logs in on Monday morning should see a fresh week,
 * so the week does not start on Sunday.
 */
export function startOfWeek(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

// ── Engagement bands ────────────────────────────────────────────────────────

export const ENGAGEMENT_LEVELS = [
  'NEVER_STARTED',
  'ACTIVE',
  'SLOWING',
  'INACTIVE',
  'DORMANT',
] as const;
export type EngagementLevel = (typeof ENGAGEMENT_LEVELS)[number];

export interface EngagementReading {
  level: EngagementLevel;
  daysSinceActivity: number | null;
  /** Plain-language reading, written for a teacher skimming a list. */
  label: string;
}

/**
 * Turns "when did this learner last do anything" into a band. Deliberately
 * coarse: a dashboard that distinguishes 4 days from 5 invites a teacher to
 * study it, and blueprint 04 asks for monitoring that reduces uncertainty
 * rather than adding reporting burden.
 */
export function engagementReading(lastActivityAt: Date | null, now = new Date()): EngagementReading {
  const days = daysSince(lastActivityAt, now);
  if (days === null) {
    return { level: 'NEVER_STARTED', daysSinceActivity: null, label: 'Has not started yet.' };
  }
  if (days >= INACTIVITY_DORMANT_DAYS) {
    return { level: 'DORMANT', daysSinceActivity: days, label: `No activity for ${days} days.` };
  }
  if (days >= INACTIVITY_ALERT_DAYS) {
    return { level: 'INACTIVE', daysSinceActivity: days, label: `Quiet for ${days} days.` };
  }
  if (days >= INACTIVITY_NUDGE_DAYS) {
    return { level: 'SLOWING', daysSinceActivity: days, label: `Last active ${days} days ago.` };
  }
  return {
    level: 'ACTIVE',
    daysSinceActivity: days,
    label: days <= 0 ? 'Active today.' : `Active ${days} day${days === 1 ? '' : 's'} ago.`,
  };
}

// ── Completion bands ────────────────────────────────────────────────────────

export const COMPLETION_BANDS = ['STRONG', 'ON_TRACK', 'PATCHY', 'AT_RISK', 'NO_DATA'] as const;
export type CompletionBand = (typeof COMPLETION_BANDS)[number];

export interface CompletionReading {
  band: CompletionBand;
  percent: number | null;
  label: string;
}

/**
 * Assignment or activity completion, read as a band rather than shown raw.
 * `total === 0` is NO_DATA, never 0% — "nothing was set" and "nothing was done"
 * are different messages and the second one is unfair.
 */
export function completionReading(completed: number, total: number): CompletionReading {
  if (total <= 0) return { band: 'NO_DATA', percent: null, label: 'Nothing set yet.' };
  const percent = Math.round((completed / total) * 100);
  if (percent >= 85) {
    return { band: 'STRONG', percent, label: `${percent}% complete across the class.` };
  }
  if (percent >= 60) {
    return { band: 'ON_TRACK', percent, label: `${percent}% complete, a few still to finish.` };
  }
  if (percent >= 30) {
    return { band: 'PATCHY', percent, label: `${percent}% complete, most of the class is behind.` };
  }
  return { band: 'AT_RISK', percent, label: `Only ${percent}% complete. Check whether it landed.` };
}

// ── Signals: measurement, meaning, and the next action ──────────────────────

export const SIGNAL_REASONS = [
  'OVERDUE_WORK',
  'REPEATED_DIFFICULTY',
  'DORMANT',
  'INACTIVE',
  'NO_MASTERY_EVIDENCE',
  'PLACEMENT_INCOMPLETE',
  'DUE_SOON',
  'STRONG_IMPROVEMENT',
  'MILESTONE',
] as const;
export type SignalReason = (typeof SIGNAL_REASONS)[number];

export const SIGNAL_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

/** Ranking weight. Blueprint 04: "Alerts should be prioritized by actionability." */
export const SEVERITY_WEIGHT: Record<SignalSeverity, number> = {
  HIGH: 40,
  MEDIUM: 30,
  LOW: 20,
  INFO: 10,
};

export interface SignalSpec {
  reason: SignalReason;
  /** A celebration is never shown as a problem, however it is ranked. */
  kind: 'CONCERN' | 'CELEBRATION';
  severity: SignalSeverity;
  /** Card label, no numbers — the count goes in the interpretation. */
  label: string;
  /** What the measurement means. `{count}` is substituted with the number. */
  interpretation: string;
  /** What to do about it. Never empty: a signal with no action is noise. */
  nextAction: string;
  /** Where the action happens, so the card can be a link. */
  actionPath: string;
}

export const SIGNAL_SPECS: Record<SignalReason, SignalSpec> = {
  OVERDUE_WORK: {
    reason: 'OVERDUE_WORK',
    kind: 'CONCERN',
    severity: 'HIGH',
    label: 'Overdue work',
    interpretation: '{count} assignment(s) are past their due date and not submitted.',
    nextAction: 'Review the assignments, then extend, excuse or follow up with the learner.',
    actionPath: '/teacher/assignments',
  },
  REPEATED_DIFFICULTY: {
    reason: 'REPEATED_DIFFICULTY',
    kind: 'CONCERN',
    severity: 'HIGH',
    label: 'Repeated difficulty',
    interpretation:
      '{count} topic(s) show low accuracy after several attempts, so practice alone is not working.',
    nextAction: 'Open the topic evidence and decide whether to reteach, adjust the path or intervene.',
    actionPath: '/teacher/students',
  },
  DORMANT: {
    reason: 'DORMANT',
    kind: 'CONCERN',
    severity: 'HIGH',
    label: 'Dormant learner',
    interpretation: 'No activity for {count} days, which is usually access rather than motivation.',
    nextAction: 'Check the account status and sign-in method before assuming disengagement.',
    actionPath: '/teacher/students',
  },
  INACTIVE: {
    reason: 'INACTIVE',
    kind: 'CONCERN',
    severity: 'MEDIUM',
    label: 'Significant inactivity',
    interpretation: 'Nothing completed for {count} days.',
    nextAction: 'Set one short activity to restart the habit, or ask what got in the way.',
    actionPath: '/teacher/students',
  },
  NO_MASTERY_EVIDENCE: {
    reason: 'NO_MASTERY_EVIDENCE',
    kind: 'CONCERN',
    severity: 'MEDIUM',
    label: 'No mastery evidence',
    interpretation:
      'Activity is being recorded but there is no assessment evidence yet, so mastery is unknown.',
    nextAction: 'Set a short topic check, or record your own judgment as evidence.',
    actionPath: '/teacher/students',
  },
  PLACEMENT_INCOMPLETE: {
    reason: 'PLACEMENT_INCOMPLETE',
    kind: 'CONCERN',
    severity: 'MEDIUM',
    label: 'Placement incomplete',
    interpretation: 'The screening assessment has not been completed, so the path is a guess.',
    nextAction: 'Ask the learner to finish screening, or place them manually.',
    actionPath: '/teacher/learning-paths',
  },
  DUE_SOON: {
    reason: 'DUE_SOON',
    kind: 'CONCERN',
    severity: 'LOW',
    label: 'Work due soon',
    interpretation: '{count} assignment(s) are due within the next few days and not yet started.',
    nextAction: 'A reminder now is cheaper than chasing an overdue pile later.',
    actionPath: '/teacher/assignments',
  },
  STRONG_IMPROVEMENT: {
    reason: 'STRONG_IMPROVEMENT',
    kind: 'CELEBRATION',
    severity: 'INFO',
    label: 'Strong improvement',
    interpretation: '{count} topic(s) moved up a mastery level recently.',
    nextAction: 'Say so. Recognition costs nothing and blueprint 03 asks for positive motivation.',
    actionPath: '/teacher/students',
  },
  MILESTONE: {
    reason: 'MILESTONE',
    kind: 'CELEBRATION',
    severity: 'INFO',
    label: 'Recent achievement',
    interpretation: '{count} badge(s) or mission(s) completed in the last week.',
    nextAction: 'Acknowledge it in class, or leave a note on the learner record.',
    actionPath: '/teacher/students',
  },
};

export function signalSpec(reason: SignalReason): SignalSpec {
  return SIGNAL_SPECS[reason];
}

export interface StudentSignal {
  reason: SignalReason;
  kind: SignalSpec['kind'];
  severity: SignalSeverity;
  label: string;
  /** The measurement that triggered this signal. */
  count: number;
  interpretation: string;
  nextAction: string;
  actionPath: string;
  weight: number;
}

function buildSignal(reason: SignalReason, count: number): StudentSignal {
  const spec = signalSpec(reason);
  return {
    reason: spec.reason,
    kind: spec.kind,
    severity: spec.severity,
    label: spec.label,
    count,
    interpretation: spec.interpretation.replace('{count}', String(count)),
    nextAction: spec.nextAction,
    actionPath: spec.actionPath,
    weight: SEVERITY_WEIGHT[spec.severity],
  };
}

/** What a service must collect for one learner before this file can interpret it. */
export interface StudentSignalInput {
  lastActivityAt: Date | null;
  overdueCount: number;
  dueSoonNotStartedCount: number;
  strugglingTopics: number;
  masteryEvidenceCount: number;
  activityCount: number;
  screeningCompleted: boolean;
  improvedTopics: number;
  achievementsLast7Days: number;
}

/**
 * The ranked reasons this learner is on a teacher screen at all.
 *
 * Sorted most actionable first, and capped by the caller rather than here — a
 * learner with six signals still has six real signals, and hiding them in this
 * function would hide them from the notification path too.
 *
 * "No mastery evidence" is only raised once there *is* activity: telling a
 * teacher that a learner who has not started has no evidence is a tautology,
 * and the inactivity signal already says the useful part.
 */
export function evaluateStudentSignals(
  input: StudentSignalInput,
  now = new Date(),
): StudentSignal[] {
  const signals: StudentSignal[] = [];
  const engagement = engagementReading(input.lastActivityAt, now);
  const quietDays = engagement.daysSinceActivity ?? 0;

  if (input.overdueCount > 0) signals.push(buildSignal('OVERDUE_WORK', input.overdueCount));
  if (input.strugglingTopics > 0) {
    signals.push(buildSignal('REPEATED_DIFFICULTY', input.strugglingTopics));
  }
  if (engagement.level === 'DORMANT') signals.push(buildSignal('DORMANT', quietDays));
  else if (engagement.level === 'INACTIVE') signals.push(buildSignal('INACTIVE', quietDays));

  if (input.activityCount > 0 && input.masteryEvidenceCount === 0) {
    signals.push(buildSignal('NO_MASTERY_EVIDENCE', 0));
  }
  if (!input.screeningCompleted) signals.push(buildSignal('PLACEMENT_INCOMPLETE', 0));
  if (input.dueSoonNotStartedCount > 0) {
    signals.push(buildSignal('DUE_SOON', input.dueSoonNotStartedCount));
  }
  if (input.improvedTopics > 0) signals.push(buildSignal('STRONG_IMPROVEMENT', input.improvedTopics));
  if (input.achievementsLast7Days > 0) {
    signals.push(buildSignal('MILESTONE', input.achievementsLast7Days));
  }

  const order = new Map(SIGNAL_REASONS.map((reason, index) => [reason, index]));
  return signals.sort(
    (a, b) => b.weight - a.weight || (order.get(a.reason) ?? 0) - (order.get(b.reason) ?? 0),
  );
}

/** True when a learner belongs on the "needs attention" card rather than the roll. */
export function needsAttention(signals: readonly StudentSignal[]): boolean {
  return signals.some((signal) => signal.kind === 'CONCERN' && signal.severity !== 'LOW');
}

/** The single line a teacher reads first. Empty list means "nothing to raise". */
export function headlineSignal(signals: readonly StudentSignal[]): StudentSignal | null {
  return signals.find((signal) => signal.kind === 'CONCERN') ?? signals[0] ?? null;
}

// ── The learner side: one obvious next action ────────────────────────────────
// Blueprint 03 UX rule: "The student must always understand where they are, what
// they can do next, how they are progressing, and why the next activity matters."
// So the student dashboard returns exactly one primary action, with the "why"
// attached, and the rest of the screen is context for it.

export const LEARNER_ACTIONS = [
  'FINISH_SCREENING',
  'FINISH_OVERDUE',
  'RESUME_ACTIVITY',
  'START_ASSIGNMENT',
  'CONTINUE_PATH',
  'FINISH_MISSION',
  'PRACTISE_TOPIC',
  'EXPLORE',
] as const;
export type LearnerActionKind = (typeof LEARNER_ACTIONS)[number];

export interface LearnerAction {
  kind: LearnerActionKind;
  /** Button text, written for the age of the reader by the theme, not here. */
  label: string;
  /** Blueprint 03: why this one matters. Shown next to the button. */
  reason: string;
  /** The id the client needs to open it, when the action points at one thing. */
  targetId: string | null;
  targetType: 'ACTIVITY' | 'ASSIGNMENT' | 'PATH_ITEM' | 'MISSION' | 'TOPIC' | 'ASSESSMENT' | null;
}

export interface LearnerActionInput {
  screeningCompleted: boolean;
  screeningAssessmentId: string | null;
  overdueAssignmentId: string | null;
  resumableActivityId: string | null;
  openAssignmentId: string | null;
  nextPathItemId: string | null;
  nearlyDoneMissionId: string | null;
  weakestTopicId: string | null;
}

/**
 * Resolves the one action to offer, in a fixed order of usefulness.
 *
 * Order matters more than cleverness here: an unfinished screening makes every
 * later recommendation a guess, and overdue work is the only thing a learner is
 * actually late for. Everything after that is genuinely optional, so the reasons
 * stay encouraging rather than corrective — blueprint 03 forbids shaming
 * comparison and harsh punishment in the learner experience.
 */
export function nextLearnerAction(input: LearnerActionInput): LearnerAction {
  if (!input.screeningCompleted && input.screeningAssessmentId) {
    return {
      kind: 'FINISH_SCREENING',
      label: 'Finish your check-in',
      reason: 'It shows us what to give you next, so nothing is too easy or too hard.',
      targetId: input.screeningAssessmentId,
      targetType: 'ASSESSMENT',
    };
  }
  if (input.overdueAssignmentId) {
    return {
      kind: 'FINISH_OVERDUE',
      label: 'Finish your homework',
      reason: 'This one was due already. Finishing it now is enough.',
      targetId: input.overdueAssignmentId,
      targetType: 'ASSIGNMENT',
    };
  }
  if (input.resumableActivityId) {
    return {
      kind: 'RESUME_ACTIVITY',
      label: 'Continue learning',
      reason: 'You already started this, so you are part of the way there.',
      targetId: input.resumableActivityId,
      targetType: 'ACTIVITY',
    };
  }
  if (input.openAssignmentId) {
    return {
      kind: 'START_ASSIGNMENT',
      label: 'Start your task',
      reason: 'Your teacher set this for you.',
      targetId: input.openAssignmentId,
      targetType: 'ASSIGNMENT',
    };
  }
  if (input.nextPathItemId) {
    return {
      kind: 'CONTINUE_PATH',
      label: 'Next on your path',
      reason: 'This is the next step your teacher approved.',
      targetId: input.nextPathItemId,
      targetType: 'PATH_ITEM',
    };
  }
  if (input.nearlyDoneMissionId) {
    return {
      kind: 'FINISH_MISSION',
      label: 'Finish your mission',
      reason: 'You are close to completing this one.',
      targetId: input.nearlyDoneMissionId,
      targetType: 'MISSION',
    };
  }
  if (input.weakestTopicId) {
    return {
      kind: 'PRACTISE_TOPIC',
      label: 'Practise a tricky topic',
      reason: 'A little practice here will make the next lessons easier.',
      targetId: input.weakestTopicId,
      targetType: 'TOPIC',
    };
  }
  return {
    kind: 'EXPLORE',
    label: 'Explore your subjects',
    reason: 'You are up to date. Pick something that looks interesting.',
    targetId: null,
    targetType: null,
  };
}

export interface WeeklyGoalReading {
  targetMinutes: number;
  minutesLearned: number;
  percent: number;
  reached: boolean;
  label: string;
}

/**
 * Weekly learning-time goal, phrased so that a low number is an invitation
 * rather than a reprimand. Percent is capped at 100 so a keen week does not
 * produce a 340% bar, and a zero target reads as "no goal set" instead of
 * dividing by zero.
 */
export function weeklyGoalReading(minutesLearned: number, targetMinutes: number): WeeklyGoalReading {
  const minutes = Math.max(0, Math.round(minutesLearned));
  if (targetMinutes <= 0) {
    return {
      targetMinutes: 0,
      minutesLearned: minutes,
      percent: 0,
      reached: false,
      label: `${minutes} minutes of learning this week.`,
    };
  }
  const percent = Math.min(100, Math.round((minutes / targetMinutes) * 100));
  if (percent >= 100) {
    return {
      targetMinutes,
      minutesLearned: minutes,
      percent,
      reached: true,
      label: `Weekly goal reached — ${minutes} minutes.`,
    };
  }
  if (minutes === 0) {
    return {
      targetMinutes,
      minutesLearned: 0,
      percent: 0,
      reached: false,
      label: 'A good moment to start this week.',
    };
  }
  return {
    targetMinutes,
    minutesLearned: minutes,
    percent,
    reached: false,
    label: `${minutes} of ${targetMinutes} minutes this week.`,
  };
}



