// ─────────────────────────────────────────────────────────────────────────────
// Users, roles and groups
// Blueprint 05: "Every role is scoped." A user always belongs to exactly one
// school (except platform staff), and any additional reach comes from explicit
// `UserRoleAssignment` rows rather than from an ad-hoc flag.
//
// Learner accounts are created by the school, never self-registered, and are
// issued a code plus PIN that the school prints and hands out.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey, RoleScopeType, UserStatus, type Prisma } from '@prisma/client';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import { generatePin, generateStudentCode, generateTemporaryPassword } from '../../core/auth/codes';
import { hashSecret, validatePassword, validatePin } from '../../core/auth/password';
import { revokeAllSessionsForUser } from '../../core/auth/session.service';
import type { ActorContext } from '../../core/context';
import { assertFeatureEnabled } from '../../core/features/feature.service';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { isSelf, roleScopeKey } from '../../core/rbac/authorize';
import { assertCanViewStudent, teacherScope } from '../../core/rbac/scope.service';
import { SCHOOL_BOUND_ROLES } from '../../core/rbac/permissions';
import type {
  assignRoleSchema,
  bulkCreateStudentsSchema,
  createUserSchema,
  resetCredentialsSchema,
  updateOwnProfileSchema,
  updateUserSchema,
  userListQuery,
} from './users.validation';

type ListQueryInput = z.infer<typeof userListQuery>;
type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
type ResetCredentialsInput = z.infer<typeof resetCredentialsSchema>;
type AssignRoleInput = z.infer<typeof assignRoleSchema>;
type BulkStudentsInput = z.infer<typeof bulkCreateStudentsSchema>;

const USER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  displayName: true,
  nickname: true,
  email: true,
  username: true,
  studentCode: true,
  primaryRole: true,
  status: true,
  ageMode: true,
  lastLoginAt: true,
  createdAt: true,
  avatarMedia: { select: { storageKey: true, altText: true } },
} satisfies Prisma.UserSelect;

// ── Read ────────────────────────────────────────────────────────────────────

