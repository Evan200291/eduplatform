// ─────────────────────────────────────────────────────────────────────────────
// What a piece of learning is worth
// Blueprint 03: "Rewards must be connected to meaningful learning actions. The
// product must not reward random tapping, repeated low-value actions, or behavior
// that undermines learning." This file is where that sentence becomes arithmetic,
// and it is the only place the amounts live — the assessment engine credits them,
// the seed replays them, and a test can check them without a database.
//
// Three rules the numbers obey:
//
//   1. Effort earns something, accuracy earns more. A learner who finishes an
//      activity badly still gets half the award: blueprint 02 forbids "harsh
//      punishment for incorrect answers", and a zero would be one.
//   2. Nothing pays twice. Every award is credited against the *record* the
//      learning produced (a progress row, an attempt, a mastery row), so
//      `earnPoints` — idempotent on `(student, reason, sourceType, sourceId)` —
//      absorbs a replayed request, a re-mark, or a second seed run.
//   3. The school sets the volume. `SchoolSettings.gamificationIntensity` is the
//      "Points and earning rules" dial blueprint 09 asks for: 0 switches earning
//      off, 60 (the column default) means "as written below", 100 is generous.
//      It scales the award, never the fact of it. Reading it is
//      `gamification.service.intensityFor`; everything in this file is pure, so
//      the amounts can be tested without a database.
// ─────────────────────────────────────────────────────────────────────────────

import { MasteryLevel } from '@prisma/client';

/**
 * Base awards, before the school's dial. Deliberately small and flat: the ledger
 * is meant to be read by a nine-year-old counting up to their next reward, not to
 * model an economy.
 */
export const BASE_POINTS = {
  /** One activity finished inside an assessment or a learning path. */
  activity: 10,
  /** A lesson step read through to the end. Learning, but nothing was marked. */
  lesson: 8,
  /** The whole attempt, on top of its activities — finishing is worth something. */
  assessment: 20,
  /** A topic reaching PROFICIENT or MASTERED for the first time. */
  masteryMilestone: 30,
} as const;

/** The intensity that means "exactly the numbers above". Matches the column default. */
export const NEUTRAL_INTENSITY = 60;

/**
 * The school's multiplier. Linear either side of neutral so the dial behaves the way
 * an administrator dragging a slider expects: half-way is half, the top is generous
 * without being absurd, and zero is a real off switch rather than a small trickle.
 */
export function scaleFor(intensity: number): number {
  const clamped = Math.max(0, Math.min(100, intensity));
  if (clamped === 0) return 0;
  return clamped <= NEUTRAL_INTENSITY
    ? clamped / NEUTRAL_INTENSITY
    : 1 + ((clamped - NEUTRAL_INTENSITY) / (100 - NEUTRAL_INTENSITY)) * 0.5;
}

/**
 * Applies the dial. A positive award never rounds away to nothing — a learner who
 * was told "you earned points" must see at least one — but an intensity of zero
 * stays zero, because that school turned earning off.
 */
function apply(base: number, intensity: number): number {
  const scale = scaleFor(intensity);
  if (scale === 0 || base <= 0) return 0;
  return Math.max(1, Math.round(base * scale));
}

/**
 * Accuracy weighting: half the award for turning up and finishing, the other half
 * earned by getting it right. An unscored activity (nothing markable in it) counts
 * as finished, which is the honest reading of "no score" — see `submitAssignment`,
 * which takes the same position on unscored work.
 */
function accuracyWeight(scorePercent: number | null): number {
  if (scorePercent === null) return 1;
  const bounded = Math.max(0, Math.min(100, scorePercent));
  return 0.5 + (bounded / 100) * 0.5;
}

/**
 * One activity completed. Hints do not reduce it: this platform's hints are free by
 * design (see `assessment.marking`), and charging for the help a struggling learner
 * reached for would punish exactly the child blueprint 03 wants supported.
 */
export function pointsForActivity(scorePercent: number | null, intensity: number): number {
  return apply(BASE_POINTS.activity * accuracyWeight(scorePercent), intensity);
}

/**
 * The attempt itself, credited once alongside its activities. An attempt with no
 * items presented earns nothing — there was no learning to recognise.
 */
export function pointsForAssessment(
  scorePercent: number | null,
  itemsPresented: number,
  intensity: number,
): number {
  if (itemsPresented <= 0) return 0;
  return apply(BASE_POINTS.assessment * accuracyWeight(scorePercent), intensity);
}

/**
 * A lesson step finished on a learning path. Flat, because there is nothing to be
 * accurate about: a lesson is read or watched, and the learner either got to the end
 * or did not. Slightly below an activity for the same reason — an activity produced
 * an answer somebody could mark.
 *
 * Only *lesson* steps pay. An activity or assessment step is paid for by the evidence
 * it produces (`assessment.evaluation.service` credits the progress row and the
 * attempt), so crediting the step as well would pay twice for one piece of work.
 */
export function pointsForLesson(intensity: number): number {
  return apply(BASE_POINTS.lesson, intensity);
}

/**
 * Reaching a mastery level worth marking. Only PROFICIENT and MASTERED pay:
 * `gamification.validation` takes the same line on badge criteria, because
 * celebrating EMERGING would be celebrating a gap.
 */
export function pointsForMastery(level: MasteryLevel, intensity: number): number {
  if (level !== MasteryLevel.PROFICIENT && level !== MasteryLevel.MASTERED) return 0;
  const base =
    level === MasteryLevel.MASTERED ? BASE_POINTS.masteryMilestone : BASE_POINTS.masteryMilestone / 2;
  return apply(base, intensity);
}
