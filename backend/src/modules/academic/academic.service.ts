// ─────────────────────────────────────────────────────────────────────────────
// Academic structure service
// Grades, terms, subjects, classes, rosters and teacher assignments.
//
// Two rules hold throughout:
//  • Every read and write is filtered by `schoolId`, taken from the request
//    context — never from the body — so a crafted payload cannot cross tenants.
//  • Structural rows are archived, not deleted (blueprint 05). Progress and
//    mastery records reference a class or subject for years afterwards.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import { slugify } from '../../core/auth/codes';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { hasSchoolWideRead, isStudent } from '../../core/rbac/authorize';
import { teacherScope } from '../../core/rbac/scope.service';
import type {
  assignTeacherSchema,
  ClassListQuery,
  classSubjectSchema,
  createClassSchema,
  createGradeSchema,
  createSubjectSchema,
  createTermSchema,
  GradeListQuery,
  RosterListQuery,
  SubjectListQuery,
  TermListQuery,
  updateClassSchema,
  updateGradeSchema,
  updateSubjectSchema,
  updateTermSchema,
} from './academic.validation';

type CreateGradeInput = z.infer<typeof createGradeSchema>;
type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
type CreateTermInput = z.infer<typeof createTermSchema>;
type UpdateTermInput = z.infer<typeof updateTermSchema>;
type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
type CreateClassInput = z.infer<typeof createClassSchema>;
type UpdateClassInput = z.infer<typeof updateClassSchema>;
type AssignTeacherInput = z.infer<typeof assignTeacherSchema>;
type ClassSubjectInput = z.infer<typeof classSubjectSchema>;

// ── Grades ──────────────────────────────────────────────────────────────────

export async function listGrades(schoolId: string, query: GradeListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.GradeWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.search
      ? { OR: [{ name: { contains: query.search } }, { key: { contains: query.search } }] }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.grade.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }],
      select: {
        id: true,
        name: true,
        key: true,
        level: true,
        typicalAgeFrom: true,
        typicalAgeTo: true,
        ageMode: true,
        sortOrder: true,
        archivedAt: true,
        _count: { select: { classes: true, studentProfiles: true } },
      },
    }),
    prisma.grade.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getGrade(schoolId: string, id: string) {
  const grade = await prisma.grade.findFirst({
    where: { id, schoolId },
    include: {
      classes: {
        where: { archivedAt: null },
        select: { id: true, name: true, code: true, isActive: true },
        orderBy: { name: 'asc' },
      },
      _count: { select: { classes: true, studentProfiles: true, curriculumPrograms: true } },
    },
  });

  if (!grade) throw notFound('Grade');
  return grade;
}

export async function createGrade(
  context: ActorContext,
  schoolId: string,
  input: CreateGradeInput,
) {
  assertAgeRange(input.typicalAgeFrom, input.typicalAgeTo);

  const key = await uniqueGradeKey(schoolId, input.key ?? slugify(input.name));

  const grade = await prisma.grade.create({
    data: {
      schoolId,
      name: input.name,
      key,
      level: input.level,
      typicalAgeFrom: input.typicalAgeFrom,
      typicalAgeTo: input.typicalAgeTo,
      ageMode: input.ageMode,
      sortOrder: input.sortOrder,
    },
  });

  recordAudit(context, {
    action: 'grade.create',
    targetType: 'Grade',
    targetId: grade.id,
    schoolId,
    summary: `Created grade "${grade.name}".`,
    afterData: grade,
  });

  return grade;
}

