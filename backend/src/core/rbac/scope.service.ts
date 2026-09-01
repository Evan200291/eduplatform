// ─────────────────────────────────────────────────────────────────────────────
// Database-backed scope resolution
// Blueprint 04: "A teacher sees the students they teach." That relationship is
// data, not a claim in a token, so it is resolved here against the class roster.
//
// Every list endpoint that returns learner data derives its filter from
// `accessibleStudentIds()` rather than trusting a `studentId` query parameter.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuthenticatedActor, TeacherScope, TenantContext } from '../context';
import { forbidden } from '../http/errors';
import { prisma } from '../prisma';
import { grantedClassIds, hasSchoolWideRead, isSelf, isStudent, requireSchoolId } from './authorize';

/**
 * Classes, grades and subjects a staff member is attached to. Role grants scoped
 * to a class are honoured in addition to `ClassTeacher` rows, so a temporary
 * cover assignment works without editing the roster.
 */
export async function teacherScope(
  actor: AuthenticatedActor,
  schoolId: string,
): Promise<TeacherScope> {
  const assignments = await prisma.classTeacher.findMany({
    where: { userId: actor.userId, removedAt: null, class: { schoolId } },
    select: { classId: true, subjectId: true, class: { select: { gradeId: true } } },
  });

  const classIds = new Set<string>(grantedClassIds(actor));
  const gradeIds = new Set<string>();
  const subjectIds = new Set<string>();

  for (const assignment of assignments) {
    classIds.add(assignment.classId);
    gradeIds.add(assignment.class.gradeId);
    if (assignment.subjectId) subjectIds.add(assignment.subjectId);
  }

  return { classIds: [...classIds], gradeIds: [...gradeIds], subjectIds: [...subjectIds] };
}

/**
 * The learner ids the actor may read.
 *
 * `null` means "every student in the active school" and is returned only for
 * actors with school-wide read. A student always gets exactly their own id.
 */
export async function accessibleStudentIds(
  actor: AuthenticatedActor,
  tenant: TenantContext | undefined,
): Promise<string[] | null> {
  if (isStudent(actor)) return [actor.userId];

  const schoolId = requireSchoolId(tenant);
  if (hasSchoolWideRead(actor)) return null;

  const scope = await teacherScope(actor, schoolId);
  if (scope.classIds.length === 0) return [];

  const memberships = await prisma.classMembership.findMany({
    where: { classId: { in: scope.classIds }, isActive: true, user: { schoolId } },
    select: { userId: true },
    distinct: ['userId'],
  });

  return memberships.map((membership) => membership.userId);
}

/** Throws unless the actor may read this learner's records. */
export async function assertCanViewStudent(
  actor: AuthenticatedActor,
  tenant: TenantContext | undefined,
  studentId: string,
): Promise<void> {
  if (isSelf(actor, studentId)) return;

  const allowed = await accessibleStudentIds(actor, tenant);
  if (allowed === null) return;
  if (allowed.includes(studentId)) return;

  throw forbidden('You do not have access to that student.');
}

/** Throws unless the actor is attached to this class (or reads school-wide). */
export async function assertCanAccessClass(
  actor: AuthenticatedActor,
  tenant: TenantContext | undefined,
  classId: string,
): Promise<void> {
  const schoolId = requireSchoolId(tenant);
  if (hasSchoolWideRead(actor)) return;

  if (isStudent(actor)) {
    const membership = await prisma.classMembership.findFirst({
      where: { classId, userId: actor.userId, isActive: true },
      select: { id: true },
    });
    if (membership) return;
    throw forbidden('You are not a member of that class.');
  }

  const scope = await teacherScope(actor, schoolId);
  if (scope.classIds.includes(classId)) return;

  throw forbidden('You are not assigned to that class.');
}

/** Active learner ids in a class, used by assignment fan-out and reporting. */
export async function classStudentIds(classId: string): Promise<string[]> {
  const memberships = await prisma.classMembership.findMany({
    where: { classId, isActive: true, user: { primaryRole: 'STUDENT' } },
    select: { userId: true },
  });
  return memberships.map((membership) => membership.userId);
}

/** Active learner ids in a grade, across every class in that grade. */
export async function gradeStudentIds(schoolId: string, gradeId: string): Promise<string[]> {
  const memberships = await prisma.classMembership.findMany({
    where: {
      isActive: true,
      user: { primaryRole: 'STUDENT', schoolId },
      class: { gradeId, schoolId },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return memberships.map((membership) => membership.userId);
}

/** Active learner ids studying a subject, via the classes that teach it. */
export async function subjectStudentIds(schoolId: string, subjectId: string): Promise<string[]> {
  const memberships = await prisma.classMembership.findMany({
    where: {
      isActive: true,
      user: { primaryRole: 'STUDENT', schoolId },
      class: { schoolId, classSubjects: { some: { subjectId } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return memberships.map((membership) => membership.userId);
}

/** Learner ids in a user group. */
export async function groupStudentIds(groupId: string): Promise<string[]> {
  const members = await prisma.userGroupMember.findMany({
    where: { groupId, user: { primaryRole: 'STUDENT' } },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}
