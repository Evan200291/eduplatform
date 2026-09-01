// ─────────────────────────────────────────────────────────────────────────────
// Assignment targets and fan-out
// Blueprint 03: "A teacher can assign to an individual, group, class, grade, or
// subject cohort." Targets are stored as (type, id) pairs, so both directions of
// the question live here:
//
//   forwards   which learners does this assignment reach?      → resolveTargetStudents
//   backwards  which assignments reach this learner?           → learnerTargetFilter
//
// Both read the live roster. A learner who joins a class after an assignment was set
// is therefore included, which is what a teacher expects — the alternative is a new
// pupil silently missing a fortnight of homework.
//
// `createMissingAttempts` lives here too: it is the step that turns a resolved
// roster into monitoring rows, and it is needed by the service (on publication) and
// by the scheduled sweep (for a learner who never opened the work).
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { AssignmentState, AssignmentTargetType, RoleKey, UserStatus } from '@prisma/client';
import { badRequest, notFound } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import {
  classStudentIds,
  gradeStudentIds,
  groupStudentIds,
  subjectStudentIds,
} from '../../core/rbac/scope.service';
import type { AssignmentTargetInput } from './assignments.validation';

/** States that still count as outstanding work for the learner. */
export const OUTSTANDING: AssignmentState[] = [
  AssignmentState.NOT_STARTED,
  AssignmentState.IN_PROGRESS,
];

/**
 * Creates the attempt rows that do not exist yet, and returns how many were written.
 *
 * Publication uses NOT_STARTED so the teacher's board is populated before anyone
 * opens the work; the overdue sweep uses OVERDUE, so a learner who never opened it
 * still appears in the record rather than being silently absent.
 */
export async function createMissingAttempts(
  schoolId: string,
  assignmentId: string,
  studentIds: readonly string[],
  state: AssignmentState,
): Promise<number> {
  if (studentIds.length === 0) return 0;

  const existing = await prisma.assignmentAttempt.findMany({
    where: { assignmentId, studentId: { in: [...studentIds] } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const have = new Set(existing.map((row) => row.studentId));
  const missing = studentIds.filter((studentId) => !have.has(studentId));
  if (missing.length === 0) return 0;

  const result = await prisma.assignmentAttempt.createMany({
    data: missing.map((studentId) => ({
      schoolId,
      assignmentId,
      studentId,
      attemptNumber: 1,
      state,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Every active learner an assignment's target list reaches, de-duplicated. */
export async function resolveTargetStudents(
  schoolId: string,
  targets: readonly { targetType: AssignmentTargetType; targetId: string }[],
): Promise<string[]> {
  const ids = new Set<string>();

  for (const target of targets) {
    switch (target.targetType) {
      case AssignmentTargetType.STUDENT:
        ids.add(target.targetId);
        break;
      case AssignmentTargetType.CLASS:
        for (const id of await classStudentIds(target.targetId)) ids.add(id);
        break;
      case AssignmentTargetType.GRADE:
        for (const id of await gradeStudentIds(schoolId, target.targetId)) ids.add(id);
        break;
      case AssignmentTargetType.SUBJECT:
        for (const id of await subjectStudentIds(schoolId, target.targetId)) ids.add(id);
        break;
      case AssignmentTargetType.GROUP:
        for (const id of await groupStudentIds(target.targetId)) ids.add(id);
        break;
    }
  }

  if (ids.size === 0) return [];

  // A target may name a learner who has since left or been archived; the roster is
  // the authority on who is actually set the work.
  const active = await prisma.user.findMany({
    where: {
      id: { in: [...ids] },
      schoolId,
      status: UserStatus.ACTIVE,
      primaryRole: RoleKey.STUDENT,
    },
    select: { id: true },
  });
  return active.map((user) => user.id);
}

/** Confirms each target exists in this school before it is stored. */
export async function assertTargetsExist(
  schoolId: string,
  targets: readonly AssignmentTargetInput[],
): Promise<void> {
  for (const target of targets) {
    const exists = await targetExists(schoolId, target);
    if (!exists) {
      throw badRequest(`That ${target.targetType.toLowerCase()} target does not exist in this school.`, {
        details: { targetType: target.targetType, targetId: target.targetId },
      });
    }
  }
}

async function targetExists(
  schoolId: string,
  target: AssignmentTargetInput,
): Promise<boolean> {
  switch (target.targetType) {
    case AssignmentTargetType.STUDENT:
      return (
        (await prisma.user.count({
          where: { id: target.targetId, schoolId, primaryRole: RoleKey.STUDENT },
        })) > 0
      );
    case AssignmentTargetType.CLASS:
      return (await prisma.class.count({ where: { id: target.targetId, schoolId } })) > 0;
    case AssignmentTargetType.GRADE:
      return (await prisma.grade.count({ where: { id: target.targetId, schoolId } })) > 0;
    case AssignmentTargetType.SUBJECT:
      return (await prisma.subject.count({ where: { id: target.targetId, schoolId } })) > 0;
    case AssignmentTargetType.GROUP:
      return (await prisma.userGroup.count({ where: { id: target.targetId, schoolId } })) > 0;
    default:
      return false;
  }
}

/**
 * The `where` fragment for "assignments set for this learner". Built from the
 * learner's own memberships rather than from a client-supplied list.
 */
export async function learnerTargetFilter(
  schoolId: string,
  studentId: string,
): Promise<Prisma.AssignmentWhereInput> {
  const memberships = await prisma.classMembership.findMany({
    where: { userId: studentId, isActive: true, class: { schoolId } },
    select: {
      classId: true,
      class: { select: { gradeId: true, classSubjects: { select: { subjectId: true } } } },
    },
  });
  const groups = await prisma.userGroupMember.findMany({
    where: { userId: studentId, group: { schoolId } },
    select: { groupId: true },
  });

  const classIds = memberships.map((row) => row.classId);
  const gradeIds = [...new Set(memberships.map((row) => row.class.gradeId))];
  const subjectIds = [
    ...new Set(memberships.flatMap((row) => row.class.classSubjects.map((cs) => cs.subjectId))),
  ];
  const groupIds = groups.map((row) => row.groupId);

  const clauses: Prisma.AssignmentTargetWhereInput[] = [
    { targetType: AssignmentTargetType.STUDENT, targetId: studentId },
  ];
  if (classIds.length > 0) {
    clauses.push({ targetType: AssignmentTargetType.CLASS, targetId: { in: classIds } });
  }
  if (gradeIds.length > 0) {
    clauses.push({ targetType: AssignmentTargetType.GRADE, targetId: { in: gradeIds } });
  }
  if (subjectIds.length > 0) {
    clauses.push({ targetType: AssignmentTargetType.SUBJECT, targetId: { in: subjectIds } });
  }
  if (groupIds.length > 0) {
    clauses.push({ targetType: AssignmentTargetType.GROUP, targetId: { in: groupIds } });
  }

  return { targets: { some: { OR: clauses } } };
}

/** Throws unless the learner is actually targeted by the assignment. */
export async function assertTargeted(
  schoolId: string,
  assignmentId: string,
  studentId: string,
): Promise<void> {
  const filter = await learnerTargetFilter(schoolId, studentId);
  const match = await prisma.assignment.count({ where: { id: assignmentId, schoolId, ...filter } });
  if (match === 0) throw notFound('Assignment');
}