export async function updateGrade(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateGradeInput,
) {
  const before = await prisma.grade.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Grade');

  assertAgeRange(
    input.typicalAgeFrom ?? before.typicalAgeFrom ?? undefined,
    input.typicalAgeTo ?? before.typicalAgeTo ?? undefined,
  );

  const key =
    input.key && input.key !== before.key ? await uniqueGradeKey(schoolId, input.key) : undefined;

  const after = await prisma.grade.update({
    where: { id },
    data: { ...input, ...(key ? { key } : {}) },
  });

  recordAudit(context, {
    action: 'grade.update',
    targetType: 'Grade',
    targetId: id,
    schoolId,
    summary: `Updated grade "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

/**
 * Archiving hides a grade from pickers but keeps it resolvable from historical
 * records. A grade with live classes is refused, because a class must always
 * resolve to a grade.
 */
export async function archiveGrade(
  context: ActorContext,
  schoolId: string,
  id: string,
  reason: string,
) {
  const before = await prisma.grade.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Grade');

  const liveClasses = await prisma.class.count({ where: { gradeId: id, archivedAt: null } });
  if (liveClasses > 0) {
    throw conflict(`Archive the ${liveClasses} class(es) in this grade first.`);
  }

  const after = await prisma.grade.update({
    where: { id },
    data: { archivedAt: before.archivedAt ? null : new Date() },
  });

  recordAudit(context, {
    action: 'grade.update',
    targetType: 'Grade',
    targetId: id,
    schoolId,
    summary: after.archivedAt ? `Archived grade "${after.name}".` : `Restored grade "${after.name}".`,
    reason,
    beforeData: { archivedAt: before.archivedAt },
    afterData: { archivedAt: after.archivedAt },
  });

  return after;
}

// ── Academic terms ──────────────────────────────────────────────────────────

export async function listTerms(schoolId: string, query: TermListQuery) {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.AcademicTermWhereInput = {
    schoolId,
    ...(query.current ? { isCurrent: true } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.academicTerm.findMany({
      where,
      skip,
      take,
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        isCurrent: true,
        _count: { select: { classes: true, assignments: true } },
      },
    }),
    prisma.academicTerm.count({ where }),
  ]);

  return { items, totalItems };
}

export async function createTerm(context: ActorContext, schoolId: string, input: CreateTermInput) {
  const term = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) {
      // Exactly one term is current, so reports and default filters have a single
      // unambiguous answer.
      await tx.academicTerm.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
    }
    return tx.academicTerm.create({
      data: {
        schoolId,
        name: input.name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isCurrent: input.isCurrent,
      },
    });
  });

  recordAudit(context, {
    action: 'term.create',
    targetType: 'AcademicTerm',
    targetId: term.id,
    schoolId,
    summary: `Created term "${term.name}".`,
    afterData: term,
  });

  return term;
}

export async function updateTerm(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateTermInput,
) {
  const before = await prisma.academicTerm.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Academic term');

  const startsAt = input.startsAt ?? before.startsAt;
  const endsAt = input.endsAt ?? before.endsAt;
  if (endsAt <= startsAt) throw badRequest('A term must end after it starts.');

  const after = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) {
      await tx.academicTerm.updateMany({
        where: { schoolId, isCurrent: true, id: { not: id } },
        data: { isCurrent: false },
      });
    }
    return tx.academicTerm.update({ where: { id }, data: input });
  });

  recordAudit(context, {
    action: 'term.update',
    targetType: 'AcademicTerm',
    targetId: id,
    schoolId,
    summary: `Updated term "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

// ── Subjects ────────────────────────────────────────────────────────────────

export async function listSubjects(schoolId: string, query: SubjectListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.SubjectWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive === 'true' }),
    ...(query.search
      ? { OR: [{ name: { contains: query.search } }, { key: { contains: query.search } }] }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.subject.findMany({
      where,
      skip,
      take,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        colorHex: true,
        iconKey: true,
        sortOrder: true,
        isActive: true,
        archivedAt: true,
        _count: { select: { topics: true, lessons: true, classSubjects: true } },
      },
    }),
    prisma.subject.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getSubject(schoolId: string, id: string) {
  const subject = await prisma.subject.findFirst({
    where: { id, schoolId },
    include: {
      _count: {
        select: {
          units: true,
          topics: true,
          lessons: true,
          activities: true,
          assessments: true,
          classSubjects: true,
        },
      },
    },
  });

  if (!subject) throw notFound('Subject');
  return subject;
}

export async function createSubject(
  context: ActorContext,
  schoolId: string,
  input: CreateSubjectInput,
) {
  const key = await uniqueSubjectKey(schoolId, input.key ?? slugify(input.name));

  const subject = await prisma.subject.create({
    data: {
      schoolId,
      name: input.name,
      key,
      description: input.description,
      colorHex: input.colorHex,
      iconKey: input.iconKey,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });

  recordAudit(context, {
    action: 'subject.create',
    targetType: 'Subject',
    targetId: subject.id,
    schoolId,
    summary: `Created subject "${subject.name}".`,
    afterData: subject,
  });

  return subject;
}

export async function updateSubject(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateSubjectInput,
) {
  const before = await prisma.subject.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Subject');

  const key =
    input.key && input.key !== before.key ? await uniqueSubjectKey(schoolId, input.key) : undefined;

  const after = await prisma.subject.update({
    where: { id },
    data: { ...input, ...(key ? { key } : {}) },
  });

  recordAudit(context, {
    action: 'subject.update',
    targetType: 'Subject',
    targetId: id,
    schoolId,
    summary: `Updated subject "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function archiveSubject(
  context: ActorContext,
  schoolId: string,
  id: string,
  reason: string,
) {
  const before = await prisma.subject.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Subject');

  const now = new Date();
  const restoring = before.archivedAt !== null;

  const after = await prisma.subject.update({
    where: { id },
    data: { archivedAt: restoring ? null : now, isActive: restoring },
  });

  recordAudit(context, {
    action: 'subject.update',
    targetType: 'Subject',
    targetId: id,
    schoolId,
    summary: restoring ? `Restored subject "${after.name}".` : `Archived subject "${after.name}".`,
    reason,
    beforeData: { archivedAt: before.archivedAt, isActive: before.isActive },
    afterData: { archivedAt: after.archivedAt, isActive: after.isActive },
  });

  return after;
}

// ── Classes ─────────────────────────────────────────────────────────────────

const CLASS_LIST_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  capacity: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  grade: { select: { id: true, name: true, key: true, level: true } },
  academicTerm: { select: { id: true, name: true, isCurrent: true } },
  classSubjects: {
    select: { subject: { select: { id: true, name: true, key: true, colorHex: true } } },
  },
  teachers: {
    where: { removedAt: null },
    select: {
      id: true,
      isLead: true,
      user: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      subject: { select: { id: true, name: true } },
    },
  },
  _count: { select: { memberships: true } },
} satisfies Prisma.ClassSelect;

export async function listClasses(
  context: ActorContext,
  schoolId: string,
  query: ClassListQuery,
) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.ClassWhereInput = {
    schoolId,
    ...(query.includeArchived ? {} : { archivedAt: null }),
    ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    ...(query.academicTermId ? { academicTermId: query.academicTermId } : {}),
    ...(query.subjectId ? { classSubjects: { some: { subjectId: query.subjectId } } } : {}),
    ...(query.teacherId
      ? { teachers: { some: { userId: query.teacherId, removedAt: null } } }
      : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] }
      : {}),
  };

  // Blueprint 04: a teacher sees the classes they teach. Narrowing happens here
  // rather than in the query string, so `?mine=false` cannot widen the result.
  if (isStudent(context.actor)) {
    where.memberships = { some: { userId: context.actor.userId, isActive: true } };
  } else if (query.mine || !hasSchoolWideRead(context.actor)) {
    const scope = await teacherScope(context.actor, schoolId);
    where.id = { in: scope.classIds.length > 0 ? scope.classIds : ['__none__'] };
  }

  const [items, totalItems] = await Promise.all([
    prisma.class.findMany({
      where,
      skip,
      take,
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
      select: CLASS_LIST_SELECT,
    }),
    prisma.class.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getClass(schoolId: string, id: string) {
  const record = await prisma.class.findFirst({
    where: { id, schoolId },
    select: {
      ...CLASS_LIST_SELECT,
      classSubjects: {
        select: {
          id: true,
          weeklyMinutes: true,
          subject: { select: { id: true, name: true, key: true, colorHex: true, iconKey: true } },
        },
      },
    },
  });

  if (!record) throw notFound('Class');
  return record;
}

export async function createClass(
  context: ActorContext,
  schoolId: string,
  input: CreateClassInput,
) {
  const grade = await prisma.grade.findFirst({
    where: { id: input.gradeId, schoolId },
    select: { id: true, archivedAt: true, name: true },
  });
  if (!grade) throw notFound('Grade');
  if (grade.archivedAt) throw badRequest('That grade is archived.');

  if (input.academicTermId) await assertTermInSchool(schoolId, input.academicTermId);
  const subjectIds = await filterSchoolSubjects(schoolId, input.subjectIds);

  const code = await uniqueClassCode(schoolId, input.code ?? deriveClassCode(grade.name, input.name));

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.class.create({
      data: {
        schoolId,
        gradeId: input.gradeId,
        academicTermId: input.academicTermId,
        name: input.name,
        code,
        description: input.description,
        capacity: input.capacity,
        isActive: input.isActive,
      },
    });

    if (subjectIds.length > 0) {
      await tx.classSubject.createMany({
        data: subjectIds.map((subjectId) => ({ classId: record.id, subjectId })),
        skipDuplicates: true,
      });
    }

    return record;
  });

  recordAudit(context, {
    action: 'class.create',
    targetType: 'Class',
    targetId: created.id,
    schoolId,
    summary: `Created class "${created.name}".`,
    afterData: created,
  });

  return getClass(schoolId, created.id);
}

export async function updateClass(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateClassInput,
) {
  const before = await prisma.class.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Class');

  if (input.gradeId && input.gradeId !== before.gradeId) {
    const grade = await prisma.grade.findFirst({
      where: { id: input.gradeId, schoolId },
      select: { id: true },
    });
    if (!grade) throw notFound('Grade');
  }
  if (input.academicTermId) await assertTermInSchool(schoolId, input.academicTermId);

  const code =
    input.code && input.code !== before.code
      ? await uniqueClassCode(schoolId, input.code)
      : undefined;

  const after = await prisma.class.update({
    where: { id },
    data: { ...input, ...(code ? { code } : {}) },
  });

  recordAudit(context, {
    action: 'class.update',
    targetType: 'Class',
    targetId: id,
    schoolId,
    summary: `Updated class "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return getClass(schoolId, id);
}

export async function archiveClass(
  context: ActorContext,
  schoolId: string,
  id: string,
  reason: string,
) {
  const before = await prisma.class.findFirst({ where: { id, schoolId } });
  if (!before) throw notFound('Class');

  const restoring = before.archivedAt !== null;
  const now = new Date();

  const after = await prisma.$transaction(async (tx) => {
    const record = await tx.class.update({
      where: { id },
      data: { archivedAt: restoring ? null : now, isActive: restoring },
    });
    if (!restoring) {
      // Memberships close with the class so a learner's "my classes" list is
      // correct immediately, while the rows survive for reporting.
      await tx.classMembership.updateMany({
        where: { classId: id, isActive: true },
        data: { isActive: false, leftAt: now },
      });
    }
    return record;
  });

  recordAudit(context, {
    action: 'class.update',
    targetType: 'Class',
    targetId: id,
    schoolId,
    summary: restoring ? `Restored class "${after.name}".` : `Archived class "${after.name}".`,
    reason,
    beforeData: { archivedAt: before.archivedAt },
    afterData: { archivedAt: after.archivedAt },
  });

  return after;
}

// ── Class subjects ──────────────────────────────────────────────────────────

/** Replaces the subject list for a class in one call, which is how the admin UI edits it. */
export async function setClassSubjects(
  context: ActorContext,
  schoolId: string,
  classId: string,
  subjectIds: string[],
) {
  const record = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true },
  });
  if (!record) throw notFound('Class');

  const allowed = await filterSchoolSubjects(schoolId, subjectIds);

  await prisma.$transaction(async (tx) => {
    await tx.classSubject.deleteMany({ where: { classId, subjectId: { notIn: allowed.length > 0 ? allowed : ['__none__'] } } });
    if (allowed.length > 0) {
      await tx.classSubject.createMany({
        data: allowed.map((subjectId) => ({ classId, subjectId })),
        skipDuplicates: true,
      });
    }
  });

  recordAudit(context, {
    action: 'class.update',
    targetType: 'Class',
    targetId: classId,
    schoolId,
    summary: `Set ${allowed.length} subject(s) on class "${record.name}".`,
    afterData: { subjectIds: allowed },
  });

  return getClass(schoolId, classId);
}

export async function updateClassSubject(
  context: ActorContext,
  schoolId: string,
  classId: string,
  input: ClassSubjectInput,
) {
  const record = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
  if (!record) throw notFound('Class');
  await filterSchoolSubjects(schoolId, [input.subjectId]);

  const link = await prisma.classSubject.upsert({
    where: { classId_subjectId: { classId, subjectId: input.subjectId } },
    create: { classId, subjectId: input.subjectId, weeklyMinutes: input.weeklyMinutes },
    update: { weeklyMinutes: input.weeklyMinutes },
  });

  recordAudit(context, {
    action: 'class.update',
    targetType: 'ClassSubject',
    targetId: link.id,
    schoolId,
    summary: 'Updated a class subject allocation.',
    afterData: link,
  });

  return link;
}

// ── Roster ──────────────────────────────────────────────────────────────────

export async function listRoster(schoolId: string, classId: string, query: RosterListQuery) {
  const record = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
  if (!record) throw notFound('Class');

  const { skip, take } = toSkipTake(query);
  const where: Prisma.ClassMembershipWhereInput = {
    classId,
    ...(query.includeInactive ? {} : { isActive: true }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.classMembership.findMany({
      where,
      skip,
      take,
      orderBy: { user: { lastName: 'asc' } },
      select: {
        id: true,
        joinedAt: true,
        leftAt: true,
        isActive: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            // The teacher roster searches on it, and a learner who has set one
            // is more recognisable by it than by their registered name.
            nickname: true,
            studentCode: true,
            status: true,
            primaryRole: true,
            avatarMediaId: true,
          },
        },
      },
    }),
    prisma.classMembership.count({ where }),
  ]);

  return { items, totalItems };
}

