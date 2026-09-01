// ─────────────────────────────────────────────────────────────────────────────
// Learning path + recommendation planning (no database access)
// Blueprint 03 "Learning path — Modes" and blueprint 04 "The system proposes.
// The teacher decides."
//
// Everything here is arithmetic over already-seeded fixtures, so the shape of a
// demo path can be exercised with `tsx` and no MySQL. `learning.seed.ts` is the
// only file that writes.
//
// Two rules this file follows deliberately:
//
//   • Status comes from the *product*. `initialStatus` and `SECURE_LEVELS` are
//     imported from `src/modules/learning/learning.helpers.ts` rather than
//     copied, so a seeded path and a generated one cannot drift apart the first
//     time someone changes what "secure" means.
//   • State coverage is positional, never `chance()`-gated. A probability can
//     miss a whole enum value across 24 learners and ship a dashboard tab that
//     was never opened during development. Every `PathMode`, `PathItemStatus`,
//     `RecommendationOrigin` and `RecommendationStatus` is placed by index.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MasteryLevel,
  PathItemStatus,
  PathMode,
  type EvidenceConfidence,
  type EvidenceSource,
  type RecommendationOrigin,
  type RecommendationStatus,
} from '@prisma/client';

import { initialStatus, SECURE_LEVELS, shortId } from '../../src/modules/learning/learning.helpers';
import type { SeededAssessment } from './assessment.seed';
import type { SeededAttempt } from './attempts.seed';
import type { ContentFixture } from './content.seed';
import type { SeededTopic } from './curriculum.seed';
import { notAfter } from './evaluation.plan';
import type { SeededTopicMastery } from './evaluation.plan';
import { daysAgo, daysAhead, hoursAgo, pick } from './helpers';
import type { DemoStudent } from './people.seed';

/** The four path modes, placed by index so every mode filter has rows. */
const PATH_MODES: readonly PathMode[] = [
  PathMode.HYBRID,
  PathMode.SUBJECT_BASED,
  PathMode.TOPIC_BASED,
  PathMode.GRADE_BASED,
];

/** One step on a path. Exactly one target is set, as `assertSingleTarget` requires. */
export interface PlannedPathItem {
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  assessmentId: string | null;
  sortOrder: number;
  status: PathItemStatus;
  isRequired: boolean;
  addedByTeacherId: string | null;
  removedByTeacherId: string | null;
  removedAt: Date | null;
  reason: string | null;
  unlockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  dueAt: Date | null;
}

export interface PlannedPath {
  subjectId: string;
  subjectKey: string;
  programKey: string;
  mode: PathMode;
  name: string;
  version: number;
  isActive: boolean;
  requiresApproval: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
  generatedAt: Date;
  generatorNote: string;
  notes: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  items: PlannedPathItem[];
}

/**
 * The proposal JSON. `applyProposalToPath` reads `practise` and `advance`, so a
 * seeded recommendation that a teacher approves in the demo actually changes the
 * learner's path instead of doing nothing visible.
 */
export interface PlannedProposal {
  practise: string[];
  advance: string[];
  note: string;
}

