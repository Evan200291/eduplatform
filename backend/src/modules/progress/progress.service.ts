// ─────────────────────────────────────────────────────────────────────────────
// Progress and mastery reads, and the teacher's judgment
// Blueprint 12: "Completion alone does not equal mastery." Two different records
// answer two different questions, and this file never mixes them:
//
//   ProgressRecord   did the learner do the work?          (engagement)
//   MasteryRecord    can the learner do the thing?         (inference or judgment)
//
// Nothing here infers mastery from engagement. Mastery rows are written by the
// assessment module from evidence, or by a teacher through `overrideMastery` /
// `createTeacherAssessment` — and a teacher's judgment outranks the inference.
//
// Every list narrows to the learners the actor may see via `accessibleStudentIds`,
// never from a `studentId` query parameter.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prisma} from '@prisma/client';
import {
  DifficultyBand,
  EvidenceConfidence,
  EvidenceSource,
  MasteryLevel
} from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { accessibleStudentIds, assertCanAccessClass, classStudentIds } from '../../core/rbac/scope.service';
import { reviewDueFrom } from '../assessment/assessment.evaluation.service';
import type {
  ClassProgressQuery,
  CreateTeacherAssessmentInput,
  MasteryListQuery,
  MasteryOverrideInput,
  ProgressListQuery,
  ProgressSummaryQuery,
  TeacherAssessmentListQuery,
} from './progress.validation';

const PROGRESS_SELECT = {
  id: true,
  studentId: true,
  topicId: true,
  lessonId: true,
  activityId: true,
  status: true,
  completionPercent: true,
  attemptCount: true,
  bestScorePercent: true,
  lastScorePercent: true,
  timeSpentSeconds: true,
  hintsUsed: true,
  firstStartedAt: true,
  lastActivityAt: true,
  completedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  topic: { select: { id: true, name: true, subjectId: true } },
  lesson: { select: { id: true, title: true } },
  activity: { select: { id: true, title: true, type: true, estimatedMinutes: true } },
} satisfies Prisma.ProgressRecordSelect;

const MASTERY_SELECT = {
  id: true,
  studentId: true,
  subjectId: true,
  topicId: true,
  objectiveId: true,
  level: true,
  band: true,
  scorePercent: true,
  evidenceSource: true,
  confidence: true,
  evidenceCount: true,
  teacherOverride: true,
  overrideNote: true,
  overriddenById: true,
  firstEvidenceAt: true,
  lastEvidenceAt: true,
  masteredAt: true,
  reviewDueAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  subject: { select: { id: true, name: true, key: true } },
  topic: { select: { id: true, name: true, key: true, masteryThreshold: true } },
  objective: { select: { id: true, code: true, statement: true } },
} satisfies Prisma.MasteryRecordSelect;

const JUDGMENT_SELECT = {
  id: true,
  studentId: true,
  teacherId: true,
  subjectId: true,
  topicId: true,
  level: true,
  band: true,
  comment: true,
  countsAsEvidence: true,
  assessedAt: true,
  createdAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  teacher: { select: { id: true, displayName: true } },
  subject: { select: { id: true, name: true } },
  topic: { select: { id: true, name: true } },
} satisfies Prisma.TeacherAssessmentSelect;

/**
 * Resolves the learner filter for a list. `undefined` means no restriction (the
 * actor reads school-wide); otherwise the `in` list is exactly what they may see.
 *
 * A `studentId` the actor may not read narrows to an empty result rather than
 * raising — a teacher paging a shared screen should not learn that an id exists.
 */
async function studentFilter(
  context: ActorContext,
  requested?: string,
): Promise<Prisma.StringFilter | string | undefined> {
  const allowed = await accessibleStudentIds(context.actor, context.tenant);
  if (allowed === null) return requested ?? undefined;
  if (requested) return allowed.includes(requested) ? requested : { in: [] };
  return { in: allowed };
}

// ── Progress: did the learner do the work? ──────────────────────────────────