export async function addStudentsToClass(
  context: ActorContext,
  schoolId: string,
  classId: string,
  userIds: string[],
) {
  const record = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, capacity: true, archivedAt: true },
  });
  if (!record) throw notFound('Class');
  if (record.archivedAt) throw badRequest('That class is archived.');

  // Only users inside this school can be added, whatever ids were posted.
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, schoolId, archivedAt: null },
    select: { id: true },
  });
  const validIds = users.map((user) => user.id);
  if (validIds.length === 0) throw badRequest('None of those users belong to this school.');

  if (record.capacity !== null) {
    const active = await prisma.classMembership.count({ where: { classId, isActive: true } });
    if (active + validIds.length > record.capacity) {
      throw conflict(`That class holds ${record.capacity} learners and is full.`);
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const userId of validIds) {
      // Re-adding a learner reactivates the original row so their history is
      // continuous rather than split across two memberships.
      await tx.classMembership.upsert({
        where: { classId_userId: { classId, userId } },
        create: { classId, userId, addedById: context.actor.userId.slice(0, 32) },
        update: { isActive: true, leftAt: null, joinedAt: now },
      });
    }
  });

  recordAudit(context, {
    action: 'class.roster.update',
    targetType: 'Class',
    targetId: classId,
    schoolId,
    summary: `Added ${validIds.length} learner(s) to class "${record.name}".`,
    afterData: { added: validIds },
  });

  return { added: validIds.length, skipped: userIds.length - validIds.length };
}

