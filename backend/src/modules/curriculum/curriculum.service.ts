// ─────────────────────────────────────────────────────────────────────────────
// Curriculum service
// Blueprint 05 content lifecycle is enforced here: a status change follows a
// declared transition table rather than accepting any value the client sends,
// and publishing stamps `publishedAt` so "when did this become live?" is
// answerable from the row itself.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentStatus, type Prisma } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import { slugify, toKey } from '../../core/auth/codes';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type {
  createObjectiveSchema,
  createProgramSchema,
  createTopicSchema,
  createUnitSchema,
  ObjectiveListQuery,
  ProgramListQuery,
  setPrerequisitesSchema,
  TopicListQuery,
  UnitListQuery,
  updateObjectiveSchema,
  updateProgramSchema,
  updateTopicSchema,
  updateUnitSchema,
} from './curriculum.validation';

type CreateProgramInput = z.infer<typeof createProgramSchema>;
type UpdateProgramInput = z.infer<typeof updateProgramSchema>;
type CreateUnitInput = z.infer<typeof createUnitSchema>;
type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
type CreateTopicInput = z.infer<typeof createTopicSchema>;
type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>;
type UpdateObjectiveInput = z.infer<typeof updateObjectiveSchema>;
type PrerequisiteInput = z.infer<typeof setPrerequisitesSchema>['prerequisites'];

// ── Content lifecycle (blueprint 05) ────────────────────────────────────────

/**
 * Allowed status transitions. Declaring them makes the lifecycle reviewable and
 * stops a client jumping straight from DRAFT to PUBLISHED without review.
 */
const STATUS_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  [ContentStatus.DRAFT]: [ContentStatus.IN_REVIEW, ContentStatus.ARCHIVED],
  [ContentStatus.IN_REVIEW]: [ContentStatus.APPROVED, ContentStatus.DRAFT, ContentStatus.ARCHIVED],
  [ContentStatus.APPROVED]: [ContentStatus.PUBLISHED, ContentStatus.DRAFT, ContentStatus.ARCHIVED],
  [ContentStatus.PUBLISHED]: [ContentStatus.REVISED, ContentStatus.ARCHIVED],
  [ContentStatus.REVISED]: [ContentStatus.IN_REVIEW, ContentStatus.PUBLISHED, ContentStatus.ARCHIVED],
  [ContentStatus.ARCHIVED]: [ContentStatus.DRAFT],
};

export function assertStatusTransition(from: ContentStatus, to: ContentStatus): void {
  if (from === to) throw badRequest(`That item is already ${to}.`);
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw badRequest(`Cannot move content from ${from} to ${to}.`);
  }
}

/** Maps a lifecycle move onto the audit vocabulary. */
export function statusAuditAction(to: ContentStatus) {
  if (to === ContentStatus.PUBLISHED) return 'content.publish' as const;
  if (to === ContentStatus.ARCHIVED) return 'content.archive' as const;
  return 'content.review' as const;
}

// ── Programs ────────────────────────────────────────────────────────────────

export async function listPrograms(schoolId: string, query: ProgramListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.CurriculumProgramWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { key: { contains: query.search } },
            { framework: { contains: query.search } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.curriculumProgram.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        subject: { select: { id: true, name: true, key: true, colorHex: true } },
        grade: { select: { id: true, name: true, level: true } },
        _count: { select: { units: true } },
      },
    }),
    prisma.curriculumProgram.count({ where }),
  ]);

  return { items, totalItems };
}

/** The full tree for one program, which is what the curriculum editor loads. */
export async function getProgram(schoolId: string, id: string) {
  const program = await prisma.curriculumProgram.findFirst({
    where: { id, schoolId },
    include: {
      subject: { select: { id: true, name: true, key: true, colorHex: true } },
      grade: { select: { id: true, name: true, level: true } },
      units: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          key: true,
          description: true,
          sortOrder: true,
          status: true,
          topics: {
            where: { archivedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              key: true,
              difficultyBand: true,
              estimatedMinutes: true,
              masteryThreshold: true,
              sortOrder: true,
              status: true,
              _count: { select: { objectives: true, lessons: true, activities: true } },
            },
          },
        },
      },
    },
  });

  if (!program) throw notFound('Curriculum program');
  return program;
}