export async function listProgress(
  context: ActorContext,
  schoolId: string,
  query: ProgressListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const studentId = await studentFilter(context, query.studentId);

  const classStudents = query.classId
    ? await (async () => {
        await assertCanAccessClass(context.actor, context.tenant, query.classId as string);
        return classStudentIds(query.classId as string);
      })()
    : null;

  const where: Prisma.ProgressRecordWhereInput = {
    schoolId,
    ...(studentId ? { studentId } : {}),
    ...(classStudents ? { studentId: { in: classStudents } } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.lessonId ? { lessonId: query.lessonId } : {}),
    ...(query.activityId ? { activityId: query.activityId } : {}),
    ...(query.subjectId ? { topic: { subjectId: query.subjectId } } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.completedOnly ? { completedAt: { not: null } } : {}),
    ...(query.since || query.until
      ? {
          lastActivityAt: {
            ...(query.since ? { gte: query.since } : {}),
            ...(query.until ? { lte: query.until } : {}),
          },
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.progressRecord.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastActivityAt: 'desc' }],
      select: PROGRESS_SELECT,
    }),
    prisma.progressRecord.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * Engagement totals for one learner. This is deliberately a *count of activity*,
 * with no score interpretation: `bestScorePercent` averages are reported as an
 * engagement statistic and labelled as such by the caller, never as mastery.
 */