export async function removeStudentsFromClass(
  context: ActorContext,
  schoolId: string,
  classId: string,
  userIds: string[],
  hard: boolean,
) {
  const record = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true },
  });
  if (!record) throw notFound('Class');

  const result = hard
    ? await prisma.classMembership.deleteMany({ where: { classId, userId: { in: userIds } } })
    : await prisma.classMembership.updateMany({
        where: { classId, userId: { in: userIds }, isActive: true },
        data: { isActive: false, leftAt: new Date() },
      });

  recordAudit(context, {
    action: 'class.roster.update',
    targetType: 'Class',
    targetId: classId,
    schoolId,
    summary: `Removed ${result.count} learner(s) from class "${record.name}".`,
    beforeData: { userIds },
    afterData: { hard },
  });

  return { removed: result.count };
}

export async function listClassTeachers(schoolId: string, classId: string) {
  const record = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
  if (!record) throw notFound('Class');

  return prisma.classTeacher.findMany({
    where: { classId, removedAt: null },
    orderBy: [{ isLead: 'desc' }, { assignedAt: 'asc' }],
    select: {
      id: true,
      isLead: true,
      assignedAt: true,
      user: {
        select: { id: true, firstName: true, lastName: true, displayName: true, email: true, primaryRole: true },
      },
      subject: { select: { id: true, name: true, key: true } },
    },
  });
}