export async function createProgram(
  context: ActorContext,
  schoolId: string,
  input: CreateProgramInput,
) {
  await assertSubject(schoolId, input.subjectId);
  if (input.gradeId) await assertGrade(schoolId, input.gradeId);

  const key = await uniqueKey(input.key ?? slugify(input.name), async (value) => {
    const existing = await prisma.curriculumProgram.findFirst({
      where: { schoolId, subjectId: input.subjectId, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  const program = await prisma.curriculumProgram.create({
    data: {
      schoolId,
      subjectId: input.subjectId,
      gradeId: input.gradeId,
      name: input.name,
      key,
      description: input.description,
      framework: input.framework,
      ownership: input.ownership,
      sortOrder: input.sortOrder,
      createdById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'curriculum.create',
    targetType: 'CurriculumProgram',
    targetId: program.id,
    schoolId,
    summary: `Created curriculum program "${program.name}".`,
    afterData: program,
  });

  return program;
}

export async function updateProgram(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateProgramInput,
) {
  const before = await prisma.curriculumProgram.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Curriculum program');
  if (input.gradeId) await assertGrade(schoolId, input.gradeId);

  const after = await prisma.curriculumProgram.update({
    where: { id },
    data: {
      ...input,
      // Editing published content moves it to REVISED, so the change is visible
      // in the lifecycle rather than silently altering live material.
      ...(before.status === ContentStatus.PUBLISHED ? { status: ContentStatus.REVISED } : {}),
      version: before.version + 1,
    },
  });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'CurriculumProgram',
    targetId: id,
    schoolId,
    summary: `Updated curriculum program "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setProgramStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const before = await prisma.curriculumProgram.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Curriculum program');
  assertStatusTransition(before.status, status);

  const after = await prisma.curriculumProgram.update({
    where: { id },
    data: {
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? new Date() : before.publishedAt,
      archivedAt: status === ContentStatus.ARCHIVED ? new Date() : null,
    },
  });

  recordAudit(context, {
    action: statusAuditAction(status),
    targetType: 'CurriculumProgram',
    targetId: id,
    schoolId,
    summary: `Set program "${after.name}" to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

// ── Units ───────────────────────────────────────────────────────────────────

export async function listUnits(schoolId: string, query: UnitListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.UnitWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.programId ? { programId: query.programId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { OR: [{ name: { contains: query.search } }, { key: { contains: query.search } }] } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.unit.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        program: { select: { id: true, name: true, key: true } },
        subject: { select: { id: true, name: true, key: true } },
        _count: { select: { topics: true } },
      },
    }),
    prisma.unit.count({ where }),
  ]);

  return { items, totalItems };
}

export async function createUnit(context: ActorContext, schoolId: string, input: CreateUnitInput) {
  const program = await prisma.curriculumProgram.findFirst({
    where: { id: input.programId, schoolId },
    select: { id: true, subjectId: true },
  });
  if (!program) throw notFound('Curriculum program');

  const key = await uniqueKey(input.key ?? slugify(input.name), async (value) => {
    const existing = await prisma.unit.findFirst({
      where: { programId: input.programId, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  const unit = await prisma.unit.create({
    data: {
      schoolId,
      programId: input.programId,
      subjectId: program.subjectId,
      name: input.name,
      key,
      description: input.description,
      sortOrder: input.sortOrder,
      createdById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'curriculum.create',
    targetType: 'Unit',
    targetId: unit.id,
    schoolId,
    summary: `Created unit "${unit.name}".`,
    afterData: unit,
  });

  return unit;
}

export async function updateUnit(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateUnitInput,
) {
  const before = await prisma.unit.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Unit');

  const after = await prisma.unit.update({ where: { id }, data: input });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'Unit',
    targetId: id,
    schoolId,
    summary: `Updated unit "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setUnitStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const before = await prisma.unit.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Unit');
  assertStatusTransition(before.status, status);

  const after = await prisma.unit.update({
    where: { id },
    data: { status, archivedAt: status === ContentStatus.ARCHIVED ? new Date() : null },
  });

  recordAudit(context, {
    action: statusAuditAction(status),
    targetType: 'Unit',
    targetId: id,
    schoolId,
    summary: `Set unit "${after.name}" to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

// ── Topics ──────────────────────────────────────────────────────────────────

export async function listTopics(schoolId: string, query: TopicListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.TopicWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.unitId ? { unitId: query.unitId } : {}),
    ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.difficultyBand ? { difficultyBand: query.difficultyBand } : {}),
    ...(query.search ? { OR: [{ name: { contains: query.search } }, { key: { contains: query.search } }] } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.topic.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        unit: { select: { id: true, name: true, key: true, programId: true } },
        subject: { select: { id: true, name: true, key: true, colorHex: true } },
        grade: { select: { id: true, name: true, level: true } },
        _count: { select: { objectives: true, lessons: true, activities: true, assessments: true } },
      },
    }),
    prisma.topic.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getTopic(schoolId: string, id: string) {
  const topic = await prisma.topic.findFirst({
    where: { id, schoolId },
    include: {
      unit: { select: { id: true, name: true, key: true, program: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true, key: true, colorHex: true } },
      grade: { select: { id: true, name: true, level: true } },
      objectives: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      prerequisites: {
        select: {
          id: true,
          isHard: true,
          requiredTopic: { select: { id: true, name: true, key: true, difficultyBand: true } },
        },
      },
      requiredFor: {
        select: { id: true, isHard: true, topic: { select: { id: true, name: true, key: true } } },
      },
      _count: { select: { lessons: true, activities: true, assessments: true } },
    },
  });

  if (!topic) throw notFound('Topic');
  return topic;
}

export async function createTopic(context: ActorContext, schoolId: string, input: CreateTopicInput) {
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, schoolId },
    select: { id: true, subjectId: true },
  });
  if (!unit) throw notFound('Unit');
  if (input.gradeId) await assertGrade(schoolId, input.gradeId);

  const key = await uniqueKey(input.key ?? slugify(input.name), async (value) => {
    const existing = await prisma.topic.findFirst({
      where: { unitId: input.unitId, key: value },
      select: { id: true },
    });
    return existing === null;
  });

  const topic = await prisma.topic.create({
    data: {
      schoolId,
      unitId: input.unitId,
      subjectId: unit.subjectId,
      gradeId: input.gradeId,
      name: input.name,
      key,
      description: input.description,
      difficultyBand: input.difficultyBand,
      estimatedMinutes: input.estimatedMinutes,
      sortOrder: input.sortOrder,
      masteryThreshold: input.masteryThreshold,
      createdById: shortId(context.actor.userId),
    },
  });

  recordAudit(context, {
    action: 'curriculum.create',
    targetType: 'Topic',
    targetId: topic.id,
    schoolId,
    summary: `Created topic "${topic.name}".`,
    afterData: topic,
  });

  return topic;
}

export async function updateTopic(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateTopicInput,
) {
  const before = await prisma.topic.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Topic');
  if (input.gradeId) await assertGrade(schoolId, input.gradeId);

  const after = await prisma.topic.update({ where: { id }, data: input });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'Topic',
    targetId: id,
    schoolId,
    summary: `Updated topic "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setTopicStatus(
  context: ActorContext,
  schoolId: string,
  id: string,
  status: ContentStatus,
  reason?: string,
) {
  const before = await prisma.topic.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Topic');
  assertStatusTransition(before.status, status);

  const after = await prisma.topic.update({
    where: { id },
    data: {
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? new Date() : before.publishedAt,
      archivedAt: status === ContentStatus.ARCHIVED ? new Date() : null,
    },
  });

  recordAudit(context, {
    action: statusAuditAction(status),
    targetType: 'Topic',
    targetId: id,
    schoolId,
    summary: `Set topic "${after.name}" to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

// ── Prerequisites ───────────────────────────────────────────────────────────

/**
 * Replaces a topic's prerequisites. A cycle would make the path engine
 * unsatisfiable, so the whole proposed graph is checked before anything is
 * written rather than trusting the client to avoid one.
 */
export async function setTopicPrerequisites(
  context: ActorContext,
  schoolId: string,
  topicId: string,
  prerequisites: PrerequisiteInput,
) {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, schoolId },
    select: { id: true, name: true },
  });
  if (!topic) throw notFound('Topic');

  const requiredIds = [...new Set(prerequisites.map((entry) => entry.requiredTopicId))];
  if (requiredIds.includes(topicId)) throw badRequest('A topic cannot require itself.');

  if (requiredIds.length > 0) {
    const found = await prisma.topic.findMany({
      where: { id: { in: requiredIds }, schoolId },
      select: { id: true },
    });
    if (found.length !== requiredIds.length) throw badRequest('One of those topics is not in this school.');
    await assertNoPrerequisiteCycle(topicId, requiredIds);
  }

  await prisma.$transaction(async (tx) => {
    await tx.topicPrerequisite.deleteMany({ where: { topicId } });
    if (prerequisites.length > 0) {
      await tx.topicPrerequisite.createMany({
        data: prerequisites.map((entry) => ({
          topicId,
          requiredTopicId: entry.requiredTopicId,
          isHard: entry.isHard,
        })),
        skipDuplicates: true,
      });
    }
  });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'Topic',
    targetId: topicId,
    schoolId,
    summary: `Set ${prerequisites.length} prerequisite(s) on topic "${topic.name}".`,
    afterData: { prerequisites },
  });

  return getTopic(schoolId, topicId);
}

