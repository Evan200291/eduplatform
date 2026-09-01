// ─────────────────────────────────────────────────────────────────────────────
// Assessment module internals
// Tenant guards, the difficulty-band ladder and the inference rules that turn raw
// evidence into a mastery label. Kept out of the services so those read as
// business rules rather than plumbing.
//
// Blueprint 12: "Completion alone does not equal mastery." The functions here are
// the only place a `MasteryLevel` or an `EvidenceConfidence` is decided, so the
// rule can be reviewed in one screen instead of being spread across handlers.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AttemptStatus,
  ContentStatus,
  DifficultyBand,
  EvidenceConfidence,
  MasteryLevel,
  UserStatus,
} from '@prisma/client';
import type { AuthenticatedActor } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';

/** `createdById` and friends are plain 32-char columns, not relations. */
export function shortId(userId: string): string {
  return userId.slice(0, 32);
}

// ── Difficulty bands ────────────────────────────────────────────────────────

/**
 * Blueprint 03: screening "assesses across controlled difficulty bands", stepping
 * up on success and down on failure. The ladder is ordered here so the adaptive
 * walk and the placement summary agree on what "higher" means.
 */
export const BAND_LADDER = [
  DifficultyBand.FOUNDATION,
  DifficultyBand.DEVELOPING,
  DifficultyBand.SECURE,
  DifficultyBand.CHALLENGE,
  DifficultyBand.EXTENSION,
] as const;

export function bandIndex(band: DifficultyBand): number {
  const index = BAND_LADDER.indexOf(band);
  return index === -1 ? BAND_LADDER.indexOf(DifficultyBand.DEVELOPING) : index;
}

/** Moves `steps` rungs along the ladder, clamped at both ends. */
export function stepBand(band: DifficultyBand, steps: number): DifficultyBand {
  const next = Math.min(BAND_LADDER.length - 1, Math.max(0, bandIndex(band) + steps));
  return BAND_LADDER[next];
}

export function higherBand(left: DifficultyBand, right: DifficultyBand): DifficultyBand {
  return bandIndex(left) >= bandIndex(right) ? left : right;
}

// ── Inference (blueprint 12) ────────────────────────────────────────────────

/**
 * Turns an accuracy percentage into a mastery label. `threshold` is the topic's
 * own `masteryThreshold`, so a school can require more evidence on a topic it
 * considers foundational without the code changing.
 */
export function masteryFromAccuracy(accuracyPercent: number, threshold: number): MasteryLevel {
  if (accuracyPercent >= threshold) return MasteryLevel.MASTERED;
  if (accuracyPercent >= Math.round(threshold * 0.75)) return MasteryLevel.PROFICIENT;
  if (accuracyPercent >= Math.round(threshold * 0.5)) return MasteryLevel.DEVELOPING;
  if (accuracyPercent > 0) return MasteryLevel.EMERGING;
  return MasteryLevel.NOT_ASSESSED;
}

/**
 * How much weight the inference deserves. Reported alongside every evaluation so a
 * teacher can see that "MASTERED from two questions" is not the same claim as
 * "MASTERED from twenty".
 */
/** The hardcoded item-count thresholds, kept as the fallback for a school that
 *  has not configured `confidenceThresholdModerate` / `confidenceThresholdHigh`. */
export const DEFAULT_CONFIDENCE_THRESHOLDS = { moderate: 3, high: 8 } as const;

export interface ConfidenceThresholds {
  moderate: number;
  high: number;
}

export function confidenceFromEvidence(
  itemsConsidered: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): EvidenceConfidence {
  if (itemsConsidered <= 0) return EvidenceConfidence.INSUFFICIENT;
  if (itemsConsidered < thresholds.moderate) return EvidenceConfidence.LOW;
  if (itemsConsidered < thresholds.high) return EvidenceConfidence.MODERATE;
  return EvidenceConfidence.HIGH;
}

// ── School-configurable engine settings ─────────────────────────────────────

export interface AssessmentEngineSettings {
  confidence: ConfidenceThresholds;
  /** Per-`AgeMode` override of an assessment's flat `maxAttempts`, or null. */
  attemptLimitByAgeMode: Record<string, number> | null;
  defaultShuffleItems: boolean;
}

/**
 * The admin-configurable knobs this module reads, with the schema's own
 * defaults standing in for a school that has never touched them — so an
 * unconfigured school sees exactly today's hardcoded behavior.
 */