/**
 * Blueprint 04: teacher visibility is derived from this table, so an assignment
 * is an access grant. A subject-specific assignment and a whole-class assignment
 * are distinct rows, which is why the lookup is explicit rather than an upsert
 * (`subjectId` is nullable and cannot be used in a compound unique lookup).
 */
export async function assignClassTeacher(
  context: ActorContext,
  schoolId: string,
  classId: string,
  input: AssignTeacherInput,
) {
  const record = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true },
  });
  if (!record) throw notFound('Class');

  const teacher = await prisma.user.findFirst({
    where: { id: input.userId, schoolId, archivedAt: null },
    select: { id: true, displayName: true, primaryRole: true },
  });
  if (!teacher) throw notFound('User');
  if (teacher.primaryRole === 'STUDENT') throw badRequest('A learner cannot be assigned as a teacher.');

  if (input.subjectId) await filterSchoolSubjects(schoolId, [input.subjectId]);

  const existing = await prisma.classTeacher.findFirst({
    where: { classId, userId: input.userId, subjectId: input.subjectId ?? null },
    select: { id: true },
  });

  const assignment = await prisma.$transaction(async (tx) => {
    if (input.isLead) {
      // One lead per class keeps homework defaults and report ownership single-valued.
      await tx.classTeacher.updateMany({ where: { classId, isLead: true }, data: { isLead: false } });
    }
    return existing
      ? tx.classTeacher.update({
          where: { id: existing.id },
          data: { isLead: input.isLead, removedAt: null },
        })
      : tx.classTeacher.create({
          data: {
            classId,
            userId: input.userId,
            subjectId: input.subjectId,
            isLead: input.isLead,
          },
        });
  });

  recordAudit(context, {
    action: 'class.teacher.assign',
    targetType: 'ClassTeacher',
    targetId: assignment.id,
    schoolId,
    summary: `Assigned ${teacher.displayName} to class "${record.name}".`,
    afterData: assignment,
  });

  return assignment;
}

