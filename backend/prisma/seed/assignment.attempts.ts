// ─────────────────────────────────────────────────────────────────────────────
// Seed plan — assignment attempts
// Split out of `assignment.plan.ts`, which decides which assignments exist; this
// file decides what each learner did with one. Pure — `assignment.seed.ts` writes
// the rows.
//
// The state of an attempt is chosen in two steps, and the order is the point.
// First an *intent* is placed by position, so all six `AssignmentState` values
// appear across the run rather than depending on a probability that could miss
// one in a cohort this size. Then the product's own deadline rules are applied to
// it: `evaluateLateness` decides the late flag, and outstanding work past its
// overdue moment is left exactly where the sweep in `assignments.jobs.ts` would
// leave it. Nothing here invents a state the API could not produce.
// ─────────────────────────────────────────────────────────────────────────────

import { AssignmentState, LateBehavior } from '@prisma/client';

import { evaluateLateness } from '../../src/modules/assignments/assignments.attempts.service';
import { daysAgo, daysAhead, hashInt } from './helpers';
import type { PlannedAssignment } from './assignment.plan';
import type { SeededAttempt } from './attempts.seed';
import type { DemoStudent } from './people.seed';

export interface PlannedAttempt {
  studentId: string;
  attemptNumber: number;
  state: AssignmentState;
  startedAt: Date | null;
  submittedAt: Date | null;
  completedAt: Date | null;
  isLate: boolean;
  scorePercent: number | null;
  pointsAwarded: number;
  timeSpentSeconds: number;
  assessmentAttemptId: string | null;
  excusedById: string | null;
  excusedAt: Date | null;
  excusedReason: string | null;
  teacherFeedback: string | null;
  feedbackById: string | null;
  feedbackAt: Date | null;
}


const INTENTS: readonly AssignmentState[] = [
  AssignmentState.COMPLETED,
  AssignmentState.IN_PROGRESS,
  AssignmentState.SUBMITTED,
  AssignmentState.NOT_STARTED,
  AssignmentState.EXCUSED,
  AssignmentState.COMPLETED,
];

const SCORE_BANDS: Record<DemoStudent['band'], readonly [number, number]> = {
  thriving: [82, 98],
  steady: [58, 86],
  'needs-support': [34, 68],
};

const EXCUSE_REASONS: readonly string[] = [
  'Away with a medical appointment. Excused so the missed work does not read as a gap in what they know.',
  'Family bereavement. Excused for the week; we will pick the topic up together when they are ready.',
  'Attended the county spelling final on the day this was due.',
];

const FEEDBACK: readonly string[] = [
  'Clear working all the way through, and you showed your method rather than only the answer. Next time, check the last line before you hand in.',
  'Good effort on the harder items. Look again at the two you left blank — you knew the first step, you just stopped early.',
  'This is a real improvement on last week. The part you found hardest is the part you explained best.',
];

/**
 * The assignment columns `evaluateLateness` reads. `id`, `schoolId` and
 * `createdById` are in the select it was typed against but are never read by the
 * rules, so placeholders are passed rather than threading real ids through a
 * pure planner.
 */
function workFor(assignment: PlannedAssignment) {
  return {
    id: 'planned',
    schoolId: 'planned',
    createdById: 'planned',
    title: assignment.title,
    isPublished: assignment.isPublished,
    archivedAt: assignment.archivedAt,
    availableFrom: assignment.availableFrom,
    dueAt: assignment.dueAt,
    lateBehavior: assignment.lateBehavior,
    graceHours: assignment.graceHours,
    allowResubmission: assignment.allowResubmission,
    maxAttempts: assignment.maxAttempts,
    pointsValue: assignment.pointsValue,
  };
}

/**
 * The moment outstanding work becomes OVERDUE. Mirrors the private `overdueFrom`
 * in `src/modules/assignments/assignments.jobs.ts` — three lines, and the only
 * rule in this file not imported from the product.
 */
function overdueFrom(assignment: PlannedAssignment): Date | null {
  if (!assignment.dueAt) return null;
  const grace =
    assignment.lateBehavior === LateBehavior.ALLOW_UNTIL_GRACE_END
      ? assignment.graceHours * 3_600_000
      : 0;
  return new Date(assignment.dueAt.getTime() + grace);
}