export async function readAssessmentEngineSettings(schoolId: string): Promise<AssessmentEngineSettings> {
  const settings = await prisma.schoolSettings.findFirst({
    where: { schoolId },
    select: {
      confidenceThresholdModerate: true,
      confidenceThresholdHigh: true,
      attemptLimitByAgeMode: true,
      defaultShuffleItems: true,
    },
  });
  return {
    confidence: {
      moderate: settings?.confidenceThresholdModerate ?? DEFAULT_CONFIDENCE_THRESHOLDS.moderate,
      high: settings?.confidenceThresholdHigh ?? DEFAULT_CONFIDENCE_THRESHOLDS.high,
    },
    attemptLimitByAgeMode:
      (settings?.attemptLimitByAgeMode as Record<string, number> | null | undefined) ?? null,
    defaultShuffleItems: settings?.defaultShuffleItems ?? true,
  };
}

export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

// ── Tenant guards ───────────────────────────────────────────────────────────

export async function requireAssessment(schoolId: string, id: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id, schoolId },
    select: {
      id: true,
      title: true,
      key: true,
      kind: true,
      status: true,
      subjectId: true,
      topicId: true,
      itemTarget: true,
      timeLimitMinutes: true,
      adaptiveEnabled: true,
      startingBand: true,
      passThreshold: true,
      maxAttempts: true,
      cooldownDays: true,
      driveRecommendations: true,
      shuffleItems: true,
      showFeedbackImmediately: true,
      archivedAt: true,
    },
  });
  if (!assessment) throw notFound('Assessment');
  return assessment;
}

export type GuardedAssessment = Awaited<ReturnType<typeof requireAssessment>>;

/**
 * Loads an attempt inside the tenant. `restrictToStudentId` is derived from the
 * actor's permissions by `attemptScope`, never from the query string, so a learner
 * cannot widen their own view by asking for someone else's id.
 */
export async function requireAttempt(schoolId: string, id: string, restrictToStudentId?: string) {
  const attempt = await prisma.assessmentAttempt.findFirst({
    where: { id, schoolId, ...(restrictToStudentId ? { studentId: restrictToStudentId } : {}) },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          kind: true,
          subjectId: true,
          topicId: true,
          itemTarget: true,
          timeLimitMinutes: true,
          adaptiveEnabled: true,
          startingBand: true,
          passThreshold: true,
          driveRecommendations: true,
          shuffleItems: true,
          showFeedbackImmediately: true,
        },
      },
    },
  });
  if (!attempt) throw notFound('Assessment attempt');
  return attempt;
}

export type GuardedAttempt = Awaited<ReturnType<typeof requireAttempt>>;

/** An attempt accepts responses only while it is open and unexpired. */
export function assertAttemptOpen(attempt: {
  status: AttemptStatus;
  expiresAt: Date | null;
}): void {
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw conflict('That attempt is no longer open.', {
      details: { status: attempt.status },
    });
  }
  if (attempt.expiresAt && attempt.expiresAt.getTime() <= Date.now()) {
    throw conflict('That attempt has run out of time.', {
      details: { expiresAt: attempt.expiresAt.toISOString() },
    });
  }
}

/**
 * Who the caller may read attempts for. Staff holding a scoped or school-wide
 * progress grant see everyone in the tenant; everyone else sees only themselves.
 */
export function attemptScope(actor: AuthenticatedActor): { restrictToStudentId?: string } {
  const isStaff =
    actor.permissions.has('progress.read.scoped') ||
    actor.permissions.has('progress.read.school') ||
    actor.permissions.has('assessment.response.override');
  return isStaff ? {} : { restrictToStudentId: actor.userId };
}

/**
 * Resolves whose attempt is being started. Starting one for another learner is a
 * supervised action and needs a staff grant, so the check lives here rather than
 * on the route.
 */
export async function resolveAttemptStudent(
  actor: AuthenticatedActor,
  schoolId: string,
  requestedStudentId?: string,
): Promise<string> {
  if (!requestedStudentId || requestedStudentId === actor.userId) {
    return actor.userId;
  }
  if (!actor.permissions.has('progress.read.scoped') && !actor.permissions.has('progress.read.school')) {
    throw forbidden('You cannot start an attempt for another learner.');
  }

  const student = await prisma.user.findFirst({
    where: { id: requestedStudentId, schoolId, archivedAt: null },
    select: { id: true, status: true },
  });
  if (!student) throw notFound('Student');
  if (student.status !== UserStatus.ACTIVE) {
    throw badRequest('That learner is not active.');
  }
  return student.id;
}