export interface PlannedRecommendation {
  subjectId: string;
  topicId: string | null;
  pathVersion: number;
  assessmentId: string | null;
  attemptId: string | null;
  origin: RecommendationOrigin;
  status: RecommendationStatus;
  rationale: string;
  proposal: PlannedProposal;
  appliedChange: PlannedProposal | null;
  priority: number;
  evidenceSource: EvidenceSource;
  confidence: EvidenceConfidence;
  decidedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  autoApproveAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** What one (student, subject) pair needs before a path can be planned. */
export interface PathInput {
  student: DemoStudent;
  subjectId: string;
  subjectName: string;
  subjectKey: string;
  programKey: string;
  /** Topics of the programme in teaching order. */
  topics: SeededTopic[];
  /** Topic mastery this learner already has, for this subject only. */
  mastery: SeededTopicMastery[];
  /** Topic ids whose hard prerequisites are met, from `resolveUnlockable`. */
  unlocked: Set<string>;
  /** Unmet hard prerequisites per topic id, from `resolveUnlockable`. */
  blockedBy: Map<string, string[]>;
  /** Every attempt this learner made on this programme, oldest first. */
  attempts: SeededAttempt[];
  content: ContentFixture;
  reassessment: SeededAssessment | undefined;
  teacherIds: string[];
  /** Position of this pair in the cohort, used to place states by index. */
  pairIndex: number;
  now: Date;
}

/**
 * When the plan was drawn up. A path is generated *from* evidence, so it is
 * dated just after the learner's first attempt on the programme, and 45 days ago
 * for a learner who has not been assessed in that subject yet.
 */
function generatedFor(input: PathInput): Date {
  const first = input.attempts[0];
  if (!first) return daysAgo(45, input.now);
  return notAfter(new Date(first.startedAt.getTime() + 2 * 60 * 60 * 1000), input.now);
}

/** Mastery level per topic id, for the subject this path covers. */
function levelsOf(mastery: SeededTopicMastery[]): Map<string, SeededTopicMastery> {
  return new Map(mastery.map((row) => [row.topicId, row]));
}

/**
 * The step statuses for one topic. `initialStatus` decides locked / available /
 * completed exactly as the generator does; the two extra states are the ones a
 * freshly generated path cannot have but a lived-in one always does:
 *
 *   • IN_PROGRESS — the learner has evidence on the topic without securing it,
 *     which is precisely the "keep going" case the student dashboard is for.
 *   • SKIPPED — a secure-but-not-mastered topic the teacher advanced past, with
 *     the same wording `applyProposalToPath` writes.
 */
function statusFor(
  evidence: SeededTopicMastery | undefined,
  unlocked: boolean,
  allowSkip: boolean,
): PathItemStatus {
  const level = evidence?.level ?? null;
  const mastered = level === MasteryLevel.MASTERED;
  const secure = level !== null && SECURE_LEVELS.includes(level);
  const base = initialStatus(unlocked || secure, mastered);
  if (allowSkip && secure && !mastered) return PathItemStatus.SKIPPED;
  if (base === PathItemStatus.AVAILABLE && level !== null && level !== MasteryLevel.NOT_ASSESSED) {
    return PathItemStatus.IN_PROGRESS;
  }
  return base;
}

/** Timestamps that match the status, so no row claims to be finished at no time. */
function timesFor(
  status: PathItemStatus,
  evidenceAt: Date | null,
  generatedAt: Date,
): Pick<PlannedPathItem, 'unlockedAt' | 'startedAt' | 'completedAt'> {
  const opened = evidenceAt ?? generatedAt;
  switch (status) {
    case PathItemStatus.LOCKED:
      return { unlockedAt: null, startedAt: null, completedAt: null };
    case PathItemStatus.AVAILABLE:
      return { unlockedAt: generatedAt, startedAt: null, completedAt: null };
    case PathItemStatus.IN_PROGRESS:
      return { unlockedAt: generatedAt, startedAt: opened, completedAt: null };
    case PathItemStatus.COMPLETED:
    case PathItemStatus.SKIPPED:
      return { unlockedAt: generatedAt, startedAt: opened, completedAt: opened };
    case PathItemStatus.REMOVED_BY_TEACHER:
      return { unlockedAt: generatedAt, startedAt: null, completedAt: null };
    default:
      return { unlockedAt: null, startedAt: null, completedAt: null };
  }
}

/**
 * The path (or paths) one learner has for one subject.
 *
 * Usually one active path. Every eighth pair also gets an archived version 1, so
 * the "path history" view and the `version` column are exercised by real rows
 * rather than by a migration comment.
 */
export function pathsFor(input: PathInput): PlannedPath[] {
  const { pairIndex } = input;
  const generatedAt = generatedFor(input);
  const evidence = levelsOf(input.mastery);
  const pendingApproval = pairIndex % 5 === 1;
  // `approvedById`, `addedByTeacherId` and `removedByTeacherId` are VarChar(32)
  // rather than foreign keys, so they are truncated the way the API truncates.
  const teacher = (purpose: string): string =>
    shortId(pick(input.teacherIds, `path:${purpose}:${input.student.id}:${input.subjectKey}`));

  const items: PlannedPathItem[] = [];
  let skipUsed = pairIndex % 3 !== 0;
  let sortOrder = 0;

  for (const topic of input.topics) {
    const row = evidence.get(topic.id);
    const unmet = input.blockedBy.get(topic.id) ?? [];
    const status = statusFor(row, input.unlocked.has(topic.id), !skipUsed);
    if (status === PathItemStatus.SKIPPED) skipUsed = true;
    const isLast = sortOrder === input.topics.length - 1;
    const removed = isLast && pairIndex % 6 === 4;
    const finalStatus = removed ? PathItemStatus.REMOVED_BY_TEACHER : status;
    const times = timesFor(finalStatus, row?.lastEvidenceAt ?? null, generatedAt);
    const settled =
      finalStatus === PathItemStatus.COMPLETED ||
      finalStatus === PathItemStatus.SKIPPED ||
      finalStatus === PathItemStatus.REMOVED_BY_TEACHER;

    items.push({
      topicId: topic.id,
      lessonId: null,
      activityId: null,
      assessmentId: null,
      sortOrder,
      status: finalStatus,
      isRequired: row?.level !== MasteryLevel.MASTERED,
      addedByTeacherId: null,
      removedByTeacherId: removed ? teacher('remove') : null,
      removedAt: removed ? hoursAgo(6, input.now) : null,
      reason: reasonFor(finalStatus, unmet.length),
      ...times,
      // Relative to today, not to generation, so the demo always shows both an
      // overdue step and one still to come.
      dueAt: settled ? null : daysAhead(sortOrder * 4 - 6, input.now),
    });
    sortOrder += 1;
  }

  // A teacher's own insertion: the lesson behind the learner's weakest topic.
  const weakest = [...input.mastery].sort(
    (left, right) => left.accuracyPercent - right.accuracyPercent,
  )[0];
  const lesson = weakest ? input.content.lessonByTopic[weakest.topicId] : undefined;
  if (lesson && pairIndex % 2 === 0) {
    items.push({
      topicId: null,
      lessonId: lesson.id,
      activityId: null,
      assessmentId: null,
      sortOrder,
      status: PathItemStatus.AVAILABLE,
      isRequired: false,
      addedByTeacherId: teacher('add-lesson'),
      removedByTeacherId: null,
      removedAt: null,
      reason: `Added by the teacher: re-read “${lesson.title}” before the next check.`,
      unlockedAt: generatedAt,
      startedAt: null,
      completedAt: null,
      dueAt: daysAhead(5, input.now),
    });
    sortOrder += 1;
  }

  // A reassessment booked as the last step, locked until the practice above it is done.
  if (input.reassessment && pairIndex % 3 === 1) {
    items.push({
      topicId: null,
      lessonId: null,
      activityId: null,
      assessmentId: input.reassessment.id,
      sortOrder,
      status: PathItemStatus.LOCKED,
      isRequired: true,
      addedByTeacherId: null,
      removedByTeacherId: null,
      removedAt: null,
      reason: 'Opens once the practice steps above are complete.',
      unlockedAt: null,
      startedAt: null,
      completedAt: null,
      dueAt: daysAhead(14, input.now),
    });
    sortOrder += 1;
  }

  const live = items.filter((item) => item.status !== PathItemStatus.REMOVED_BY_TEACHER);
  const finished =
    live.length > 0 &&
    live.every(
      (item) =>
        item.status === PathItemStatus.COMPLETED || item.status === PathItemStatus.SKIPPED,
    );
  const locked = items.filter((item) => item.status === PathItemStatus.LOCKED).length;

  const active: PlannedPath = {
    subjectId: input.subjectId,
    subjectKey: input.subjectKey,
    programKey: input.programKey,
    mode: PATH_MODES[pairIndex % PATH_MODES.length],
    name: `${input.subjectName} path`,
    version: 1,
    isActive: true,
    requiresApproval: true,
    approvedById: pendingApproval ? null : teacher('approve'),
    approvedAt: pendingApproval ? null : notAfter(daysAhead(1, generatedAt), input.now),
    generatedAt,
    // Same sentence the generator writes, so a seeded path and a generated one
    // read identically in the teacher's list.
    generatorNote:
      `Generated from ${input.mastery.length} mastery record(s): ` +
      `${input.topics.length} topic(s) planned, ${locked} locked behind prerequisites.`,
    notes: pendingApproval ? 'Waiting on the class teacher to review the proposed steps.' : null,
    completedAt: finished ? notAfter(daysAhead(2, generatedAt), input.now) : null,
    archivedAt: null,
    items,
  };

  if (pairIndex % 8 !== 3) return [active];

  // The superseded first attempt at a plan, kept so the history is not a fiction.
  const previousGeneratedAt = daysAgo(3, generatedAt);
  const supersededAt = notAfter(daysAhead(3, previousGeneratedAt), input.now);
  const previous: PlannedPath = {
    ...active,
    mode: PathMode.GRADE_BASED,
    version: 1,
    isActive: false,
    approvedById: teacher('approve'),
    approvedAt: notAfter(daysAhead(1, previousGeneratedAt), input.now),
    generatedAt: previousGeneratedAt,
    generatorNote: 'Generated from 0 mastery record(s): 2 topic(s) planned, 0 locked behind prerequisites.',
    notes: 'Replaced once the screening results came in.',
    completedAt: null,
    archivedAt: supersededAt,
    // Timestamps are re-dated to this version's own lifetime: a step carried out
    // of an archived plan cannot have been started after the plan was replaced.
    items: items.slice(0, 2).map((item, index) => ({
      ...item,
      sortOrder: index,
      status: PathItemStatus.SKIPPED,
      removedByTeacherId: null,
      removedAt: null,
      reason: 'Carried into version 2 of this path.',
      unlockedAt: previousGeneratedAt,
      startedAt: previousGeneratedAt,
      completedAt: supersededAt,
      dueAt: null,
    })),
  };
  return [previous, { ...active, version: 2 }];
}

/** The wording a teacher sees against a step, matching the service's own copy. */
function reasonFor(status: PathItemStatus, unmet: number): string | null {
  if (status === PathItemStatus.REMOVED_BY_TEACHER) {
    return 'Removed by the teacher: covered in class, no need to repeat it.';
  }
  if (status === PathItemStatus.SKIPPED) {
    return 'Skipped: evidence shows this topic is already secure.';
  }
  if (unmet > 0) return `Locked until ${unmet} prerequisite topic(s) are secure.`;
  return null;
}