export async function removeClassTeacher(
  context: ActorContext,
  schoolId: string,
  classId: string,
  teacherId: string,
) {
  const record = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true },
  });
  if (!record) throw notFound('Class');

  const result = await prisma.classTeacher.updateMany({
    where: { classId, userId: teacherId, removedAt: null },
    data: { removedAt: new Date(), isLead: false },
  });
  if (result.count === 0) throw notFound('Class teacher assignment');

  recordAudit(context, {
    action: 'class.teacher.remove',
    targetType: 'Class',
    targetId: classId,
    schoolId,
    summary: `Removed a teacher from class "${record.name}".`,
    beforeData: { userId: teacherId },
  });

  return { removed: result.count };
}

/** The classes the signed-in staff member teaches, for the teacher portal home. */
export async function myClasses(context: ActorContext, schoolId: string) {
  const scope = await teacherScope(context.actor, schoolId);
  if (scope.classIds.length === 0 && !hasSchoolWideRead(context.actor)) return [];

  return prisma.class.findMany({
    where: {
      schoolId,
      archivedAt: null,
      ...(hasSchoolWideRead(context.actor) ? {} : { id: { in: scope.classIds } }),
    },
    orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    select: CLASS_LIST_SELECT,
  });
}

/** The classes a learner belongs to, for the student home screen. */
export async function myEnrolledClasses(userId: string, schoolId: string) {
  const memberships = await prisma.classMembership.findMany({
    where: { userId, isActive: true, class: { schoolId, archivedAt: null } },
    select: {
      joinedAt: true,
      class: {
        select: {
          id: true,
          name: true,
          code: true,
          grade: { select: { id: true, name: true, level: true } },
          classSubjects: {
            select: { subject: { select: { id: true, name: true, key: true, colorHex: true, iconKey: true } } },
          },
          teachers: {
            where: { removedAt: null, isLead: true },
            select: { user: { select: { id: true, displayName: true } } },
          },
        },
      },
    },
  });

  return memberships.map((membership) => ({ joinedAt: membership.joinedAt, ...membership.class }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function assertAgeRange(from?: number, to?: number): void {
  if (from !== undefined && to !== undefined && to < from) {
    throw badRequest('The typical age range must end at or after it starts.');
  }
}

async function assertTermInSchool(schoolId: string, termId: string): Promise<void> {
  const term = await prisma.academicTerm.findFirst({
    where: { id: termId, schoolId },
    select: { id: true },
  });
  if (!term) throw notFound('Academic term');
}

/**
 * Keeps only the subject ids that belong to this school. Silently dropping a
 * foreign id would hide a mistake, so a fully foreign list is refused.
 */
async function filterSchoolSubjects(schoolId: string, subjectIds: string[]): Promise<string[]> {
  if (subjectIds.length === 0) return [];
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds }, schoolId },
    select: { id: true },
  });
  if (subjects.length === 0) throw forbidden('Those subjects do not belong to this school.');
  return subjects.map((subject) => subject.id);
}