/**
 * Blueprint 05: only published content is presented to a learner. An assessment
 * cannot be published while any of its items points at unpublished content, so the
 * delivery path never has to discover the problem mid-attempt.
 */
export async function assertItemsPublishable(assessmentId: string): Promise<void> {
  const items = await prisma.assessmentItem.findMany({
    where: { assessmentId },
    select: {
      activity: { select: { id: true, title: true, status: true } },
    },
  });

  if (items.length === 0) {
    throw badRequest('Add at least one item before publishing this assessment.');
  }

  const unpublished = items
    .filter((item) => item.activity.status !== ContentStatus.PUBLISHED)
    .map((item) => ({ activityId: item.activity.id, title: item.activity.title, status: item.activity.status }));

  if (unpublished.length > 0) {
    throw badRequest('Every activity in the assessment must be published first.', {
      details: { unpublished },
    });
  }
}

/**
 * The attempt cap actually enforced for one learner: the school's per-`AgeMode`
 * override when the learner's age mode has an entry, else the assessment's own
 * flat `maxAttempts` unchanged. A school that never configures
 * `attemptLimitByAgeMode` sees exactly today's behavior.
 */
export function effectiveMaxAttempts(
  assessmentMaxAttempts: number | null,
  studentAgeMode: string | null,
  attemptLimitByAgeMode: Record<string, number> | null,
): number | null {
  if (!studentAgeMode || !attemptLimitByAgeMode) return assessmentMaxAttempts;
  const override = attemptLimitByAgeMode[studentAgeMode];
  return typeof override === 'number' ? override : assessmentMaxAttempts;
}

/**
 * Blueprint 03: a re-attempt is allowed but rationed. `maxAttempts` caps the total
 * and `cooldownDays` spaces them out, so a learner cannot brute-force a placement.
 * `maxAttemptsOverride`, when passed, is the age-adjusted cap from
 * `effectiveMaxAttempts` — callers that do not resolve an age mode may omit it and
 * get the assessment's own flat value, unchanged.
 */
export async function assertAttemptAllowed(
  assessment: Pick<GuardedAssessment, 'id' | 'maxAttempts' | 'cooldownDays'>,
  studentId: string,
  isPractice: boolean,
  maxAttemptsOverride?: number | null,
): Promise<number> {
  const maxAttempts = maxAttemptsOverride === undefined ? assessment.maxAttempts : maxAttemptsOverride;
  const open = await prisma.assessmentAttempt.findFirst({
    where: { assessmentId: assessment.id, studentId, status: AttemptStatus.IN_PROGRESS },
    select: { id: true },
  });
  if (open) {
    throw conflict('You already have an attempt in progress.', { details: { attemptId: open.id } });
  }

  const previous = await prisma.assessmentAttempt.findMany({
    where: { assessmentId: assessment.id, studentId },
    orderBy: { attemptNumber: 'desc' },
    take: 1,
    select: { attemptNumber: true, completedAt: true },
  });
  const last = previous[0];
  const attemptNumber = (last?.attemptNumber ?? 0) + 1;

  // Practice runs are excluded from both limits: they carry no placement weight.
  if (isPractice) return attemptNumber;

  const graded = await prisma.assessmentAttempt.count({
    where: { assessmentId: assessment.id, studentId, isPractice: false },
  });
  if (maxAttempts !== null && graded >= maxAttempts) {
    throw conflict('You have used every attempt on this assessment.', {
      details: { maxAttempts },
    });
  }

  if (assessment.cooldownDays && assessment.cooldownDays > 0 && last?.completedAt) {
    const readyAt = new Date(last.completedAt.getTime() + assessment.cooldownDays * 86_400_000);
    if (readyAt.getTime() > Date.now()) {
      throw conflict('This assessment can be retried later.', {
        details: { availableAt: readyAt.toISOString(), cooldownDays: assessment.cooldownDays },
      });
    }
  }

  return attemptNumber;
}

/** Deterministic shuffle so a reload does not reshuffle mid-attempt. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const copy = [...items];
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  for (let index = copy.length - 1; index > 0; index -= 1) {
    hash = (Math.imul(hash, 48_271) + 11) >>> 0;
    const swap = hash % (index + 1);
    const held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}