/** Points, by exactly the arithmetic `submitAssignment` uses. */
function pointsFor(pointsValue: number, scorePercent: number | null): number {
  if (pointsValue <= 0) return 0;
  return scorePercent === null ? pointsValue : Math.round((pointsValue * scorePercent) / 100);
}

export interface AttemptPlanInput {
  assignment: PlannedAssignment;
  /** Learners the target list reached, in roster order. */
  students: DemoStudent[];
  /** Graded assessment attempts per student, for linking real evidence. */
  attemptsByStudent: Record<string, SeededAttempt[]>;
  /** Who excuses work and who writes feedback on it. */
  teacherId: string;
  /** Position of this assignment in the run, so the state walk cannot repeat. */
  index: number;
  now: Date;
}

/** Clamps a planned moment so nothing is dated in the future. */
function notAfter(candidate: Date, ceiling: Date): Date {
  return candidate.getTime() > ceiling.getTime() ? ceiling : candidate;
}

/**
 * One row per learner the assignment reached, plus a second row where a
 * resubmission is allowed and was taken.
 *
 * The state is chosen in two steps, and the order matters. First an *intent* is
 * placed by position, so all six `AssignmentState` values appear across the run.
 * Then the real deadline rules are applied to it: outstanding work past its
 * overdue moment becomes OVERDUE exactly as the sweep in `assignments.jobs.ts`
 * would leave it, and a submission the late rules would have blocked is dated
 * on time instead of being seeded into a state the API could not produce.
 */