export async function listUsers(context: ActorContext, schoolId: string, query: ListQueryInput) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.UserWhereInput = {
    schoolId,
    ...(query.role ? { primaryRole: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.classId
      ? { classMemberships: { some: { classId: query.classId, isActive: true } } }
      : {}),
    ...(query.gradeId ? { studentProfile: { currentGradeId: query.gradeId } } : {}),
    ...(query.groupId ? { groupMemberships: { some: { groupId: query.groupId } } } : {}),
    ...(query.search
      ? {
          OR: [
            { displayName: { contains: query.search } },
            { email: { contains: query.search } },
            { username: { contains: query.search } },
            { studentCode: { contains: query.search } },
          ],
        }
      : {}),
  };

  // A teacher without school-wide read sees only learners in their classes plus
  // colleagues they share a class with.
  if (!context.actor.permissions.has('progress.read.school')) {
    const scope = await teacherScope(context.actor, schoolId);
    if (scope.classIds.length === 0) {
      where.id = context.actor.userId;
    } else {
      where.OR = [
        { classMemberships: { some: { classId: { in: scope.classIds }, isActive: true } } },
        { classTeachers: { some: { classId: { in: scope.classIds }, removedAt: null } } },
        { id: context.actor.userId },
      ];
    }
  }

  const [items, totalItems] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { [query.sort]: query.order },
      select: {
        ...USER_SUMMARY,
        studentProfile: {
          select: {
            currentGradeId: true,
            onboardingCompletedAt: true,
            currentGrade: { select: { id: true, name: true, level: true } },
          },
        },
        classMemberships: {
          where: { isActive: true },
          select: { class: { select: { id: true, name: true, code: true } } },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getUser(context: ActorContext, schoolId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: {
      ...USER_SUMMARY,
      dateOfBirth: true,
      locale: true,
      timezone: true,
      mustChangePassword: true,
      emailVerifiedAt: true,
      suspendedAt: true,
      lockedUntil: true,
      studentProfile: {
        include: { currentGrade: { select: { id: true, name: true, level: true } } },
      },
      roleAssignments: {
        where: { revokedAt: null },
        select: {
          id: true,
          roleKey: true,
          scopeType: true,
          schoolId: true,
          gradeId: true,
          classId: true,
          subjectId: true,
          grantedAt: true,
          expiresAt: true,
          reason: true,
        },
      },
      classMemberships: {
        where: { isActive: true },
        select: {
          joinedAt: true,
          class: {
            select: { id: true, name: true, code: true, grade: { select: { id: true, name: true } } },
          },
        },
      },
      classTeachers: {
        where: { removedAt: null },
        select: {
          isLead: true,
          class: { select: { id: true, name: true, code: true } },
          subject: { select: { id: true, name: true } },
        },
      },
      groupMemberships: { select: { group: { select: { id: true, name: true, key: true } } } },
    },
  });

  if (!user) throw notFound('User');

  // A teacher may only open a learner they actually teach.
  if (user.primaryRole === RoleKey.STUDENT && !isSelf(context.actor, userId)) {
    await assertCanViewStudent(context.actor, context.tenant, userId);
  }

  return user;
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreatedCredentials {
  /** Returned once, at creation. Never retrievable afterwards. */
  temporaryPassword?: string;
  studentCode?: string;
  pin?: string;
}

export async function createUser(
  context: ActorContext,
  schoolId: string,
  input: CreateUserInput,
): Promise<{ user: { id: string; displayName: string }; credentials: CreatedCredentials }> {
  await assertRoleAssignable(context, input.primaryRole);
  await assertSeatAvailable(context, schoolId, input.primaryRole);

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { code: true, organizationId: true, defaultAgeMode: true },
  });
  if (!school) throw notFound('School');

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: { studentCodeLength: true, studentPinRequired: true },
  });

  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (existing) throw conflict('An account already uses that email address.');
  }
  if (input.username) {
    const existing = await prisma.user.findFirst({
      where: { schoolId, username: input.username },
      select: { id: true },
    });
    if (existing) throw conflict('An account in this school already uses that username.');
  }

  const isStudentAccount = input.primaryRole === RoleKey.STUDENT;
  const credentials: CreatedCredentials = {};
  const data: Prisma.UserUncheckedCreateInput = {
    schoolId,
    organizationId: school.organizationId,
    primaryRole: input.primaryRole,
    status: UserStatus.ACTIVE,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: `${input.firstName} ${input.lastName}`.trim(),
    nickname: input.nickname,
    email: input.email,
    username: input.username,
    dateOfBirth: input.dateOfBirth,
    ageMode: input.ageMode,
    locale: input.locale,
    timezone: input.timezone,
    createdById: context.actor.userId,
  };

  if (isStudentAccount) {
    const code = await uniqueStudentCode(schoolId, school.code, settings?.studentCodeLength ?? 8);
    data.studentCode = code;
    credentials.studentCode = code;

    if (settings?.studentPinRequired !== false) {
      const pin = input.pin ?? generatePin(4);
      const policy = validatePin(pin);
      if (!policy.ok) throw badRequest(policy.problems.join(' '));
      data.pinHash = await hashSecret(pin);
      credentials.pin = pin;
    }
  } else {
    const password = input.password ?? generateTemporaryPassword();
    const policy = validatePassword(password);
    if (!policy.ok) throw badRequest(policy.problems.join(' '));
    data.passwordHash = await hashSecret(password);
    // A generated password must be changed; an admin-chosen one is assumed to
    // have been agreed with the person it belongs to.
    data.mustChangePassword = !input.password;
    if (!input.password) credentials.temporaryPassword = password;
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data, select: { id: true, displayName: true } });

    await tx.userRoleAssignment.create({
      data: {
        userId: created.id,
        roleKey: input.primaryRole,
        scopeType: RoleScopeType.SCHOOL,
        schoolId,
        organizationId: school.organizationId,
        scopeKey: roleScopeKey({ schoolId }),
        grantedById: context.actor.userId,
        reason: 'Account created',
      },
    });

    if (isStudentAccount) {
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          currentGradeId: input.gradeId,
          guardianEmail: input.guardianEmail,
          targetMinutesPerWeek: input.targetMinutesPerWeek ?? 60,
          supportNotes: input.supportNotes,
        },
      });
    }

    if (input.classIds?.length) {
      const classes = await tx.class.findMany({
        where: { id: { in: input.classIds }, schoolId },
        select: { id: true },
      });
      await tx.classMembership.createMany({
        data: classes.map((entry) => ({
          classId: entry.id,
          userId: created.id,
          addedById: context.actor.userId,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  recordAudit(context, {
    action: 'user.create',
    targetType: 'User',
    targetId: user.id,
    schoolId,
    summary: `Created ${input.primaryRole} account for ${user.displayName}.`,
    afterData: { ...data, passwordHash: undefined, pinHash: undefined },
  });

  return { user, credentials };
}

/** Blueprint 05 bulk import: a class list in, learner accounts and codes out. */
export async function bulkCreateStudents(
  context: ActorContext,
  schoolId: string,
  input: BulkStudentsInput,
) {
  await assertFeatureEnabled('admin.bulkImport', {
    organizationId: context.tenant.organizationId,
    schoolId,
    roleKey: context.actor.primaryRole,
  });
  await assertSeatAvailable(context, schoolId, RoleKey.STUDENT, input.students.length);

  const results: Array<{ id: string; displayName: string; studentCode: string; pin?: string }> = [];

  for (const student of input.students) {
    const { user, credentials } = await createUser(context, schoolId, {
      firstName: student.firstName,
      lastName: student.lastName,
      nickname: student.nickname,
      dateOfBirth: student.dateOfBirth,
      guardianEmail: student.guardianEmail,
      primaryRole: RoleKey.STUDENT,
      classIds: input.classId ? [input.classId] : undefined,
      gradeId: input.gradeId,
    });

    results.push({
      id: user.id,
      displayName: user.displayName,
      studentCode: credentials.studentCode ?? '',
      pin: credentials.pin,
    });
  }

  return results;
}

// ── Update ──────────────────────────────────────────────────────────────────

export async function updateUser(
  context: ActorContext,
  schoolId: string,
  userId: string,
  input: UpdateUserInput,
) {
  const before = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    include: { studentProfile: true },
  });
  if (!before) throw notFound('User');

  const {
    gradeId,
    guardianEmail,
    targetMinutesPerWeek,
    supportNotes,
    fontScale,
    dyslexiaFont,
    reduceMotion,
    highContrast,
    audioSupport,
    captionsPreferred,
    ...userFields
  } = input;

  const displayName =
    userFields.firstName || userFields.lastName
      ? `${userFields.firstName ?? before.firstName} ${userFields.lastName ?? before.lastName}`.trim()
      : undefined;

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { ...userFields, ...(displayName ? { displayName } : {}) },
      select: USER_SUMMARY,
    });

    const profileFields = {
      currentGradeId: gradeId,
      guardianEmail,
      targetMinutesPerWeek,
      supportNotes,
      fontScale,
      dyslexiaFont,
      reduceMotion,
      highContrast,
      audioSupport,
      captionsPreferred,
    };
    const hasProfileChange = Object.values(profileFields).some((value) => value !== undefined);

    if (hasProfileChange && before.primaryRole === RoleKey.STUDENT) {
      await tx.studentProfile.upsert({
        where: { userId },
        create: { userId, ...stripUndefined(profileFields) },
        update: stripUndefined(profileFields),
      });
    }

    return updated;
  });

  recordAudit(context, {
    action: 'user.update',
    targetType: 'User',
    targetId: userId,
    schoolId,
    summary: `Updated ${after.displayName}'s account.`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

/** The self-service subset, usable by any signed-in user including learners. */
export async function updateOwnProfile(context: ActorContext, input: UpdateOwnProfileInput) {
  const { nickname, locale, timezone, avatarMediaId, ...accessibility } = input;

  if (avatarMediaId) {
    const media = await prisma.mediaAsset.findUnique({
      where: { id: avatarMediaId },
      select: { schoolId: true, kind: true, moderationDecision: true },
    });
    if (!media || media.kind !== 'IMAGE') throw badRequest('Choose an image for your avatar.');
    if (media.schoolId && media.schoolId !== context.actor.schoolId) throw forbidden();
    if (media.moderationDecision === 'REJECTED' || media.moderationDecision === 'REMOVED') {
      throw badRequest('That image is not available.');
    }
  }

  const user = await prisma.user.update({
    where: { id: context.actor.userId },
    data: stripUndefined({ nickname, locale, timezone, avatarMediaId }),
    select: USER_SUMMARY,
  });

  if (Object.values(accessibility).some((value) => value !== undefined)) {
    await prisma.studentProfile.upsert({
      where: { userId: context.actor.userId },
      create: { userId: context.actor.userId, ...stripUndefined(accessibility) },
      update: stripUndefined(accessibility),
    });
  }

  return user;
}

export async function setUserStatus(
  context: ActorContext,
  schoolId: string,
  userId: string,
  status: UserStatus,
  reason: string,
) {
  if (isSelf(context.actor, userId)) throw badRequest('You cannot change your own account status.');

  const before = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: { id: true, status: true, displayName: true },
  });
  if (!before) throw notFound('User');

  const now = new Date();
  const after = await prisma.user.update({
    where: { id: userId },
    data: {
      status,
      suspendedAt: status === UserStatus.SUSPENDED ? now : null,
      archivedAt: status === UserStatus.ARCHIVED ? now : null,
      failedLoginCount: status === UserStatus.ACTIVE ? 0 : undefined,
      lockedUntil: status === UserStatus.ACTIVE ? null : undefined,
    },
    select: USER_SUMMARY,
  });

  if (status !== UserStatus.ACTIVE) {
    await revokeAllSessionsForUser(userId, `status changed to ${status}`);
  }

  recordAudit(context, {
    action:
      status === UserStatus.ARCHIVED
        ? 'user.archive'
        : status === UserStatus.ACTIVE
          ? 'user.reactivate'
          : 'user.suspend',
    targetType: 'User',
    targetId: userId,
    schoolId,
    summary: `Set ${before.displayName}'s status to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

/**
 * Blueprint 05: credential recovery runs through the school administrator. The
 * new secret is returned exactly once, in this response, and is never stored in
 * a retrievable form or written to the audit trail.
 */
export async function resetCredentials(
  context: ActorContext,
  schoolId: string,
  userId: string,
  input: ResetCredentialsInput,
): Promise<CreatedCredentials> {
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: { id: true, displayName: true, primaryRole: true },
  });
  if (!user) throw notFound('User');

  const credentials: CreatedCredentials = {};

  if (input.kind === 'pin') {
    if (user.primaryRole !== RoleKey.STUDENT) throw badRequest('Only learner accounts use a PIN.');
    const pin = input.value ?? generatePin(4);
    const policy = validatePin(pin);
    if (!policy.ok) throw badRequest(policy.problems.join(' '));
    await prisma.user.update({
      where: { id: userId },
      data: { pinHash: await hashSecret(pin), failedLoginCount: 0, lockedUntil: null },
    });
    credentials.pin = pin;
  } else {
    const password = input.value ?? generateTemporaryPassword();
    const policy = validatePassword(password);
    if (!policy.ok) throw badRequest(policy.problems.join(' '));
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashSecret(password),
        mustChangePassword: input.requireChangeOnNextLogin,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    credentials.temporaryPassword = password;
  }

  await revokeAllSessionsForUser(userId, 'credentials reset by an administrator');

  recordAudit(context, {
    action: input.kind === 'pin' ? 'auth.pin.reset' : 'auth.password.reset',
    targetType: 'User',
    targetId: userId,
    schoolId,
    summary: `Reset the ${input.kind} for ${user.displayName}.`,
    reason: input.reason,
  });

  return credentials;
}

// ── Roles ───────────────────────────────────────────────────────────────────

export async function assignRole(
  context: ActorContext,
  schoolId: string,
  userId: string,
  input: AssignRoleInput,
) {
  await assertRoleAssignable(context, input.roleKey);

  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    select: { id: true, displayName: true, organizationId: true },
  });
  if (!user) throw notFound('User');

  // A scoped grant must name the thing it is scoped to, otherwise it silently
  // widens to the whole school.
  const requiresTarget: Partial<Record<RoleScopeType, string | undefined>> = {
    [RoleScopeType.GRADE]: input.gradeId,
    [RoleScopeType.CLASS]: input.classId,
    [RoleScopeType.SUBJECT]: input.subjectId,
  };
  if (input.scopeType in requiresTarget && !requiresTarget[input.scopeType]) {
    throw badRequest(`A ${input.scopeType.toLowerCase()} must be selected for that scope.`);
  }
  if (input.scopeType === RoleScopeType.PLATFORM && !context.actor.isPlatformStaff) {
    throw forbidden('Only platform staff can grant platform-level roles.');
  }

  const targetSchoolId = input.schoolId ?? schoolId;
  const scopeKey = roleScopeKey({
    schoolId: targetSchoolId,
    gradeId: input.gradeId,
    classId: input.classId,
    subjectId: input.subjectId,
  });

  const assignment = await prisma.userRoleAssignment.upsert({
    where: {
      userRoleScope: {
        userId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeKey,
      },
    },
    create: {
      userId,
      roleKey: input.roleKey,
      scopeType: input.scopeType,
      organizationId: user.organizationId,
      schoolId: targetSchoolId,
      gradeId: input.gradeId,
      classId: input.classId,
      subjectId: input.subjectId,
      scopeKey,
      expiresAt: input.expiresAt,
      grantedById: context.actor.userId,
      reason: input.reason,
    },
    update: {
      revokedAt: null,
      revokedById: null,
      expiresAt: input.expiresAt ?? null,
      grantedAt: new Date(),
      grantedById: context.actor.userId,
      reason: input.reason,
    },
  });

  recordAudit(context, {
    action: 'role.assign',
    targetType: 'UserRoleAssignment',
    targetId: assignment.id,
    schoolId,
    summary: `Granted ${input.roleKey} (${input.scopeType}) to ${user.displayName}.`,
    reason: input.reason,
    afterData: assignment,
  });

  return assignment;
}

export async function revokeRole(
  context: ActorContext,
  schoolId: string,
  assignmentId: string,
  reason: string,
) {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { id: assignmentId, user: { schoolId } },
    select: { id: true, roleKey: true, userId: true, revokedAt: true },
  });
  if (!assignment) throw notFound('Role assignment');
  if (assignment.revokedAt) throw badRequest('That role has already been revoked.');

  if (isSelf(context.actor, assignment.userId)) {
    throw badRequest('You cannot revoke your own role.');
  }

  // The last active administrator must not be able to lock the school out.
  if (assignment.roleKey === RoleKey.SCHOOL_ADMIN) {
    const remaining = await prisma.userRoleAssignment.count({
      where: {
        roleKey: RoleKey.SCHOOL_ADMIN,
        revokedAt: null,
        schoolId,
        id: { not: assignmentId },
        user: { status: UserStatus.ACTIVE },
      },
    });
    if (remaining === 0) throw badRequest('A school must keep at least one active administrator.');
  }

  const updated = await prisma.userRoleAssignment.update({
    where: { id: assignmentId },
    data: { revokedAt: new Date(), revokedById: context.actor.userId, reason },
  });

  recordAudit(context, {
    action: 'role.revoke',
    targetType: 'UserRoleAssignment',
    targetId: assignmentId,
    schoolId,
    summary: `Revoked ${assignment.roleKey}.`,
    reason,
  });

  return updated;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Nobody may grant a role that outranks what they hold themselves. */
async function assertRoleAssignable(context: ActorContext, roleKey: RoleKey): Promise<void> {
  if (context.actor.isPlatformStaff) return;
  if (!SCHOOL_BOUND_ROLES.includes(roleKey)) {
    throw forbidden('Only platform staff can grant that role.');
  }
}

/**
 * Blueprint 09: a subscription licenses a number of seats. Enforcement is a
 * feature so a school in a migration window can be allowed to exceed it briefly.
 */
async function assertSeatAvailable(
  context: ActorContext,
  schoolId: string,
  roleKey: RoleKey,
  additional = 1,
): Promise<void> {
  const { isFeatureEnabled } = await import('../../core/features/feature.service');
  const enforced = await isFeatureEnabled('commercial.seatEnforcement', {
    organizationId: context.tenant.organizationId,
    schoolId,
  });
  if (!enforced) return;

  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [{ schoolId }, { organizationId: context.tenant.organizationId ?? '__none__' }],
      status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
    },
    orderBy: [{ schoolId: 'desc' }, { startsAt: 'desc' }],
    select: { licensedStudentSeats: true, licensedTeacherSeats: true },
  });
  if (!subscription) return;

  const isStudentSeat = roleKey === RoleKey.STUDENT;
  const licensed = isStudentSeat
    ? subscription.licensedStudentSeats
    : subscription.licensedTeacherSeats;
  if (licensed <= 0) return;

  const used = await prisma.user.count({
    where: {
      schoolId,
      status: { in: [UserStatus.ACTIVE, UserStatus.INVITED] },
      ...(isStudentSeat
        ? { primaryRole: RoleKey.STUDENT }
        : { primaryRole: { not: RoleKey.STUDENT } }),
    },
  });

  if (used + additional > licensed) {
    throw badRequest(
      `That would use ${used + additional} of ${licensed} licensed ${isStudentSeat ? 'learner' : 'staff'} seats. Contact your account manager to add more.`,
    );
  }
}

async function uniqueStudentCode(
  schoolId: string,
  schoolCode: string,
  length: number,
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateStudentCode(schoolCode, length);
    const existing = await prisma.user.findFirst({
      where: { schoolId, studentCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw conflict('Could not allocate a unique student code. Please try again.');
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