// ── Objectives ──────────────────────────────────────────────────────────────

export async function listObjectives(schoolId: string, query: ObjectiveListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.LearningObjectiveWhereInput = {
    schoolId,
    ...(query.topicId ? { topicId: query.topicId } : {}),
    ...(query.search
      ? { OR: [{ code: { contains: query.search } }, { statement: { contains: query.search } }] }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.learningObjective.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        topic: { select: { id: true, name: true, key: true } },
        _count: { select: { activityLinks: true, questions: true } },
      },
    }),
    prisma.learningObjective.count({ where }),
  ]);

  return { items, totalItems };
}

export async function createObjective(
  context: ActorContext,
  schoolId: string,
  input: CreateObjectiveInput,
) {
  const topic = await prisma.topic.findFirst({
    where: { id: input.topicId, schoolId },
    select: { id: true },
  });
  if (!topic) throw notFound('Topic');

  const code = await uniqueKey(toKey(input.code, 40).toUpperCase(), async (value) => {
    const existing = await prisma.learningObjective.findFirst({
      where: { topicId: input.topicId, code: value },
      select: { id: true },
    });
    return existing === null;
  });

  const objective = await prisma.learningObjective.create({
    data: {
      schoolId,
      topicId: input.topicId,
      code,
      statement: input.statement,
      notes: input.notes,
      difficultyBand: input.difficultyBand,
      sortOrder: input.sortOrder,
    },
  });

  recordAudit(context, {
    action: 'curriculum.create',
    targetType: 'LearningObjective',
    targetId: objective.id,
    schoolId,
    summary: `Created objective ${objective.code}.`,
    afterData: objective,
  });

  return objective;
}