function deriveClassCode(gradeName: string, className: string): string {
  const initials = (text: string) =>
    text
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join('');
  const candidate = `${initials(gradeName)}${initials(className)}`.slice(0, 12);
  return candidate.length >= 2 ? candidate : 'CLASS';
}

async function uniqueGradeKey(schoolId: string, candidate: string): Promise<string> {
  return uniqueValue(candidate, async (value) => {
    const existing = await prisma.grade.findFirst({
      where: { schoolId, key: value },
      select: { id: true },
    });
    return existing === null;
  });
}

async function uniqueSubjectKey(schoolId: string, candidate: string): Promise<string> {
  return uniqueValue(candidate, async (value) => {
    const existing = await prisma.subject.findFirst({
      where: { schoolId, key: value },
      select: { id: true },
    });
    return existing === null;
  });
}

async function uniqueClassCode(schoolId: string, candidate: string): Promise<string> {
  return uniqueValue(candidate.toUpperCase(), async (value) => {
    const existing = await prisma.class.findFirst({
      where: { schoolId, code: value },
      select: { id: true },
    });
    return existing === null;
  });
}

/** Appends `-2`, `-3`… rather than rejecting a duplicate name outright. */
async function uniqueValue(
  candidate: string,
  isFree: (value: string) => Promise<boolean>,
): Promise<string> {
  if (await isFree(candidate)) return candidate;
  for (let suffix = 2; suffix <= 50; suffix += 1) {
    const next = `${candidate}-${suffix}`;
    if (await isFree(next)) return next;
  }
  throw conflict('That name is already in use. Choose a different one.');
}