export function attemptsFor(input: AttemptPlanInput): PlannedAttempt[] {
  const { assignment, now } = input;
  const rows: PlannedAttempt[] = [];

  // Nothing is set until it is published — the API creates attempt rows in
  // `publishAssignment`, so a draft with a monitor board would be a fiction.
  if (!assignment.isPublished) return rows;

  const overdueAt = overdueFrom(assignment);
  const work = workFor(assignment);

  for (const [position, student] of input.students.entries()) {
    const slot = input.index + position;
    let state = INTENTS[slot % INTENTS.length];

    if (state === AssignmentState.EXCUSED) {
      rows.push({
        studentId: student.id,
        attemptNumber: 1,
        state,
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        isLate: false,
        scorePercent: null,
        pointsAwarded: 0,
        timeSpentSeconds: 0,
        excusedById: input.teacherId,
        excusedAt: notAfter(daysAgo(1, assignment.dueAt ?? now), now),
        excusedReason: EXCUSE_REASONS[slot % EXCUSE_REASONS.length],
        assessmentAttemptId: null,
        teacherFeedback: null,
        feedbackById: null,
        feedbackAt: null,
      });
      continue;
    }

    const settled =
      state === AssignmentState.COMPLETED || state === AssignmentState.SUBMITTED;
    // Outstanding work past its deadline is OVERDUE, whatever the intent was.
    if (!settled && overdueAt && overdueAt <= now) state = AssignmentState.OVERDUE;

    const [floor, ceiling] = SCORE_BANDS[student.band];
    const scorePercent =
      state === AssignmentState.COMPLETED
        ? hashInt(`assignment-score:${assignment.title}:${student.id}`, floor, ceiling)
        : null;

    // A quarter of settled rows are handed in after the deadline, so the late
    // flag on the monitor board has rows behind it. Where the late rules would
    // have refused the submission outright, it is dated on time instead.
    const wantsLate = settled && slot % 4 === 2 && assignment.dueAt !== null;
    const lateAt = assignment.dueAt ? new Date(assignment.dueAt.getTime() + 6 * 3_600_000) : now;
    const onTimeAt = assignment.dueAt
      ? new Date(assignment.dueAt.getTime() - hashInt(`assignment-early:${assignment.title}:${student.id}`, 2, 96) * 3_600_000)
      : daysAgo(hashInt(`assignment-when:${assignment.title}:${student.id}`, 1, 14), now);
    const attemptedAt = notAfter(
      wantsLate && !evaluateLateness(work, lateAt).blocked ? lateAt : onTimeAt,
      now,
    );

    const budget = Math.max(600, (assignment.estimatedMinutes ?? 20) * 60);
    const fullSpend = hashInt(`assignment-time:${assignment.title}:${student.id}`, 240, budget);
    const timeSpentSeconds = settled ? fullSpend : state === AssignmentState.NOT_STARTED ? 0 : Math.round(fullSpend * 0.4);
    const startedAt = settled
      ? new Date(attemptedAt.getTime() - timeSpentSeconds * 1000)
      : state === AssignmentState.NOT_STARTED
        ? null
        : notAfter(daysAgo(1, assignment.dueAt ?? now), now);

    // Feedback distinguishes the two ways work is closed: self-marking work
    // settles itself, teacher-marked work carries a comment and an author.
    const marked = state === AssignmentState.COMPLETED && slot % 3 === 1;

    rows.push({
      studentId: student.id,
      attemptNumber: 1,
      state,
      startedAt,
      submittedAt: settled ? attemptedAt : null,
      completedAt: state === AssignmentState.COMPLETED ? attemptedAt : null,
      isLate: settled ? evaluateLateness(work, attemptedAt).isLate : false,
      scorePercent,
      pointsAwarded: settled ? pointsFor(assignment.pointsValue, scorePercent) : 0,
      timeSpentSeconds,
      assessmentAttemptId: evidenceFor(assignment, student, input.attemptsByStudent),
      excusedById: null,
      excusedAt: null,
      excusedReason: null,
      teacherFeedback: marked ? FEEDBACK[slot % FEEDBACK.length] : null,
      feedbackById: marked ? input.teacherId : null,
      feedbackAt: marked ? notAfter(daysAhead(1, attemptedAt), now) : null,
    });

    // A resubmission: the first go is kept at a lower mark and a second row
    // records the improved one, which is what "allowResubmission" produces.
    const resubmits =
      assignment.allowResubmission &&
      state === AssignmentState.COMPLETED &&
      (assignment.maxAttempts === null || assignment.maxAttempts >= 2) &&
      slot % 5 === 0;
    if (resubmits && scorePercent !== null && startedAt) {
      const previous = rows[rows.length - 1];
      // Two sittings inside one window: a first go handed in early at a lower
      // mark, a pause, then the second sitting that produced the mark above. Each
      // row therefore carries its own elapsed time rather than the pair's.
      const firstSpend = Math.max(120, Math.round(timeSpentSeconds * 0.4));
      const gap = Math.round(timeSpentSeconds * 0.2);
      const firstAt = new Date(startedAt.getTime() + firstSpend * 1000);
      const firstScore = Math.max(10, scorePercent - hashInt(`assignment-gain:${assignment.title}:${student.id}`, 8, 24));
      rows[rows.length - 1] = {
        ...previous,
        attemptNumber: 1,
        scorePercent: firstScore,
        pointsAwarded: pointsFor(assignment.pointsValue, firstScore),
        submittedAt: firstAt,
        completedAt: firstAt,
        // Handed in earlier than the final sitting, so the flag is re-derived
        // rather than copied — an earlier submission can only be less late.
        isLate: evaluateLateness(work, firstAt).isLate,
        timeSpentSeconds: firstSpend,
        // The comment belongs on the sitting the teacher actually read.
        teacherFeedback: null,
        feedbackById: null,
        feedbackAt: null,
      };
      rows.push({
        ...previous,
        attemptNumber: 2,
        startedAt: new Date(firstAt.getTime() + gap * 1000),
        timeSpentSeconds: Math.max(60, timeSpentSeconds - firstSpend - gap),
      });
    }
  }

  return rows;
}

/**
 * The assessment attempt an assignment's evidence points at. Only set where the
 * assignment actually set an assessment and the learner sat it — inventing a link
 * would make the monitor board claim evidence that is not there.
 */
function evidenceFor(
  assignment: PlannedAssignment,
  student: DemoStudent,
  attemptsByStudent: Record<string, SeededAttempt[]>,
): string | null {
  if (!assignment.assessmentId) return null;
  const sat = (attemptsByStudent[student.id] ?? []).find(
    (attempt) => attempt.assessmentId === assignment.assessmentId,
  );
  return sat ? sat.id : null;
}