export async function updateObjective(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateObjectiveInput,
) {
  const before = await prisma.learningObjective.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Learning objective');

  const after = await prisma.learningObjective.update({ where: { id }, data: input });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'LearningObjective',
    targetId: id,
    schoolId,
    summary: `Updated objective ${after.code}.`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

/**
 * Objectives carry mastery evidence, so deletion is only allowed while nothing
 * references them. Otherwise the caller is told to retire the topic instead.
 */
export async function deleteObjective(context: ActorContext, schoolId: string, id: string) {
  const before = await prisma.learningObjective.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { masteryRecords: true, activityLinks: true, questions: true } } },
  });
  if (!before) throw notFound('Learning objective');

  const references =
    before._count.masteryRecords + before._count.activityLinks + before._count.questions;
  if (references > 0) {
    throw conflict('That objective is already referenced by evidence or content and cannot be deleted.');
  }

  await prisma.learningObjective.delete({ where: { id } });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: 'LearningObjective',
    targetId: id,
    schoolId,
    summary: `Deleted unused objective ${before.code}.`,
    beforeData: before,
  });

  return { deleted: true };
}

// ── Reordering ──────────────────────────────────────────────────────────────

type Orderable = 'unit' | 'topic' | 'objective' | 'program';

/** One request per drag-and-drop save, applied inside a transaction. */
export async function reorder(
  context: ActorContext,
  schoolId: string,
  kind: Orderable,
  items: { id: string; sortOrder: number }[],
) {
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (kind === 'program') {
        await tx.curriculumProgram.updateMany({
          where: { id: item.id, schoolId },
          data: { sortOrder: item.sortOrder },
        });
      } else if (kind === 'unit') {
        await tx.unit.updateMany({ where: { id: item.id, schoolId }, data: { sortOrder: item.sortOrder } });
      } else if (kind === 'topic') {
        await tx.topic.updateMany({ where: { id: item.id, schoolId }, data: { sortOrder: item.sortOrder } });
      } else {
        await tx.learningObjective.updateMany({
          where: { id: item.id, schoolId },
          data: { sortOrder: item.sortOrder },
        });
      }
    }
  });

  recordAudit(context, {
    action: 'curriculum.update',
    targetType: kind,
    targetId: items[0]?.id ?? 'bulk',
    schoolId,
    summary: `Reordered ${items.length} ${kind}(s).`,
    afterData: { items },
  });

  return { updated: items.length };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** `createdById` is a plain 32-char column, not a relation (see the schema notes). */