export async function getProgressSummary(
  context: ActorContext,
  schoolId: string,
  query: ProgressSummaryQuery,
) {
  const studentId = await studentFilter(context, query.studentId ?? context.actor.userId);

  const where: Prisma.ProgressRecordWhereInput = {
    schoolId,
    ...(studentId ? { studentId } : {}),
    ...(query.subjectId ? { topic: { subjectId: query.subjectId } } : {}),
    ...(query.since || query.until
      ? {
          lastActivityAt: {
            ...(query.since ? { gte: query.since } : {}),
            ...(query.until ? { lte: query.until } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.progressRecord.findMany({
    where,
    select: {
      topicId: true,
      lessonId: true,
      status: true,
      completionPercent: true,
      attemptCount: true,
      bestScorePercent: true,
      timeSpentSeconds: true,
      hintsUsed: true,
      lastActivityAt: true,
      completedAt: true,
      topic: { select: { id: true, name: true } },
      lesson: { select: { id: true, title: true } },
    },
  });

  const buckets = new Map<
    string,
    {
      key: string;
      label: string;
      activities: number;
      completed: number;
      attempts: number;
      timeSpentSeconds: number;
      hintsUsed: number;
      scoreSum: number;
      scoreCount: number;
    }
  >();

  for (const row of rows) {
    const { key, label } = bucketFor(row, query.groupBy);
    const bucket = buckets.get(key) ?? {
      key,
      label,
      activities: 0,
      completed: 0,
      attempts: 0,
      timeSpentSeconds: 0,
      hintsUsed: 0,
      scoreSum: 0,
      scoreCount: 0,
    };
    bucket.activities += 1;
    if (row.completedAt) bucket.completed += 1;
    bucket.attempts += row.attemptCount;
    bucket.timeSpentSeconds += row.timeSpentSeconds;
    bucket.hintsUsed += row.hintsUsed;
    if (row.bestScorePercent !== null) {
      bucket.scoreSum += row.bestScorePercent;
      bucket.scoreCount += 1;
    }
    buckets.set(key, bucket);
  }

  const groups = [...buckets.values()]
    .map(({ scoreSum, scoreCount, ...rest }) => ({
      ...rest,
      averageBestScorePercent: scoreCount === 0 ? null : Math.round(scoreSum / scoreCount),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    groupBy: query.groupBy,
    totals: {
      activitiesTouched: rows.length,
      activitiesCompleted: rows.filter((row) => row.completedAt !== null).length,
      attempts: rows.reduce((sum, row) => sum + row.attemptCount, 0),
      timeSpentSeconds: rows.reduce((sum, row) => sum + row.timeSpentSeconds, 0),
      hintsUsed: rows.reduce((sum, row) => sum + row.hintsUsed, 0),
      lastActivityAt:
        rows.length === 0
          ? null
          : rows.reduce<Date>(
              (latest, row) => (row.lastActivityAt > latest ? row.lastActivityAt : latest),
              rows[0].lastActivityAt,
            ),
    },
    groups,
  };
}

function bucketFor(
  row: {
    topicId: string | null;
    lessonId: string | null;
    lastActivityAt: Date;
    topic: { id: string; name: string } | null;
    lesson: { id: string; title: string } | null;
  },
  groupBy: ProgressSummaryQuery['groupBy'],
): { key: string; label: string } {
  if (groupBy === 'LESSON') {
    return { key: row.lessonId ?? 'none', label: row.lesson?.title ?? 'Unassigned' };
  }
  if (groupBy === 'DAY') {
    const day = row.lastActivityAt.toISOString().slice(0, 10);
    return { key: day, label: day };
  }
  return { key: row.topicId ?? 'none', label: row.topic?.name ?? 'Unassigned' };
}

/** Class-wide engagement, one row per learner, for a teacher's overview screen. */
export async function getClassProgress(
  context: ActorContext,
  schoolId: string,
  classId: string,
  query: ClassProgressQuery,
) {
  await assertCanAccessClass(context.actor, context.tenant, classId);
  const studentIds = await classStudentIds(classId);
  if (studentIds.length === 0) return { classId, students: [] };

  const [students, progress, mastery] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true, firstName: true, lastName: true, displayName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.progressRecord.groupBy({
      by: ['studentId'],
      where: {
        schoolId,
        studentId: { in: studentIds },
        ...(query.subjectId ? { topic: { subjectId: query.subjectId } } : {}),
        ...(query.since || query.until
          ? {
              lastActivityAt: {
                ...(query.since ? { gte: query.since } : {}),
                ...(query.until ? { lte: query.until } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
      _sum: { timeSpentSeconds: true, attemptCount: true },
      _max: { lastActivityAt: true },
    }),
    prisma.masteryRecord.groupBy({
      by: ['studentId', 'level'],
      where: {
        schoolId,
        studentId: { in: studentIds },
        objectiveId: null,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const engagement = new Map(progress.map((row) => [row.studentId, row]));
  const levels = new Map<string, Partial<Record<MasteryLevel, number>>>();
  for (const row of mastery) {
    const bag = levels.get(row.studentId) ?? {};
    bag[row.level] = row._count._all;
    levels.set(row.studentId, bag);
  }

  return {
    classId,
    students: students.map((student) => {
      const row = engagement.get(student.id);
      return {
        student,
        activitiesTouched: row?._count._all ?? 0,
        attempts: row?._sum.attemptCount ?? 0,
        timeSpentSeconds: row?._sum.timeSpentSeconds ?? 0,
        lastActivityAt: row?._max.lastActivityAt ?? null,
        masteryByLevel: levels.get(student.id) ?? {},
      };
    }),
  };
}

// ── Mastery: can the learner do the thing? ──────────────────────────────────

export async function listMastery(
  context: ActorContext,
  schoolId: string,
  query: MasteryListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const studentId = await studentFilter(context, query.studentId);

  const classStudents = query.classId
    ? await (async () => {
        await assertCanAccessClass(context.actor, context.tenant, query.classId as string);
        return classStudentIds(query.classId as string);
      })()
    : null;

  const where: Prisma.MasteryRecordWhereInput = {
    schoolId,
    ...(studentId ? { studentId } : {}),
    ...(classStudents ? { studentId: { in: classStudents } } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.level ? { level: query.level } : {}),
    ...(query.band ? { band: query.band } : {}),
    ...(query.confidence ? { confidence: query.confidence } : {}),
    ...(query.teacherOverride !== undefined ? { teacherOverride: query.teacherOverride } : {}),
    ...(query.dueForReview ? { reviewDueAt: { not: null, lte: new Date() } } : {}),
    // Topic-level rows are the default view; objective-level detail is opt-in.
    ...(query.objectiveLevel ? { objectiveId: { not: null } } : { objectiveId: null }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.masteryRecord.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastEvidenceAt: 'desc' }],
      select: MASTERY_SELECT,
    }),
    prisma.masteryRecord.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * Blueprint 04: "A teacher judgment outranks system inference." Setting
 * `teacherOverride` stops the assessment module rewriting the level; clearing it
 * hands the row back, leaving the accumulated evidence counters untouched either way.
 */
export async function overrideMastery(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: MasteryOverrideInput,
) {
  const existing = await prisma.masteryRecord.findFirst({
    where: { id, schoolId },
    select: { id: true, studentId: true, level: true, band: true, teacherOverride: true, masteredAt: true },
  });
  if (!existing) throw notFound('Mastery record');

  const now = new Date();
  const updated = await prisma.masteryRecord.update({
    where: { id },
    data: {
      level: input.level,
      band: input.band ?? undefined,
      scorePercent: input.scorePercent ?? undefined,
      teacherOverride: !input.clearOverride,
      overrideNote: input.clearOverride ? null : input.note,
      overriddenById: input.clearOverride ? null : context.actor.userId,
      evidenceSource: input.clearOverride
        ? EvidenceSource.SYSTEM_ASSESSMENT
        : EvidenceSource.TEACHER_JUDGMENT,
      confidence: input.clearOverride ? undefined : EvidenceConfidence.HIGH,
      lastEvidenceAt: now,
      masteredAt:
        input.level === MasteryLevel.MASTERED ? (existing.masteredAt ?? now) : null,
      reviewDueAt: reviewDueFrom(input.level, now),
    },
    select: MASTERY_SELECT,
  });

  recordAudit(context, {
    action: 'mastery.override',
    targetType: 'MasteryRecord',
    targetId: id,
    schoolId,
    summary: input.clearOverride
      ? 'A teacher returned this record to system inference.'
      : `A teacher set mastery to ${input.level}.`,
    reason: input.note,
    beforeData: { level: existing.level, band: existing.band, teacherOverride: existing.teacherOverride },
    afterData: { level: updated.level, band: updated.band, teacherOverride: updated.teacherOverride },
  });

  return updated;
}

// ── Teacher judgments ───────────────────────────────────────────────────────

export async function listTeacherAssessments(
  context: ActorContext,
  schoolId: string,
  query: TeacherAssessmentListQuery,
) {
  const { skip, take } = toSkipTake(query);
  const studentId = await studentFilter(context, query.studentId);

  const where: Prisma.TeacherAssessmentWhereInput = {
    schoolId,
    ...(studentId ? { studentId } : {}),
    ...(query.teacherId ? { teacherId: query.teacherId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.level ? { level: query.level } : {}),
    ...(query.since ? { assessedAt: { gte: query.since } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.teacherAssessment.findMany({
      where,
      skip,
      take,
      orderBy: [{ assessedAt: 'desc' }],
      select: JUDGMENT_SELECT,
    }),
    prisma.teacherAssessment.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * Records a teacher's own judgment. When `countsAsEvidence` is set the learner's
 * mastery record moves with it and is marked as a teacher override, which is what
 * blueprint 04 means by professional judgment being first-class.
 */
export async function createTeacherAssessment(
  context: ActorContext,
  schoolId: string,
  input: CreateTeacherAssessmentInput,
) {
  const subjectId = await resolveSubject(schoolId, input.subjectId, input.topicId);

  const judgment = await prisma.teacherAssessment.create({
    data: {
      schoolId,
      teacherId: context.actor.userId,
      studentId: input.studentId,
      subjectId: subjectId ?? null,
      topicId: input.topicId ?? null,
      level: input.level,
      band: input.band ?? null,
      comment: input.comment ?? null,
      countsAsEvidence: input.countsAsEvidence,
      assessedAt: input.assessedAt ?? new Date(),
    },
    select: JUDGMENT_SELECT,
  });

  let masteryUpdated = false;
  if (input.countsAsEvidence && subjectId) {
    masteryUpdated = await applyJudgmentToMastery(context, schoolId, {
      studentId: input.studentId,
      subjectId,
      topicId: input.topicId ?? null,
      level: input.level,
      band: input.band ?? null,
      note: input.comment ?? 'Teacher judgment.',
    });
  }

  recordAudit(context, {
    action: 'teacherassessment.create',
    targetType: 'TeacherAssessment',
    targetId: judgment.id,
    schoolId,
    summary: `Teacher judgment recorded: ${input.level}.`,
    afterData: { level: input.level, countsAsEvidence: input.countsAsEvidence, masteryUpdated },
  });

  return { ...judgment, masteryUpdated };
}

export async function updateTeacherAssessment(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: { level?: MasteryLevel; band?: DifficultyBand; comment?: string; countsAsEvidence?: boolean },
) {
  const existing = await prisma.teacherAssessment.findFirst({
    where: { id, schoolId },
    select: { id: true, teacherId: true, level: true, studentId: true, subjectId: true, topicId: true },
  });
  if (!existing) throw notFound('Teacher judgment');

  const updated = await prisma.teacherAssessment.update({
    where: { id },
    data: {
      level: input.level ?? undefined,
      band: input.band ?? undefined,
      comment: input.comment ?? undefined,
      countsAsEvidence: input.countsAsEvidence ?? undefined,
    },
    select: JUDGMENT_SELECT,
  });

  if (input.level && updated.countsAsEvidence && existing.subjectId) {
    await applyJudgmentToMastery(context, schoolId, {
      studentId: existing.studentId,
      subjectId: existing.subjectId,
      topicId: existing.topicId,
      level: input.level,
      band: input.band ?? null,
      note: input.comment ?? 'Teacher judgment revised.',
    });
  }

  recordAudit(context, {
    action: 'teacherassessment.create',
    targetType: 'TeacherAssessment',
    targetId: id,
    schoolId,
    summary: 'A teacher judgment was revised.',
    beforeData: { level: existing.level },
    afterData: { level: updated.level },
  });

  return updated;
}

/**
 * A judgment with no matching mastery row creates one; an existing row is moved and
 * flagged as a teacher override. `@@unique([studentId, topicId, objectiveId])` cannot
 * drive an upsert here because MySQL treats each NULL `objectiveId` as distinct.
 */
async function applyJudgmentToMastery(
  context: ActorContext,
  schoolId: string,
  input: {
    studentId: string;
    subjectId: string;
    topicId: string | null;
    level: MasteryLevel;
    band: DifficultyBand | null;
    note: string;
  },
): Promise<boolean> {
  const now = new Date();
  const existing = await prisma.masteryRecord.findFirst({
    where: { studentId: input.studentId, topicId: input.topicId, objectiveId: null },
    select: { id: true, masteredAt: true },
  });

  const shared = {
    level: input.level,
    band: input.band ?? DifficultyBand.DEVELOPING,
    evidenceSource: EvidenceSource.TEACHER_JUDGMENT,
    confidence: EvidenceConfidence.HIGH,
    teacherOverride: true,
    overrideNote: input.note.slice(0, 600),
    overriddenById: context.actor.userId,
    lastEvidenceAt: now,
    reviewDueAt: reviewDueFrom(input.level, now),
  };

  if (existing) {
    await prisma.masteryRecord.update({
      where: { id: existing.id },
      data: {
        ...shared,
        evidenceCount: { increment: 1 },
        masteredAt: input.level === MasteryLevel.MASTERED ? (existing.masteredAt ?? now) : null,
      },
    });
    return true;
  }

  await prisma.masteryRecord.create({
    data: {
      ...shared,
      schoolId,
      studentId: input.studentId,
      subjectId: input.subjectId,
      topicId: input.topicId,
      objectiveId: null,
      evidenceCount: 1,
      firstEvidenceAt: now,
      masteredAt: input.level === MasteryLevel.MASTERED ? now : null,
    },
  });
  return true;
}

/** A judgment may name a subject directly, or inherit it from the topic. */
async function resolveSubject(
  schoolId: string,
  subjectId: string | undefined,
  topicId: string | undefined,
): Promise<string | null> {
  if (subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId },
      select: { id: true },
    });
    if (!subject) throw notFound('Subject');
    return subject.id;
  }
  if (!topicId) return null;

  const topic = await prisma.topic.findFirst({
    where: { id: topicId, subject: { schoolId } },
    select: { subjectId: true },
  });
  if (!topic) throw badRequest('That topic does not belong to this school.');
  return topic.subjectId;
}