function shortId(userId: string): string {
  return userId.slice(0, 32);
}

async function assertSubject(schoolId: string, subjectId: string): Promise<void> {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  if (!subject) throw notFound('Subject');
}

async function assertGrade(schoolId: string, gradeId: string): Promise<void> {
  const grade = await prisma.grade.findFirst({ where: { id: gradeId, schoolId }, select: { id: true } });
  if (!grade) throw notFound('Grade');
}

/**
 * Walks the prerequisite graph upward from each proposed requirement. If the
 * topic being edited is reachable, adding the edge would create a cycle.
 */
async function assertNoPrerequisiteCycle(topicId: string, requiredIds: string[]): Promise<void> {
  const seen = new Set<string>(requiredIds);
  let frontier = requiredIds;

  for (let depth = 0; depth < 32 && frontier.length > 0; depth += 1) {
    const edges = await prisma.topicPrerequisite.findMany({
      where: { topicId: { in: frontier } },
      select: { requiredTopicId: true },
    });

    const next: string[] = [];
    for (const edge of edges) {
      if (edge.requiredTopicId === topicId) {
        throw badRequest('That prerequisite would create a circular dependency.');
      }
      if (!seen.has(edge.requiredTopicId)) {
        seen.add(edge.requiredTopicId);
        next.push(edge.requiredTopicId);
      }
    }
    frontier = next;
  }
}

async function uniqueKey(
  candidate: string,
  isFree: (value: string) => Promise<boolean>,
): Promise<string> {
  const base = candidate.length >= 2 ? candidate : `item-${candidate}`;
  if (await isFree(base)) return base;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const next = `${base}-${suffix}`;
    if (await isFree(next)) return next;
  }
  throw conflict('That key is already in use. Choose a different one.');
}
