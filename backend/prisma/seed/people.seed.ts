// ─────────────────────────────────────────────────────────────────────────────
// Seed — demo staff and learners
// Blueprint 03 (learner journey) and 05 (roles): the pilot school needs one
// person per role so every dashboard in the app has a real account to open.
//
// Login methods follow blueprint 05 exactly:
//   • staff  → email + password
//   • pupils → student code + PIN (no email, no inbox at age 7)
//
// Passwords are written on creation only, never on re-seed, for the same reason
// as the platform owner: a seed must not restore a credential someone changed.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode, LoginMethod, RoleKey, RoleScopeType, UserStatus } from '@prisma/client';

import { hashSecret } from '../../src/core/auth/password';
import { prisma } from '../../src/core/prisma';
import { chance, daysAgo, hashInt, log, pad, pick, step } from './helpers';
import { ensureRoleAssignment } from './owner.seed';
import type { SchoolFixture } from './school.seed';

/**
 * Demo credentials. Both satisfy `validatePassword` / `validatePin` in
 * src/core/auth/password.ts, so a demo account can also change its own password
 * through the real API without tripping the policy.
 */
export const DEMO_STAFF_PASSWORD = 'Riverbank!2026';
export const DEMO_STUDENT_PIN = '2468';

export interface DemoStudent {
  id: string;
  code: string;
  firstName: string;
  displayName: string;
  classCode: string;
  gradeKey: string;
  /** Deterministic engagement band, used by every later demo module. */
  band: 'thriving' | 'steady' | 'needs-support';
}

export interface PeopleFixture {
  adminId: string;
  curriculumManagerId: string;
  supportAgentId: string;
  /** Lead teacher for each class, keyed by class code. */
  leadTeacherIds: Record<string, string>;
  /** Teacher who covers Mathematics across all three classes. */
  mathsSpecialistId: string;
  /** Every teacher id, for convenience in later modules. */
  teacherIds: string[];
  students: DemoStudent[];
  /** Intervention group used by the demo reports and assignments. */
  supportGroupId: string;
}

interface StaffSpec {
  email: string;
  firstName: string;
  lastName: string;
  role: RoleKey;
  /** Class codes this person leads. Teachers only. */
  leads?: string[];
}

const STAFF: StaffSpec[] = [
  { email: 'nadia.okafor@riverbank.example', firstName: 'Nadia', lastName: 'Okafor', role: RoleKey.SCHOOL_ADMIN },
  { email: 'helen.mccormack@riverbank.example', firstName: 'Helen', lastName: 'McCormack', role: RoleKey.CURRICULUM_MANAGER },
  { email: 'sam.delgado@riverbank.example', firstName: 'Sam', lastName: 'Delgado', role: RoleKey.SUPPORT_AGENT },
  { email: 'tom.whitaker@riverbank.example', firstName: 'Tom', lastName: 'Whitaker', role: RoleKey.TEACHER, leads: ['3A'] },
  { email: 'grace.mensah@riverbank.example', firstName: 'Grace', lastName: 'Mensah', role: RoleKey.TEACHER, leads: ['4B'] },
  { email: 'daniel.ferreira@riverbank.example', firstName: 'Daniel', lastName: 'Ferreira', role: RoleKey.TEACHER, leads: ['5C'] },
  { email: 'priya.raman@riverbank.example', firstName: 'Priya', lastName: 'Raman', role: RoleKey.TEACHER },
];

const MATHS_SPECIALIST_EMAIL = 'priya.raman@riverbank.example';

/** 24 learners: eight per class, spread across the three demo year groups. */
const STUDENT_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Amelia', 'Hart'], ['Noah', 'Brennan'], ['Zara', 'Iqbal'], ['Leo', 'Marchetti'],
  ['Freya', 'Donnelly'], ['Idris', 'Bello'], ['Mia', 'Kowalski'], ['Ethan', 'Nakamura'],
  ['Sofia', 'Ferreira'], ['Kai', 'Osei'], ['Isla', 'Novak'], ['Rowan', 'Petrov'],
  ['Aisha', 'Rahman'], ['Milo', 'Castellanos'], ['Nina', 'Larsen'], ['Theo', 'Adeyemi'],
  ['Elsie', 'Grant'], ['Yusuf', 'Demir'], ['Ada', 'Lindqvist'], ['Oscar', 'Mbeki'],
  ['Lucia', 'Moreno'], ['Finn', 'Gallagher'], ['Priya', 'Chandra'], ['Jonah', 'Weiss'],
];

const BANDS = ['thriving', 'steady', 'needs-support'] as const;

/** Year group a learner sits in, derived from their position in the list. */
function classFor(index: number): { classCode: string; gradeKey: string } {
  if (index < 8) return { classCode: '3A', gradeKey: 'year-3' };
  if (index < 16) return { classCode: '4B', gradeKey: 'year-4' };
  return { classCode: '5C', gradeKey: 'year-5' };
}

/**
 * Creates a staff account if the email is new, otherwise reactivates it without
 * touching the stored password hash.
 */
async function ensureStaffUser(
  spec: StaffSpec,
  fixture: SchoolFixture,
  passwordHash: string,
  now: Date,
): Promise<string> {
  const displayName = `${spec.firstName} ${spec.lastName}`;
  const existing = await prisma.user.findUnique({ where: { email: spec.email }, select: { id: true } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        status: UserStatus.ACTIVE,
        primaryRole: spec.role,
        firstName: spec.firstName,
        lastName: spec.lastName,
        displayName,
        suspendedAt: null,
        archivedAt: null,
      },
    });
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      organizationId: fixture.organizationId,
      schoolId: fixture.schoolId,
      status: UserStatus.ACTIVE,
      primaryRole: spec.role,
      email: spec.email,
      username: spec.email.split('@')[0] ?? null,
      firstName: spec.firstName,
      lastName: spec.lastName,
      displayName,
      locale: 'en-GB',
      timezone: 'Europe/London',
      passwordHash,
      mustChangePassword: false,
      emailVerifiedAt: now,
      termsAcceptedAt: now,
      lastLoginAt: daysAgo(hashInt(spec.email, 0, 4), now),
      lastLoginMethod: LoginMethod.EMAIL_PASSWORD,
    },
    select: { id: true },
  });
  return created.id;
}

/** Attaches a teacher to a class, optionally for one subject only. */
async function ensureClassTeacher(input: {
  classId: string;
  userId: string;
  subjectId: string | null;
  isLead: boolean;
  now: Date;
}): Promise<void> {
  // `subjectId` is nullable inside the unique key, so Prisma's compound-unique
  // input cannot express it — locate first, then create.
  const existing = await prisma.classTeacher.findFirst({
    where: { classId: input.classId, userId: input.userId, subjectId: input.subjectId },
    select: { id: true },
  });

  if (existing) {
    await prisma.classTeacher.update({
      where: { id: existing.id },
      data: { isLead: input.isLead, removedAt: null },
    });
    return;
  }

  await prisma.classTeacher.create({
    data: {
      classId: input.classId,
      userId: input.userId,
      subjectId: input.subjectId,
      isLead: input.isLead,
      assignedAt: input.now,
    },
  });
}

async function seedStaff(fixture: SchoolFixture, now: Date): Promise<Omit<PeopleFixture, 'students' | 'supportGroupId'>> {
  const passwordHash = await hashSecret(DEMO_STAFF_PASSWORD);
  const byEmail: Record<string, string> = {};
  const leadTeacherIds: Record<string, string> = {};
  const teacherIds: string[] = [];

  for (const spec of STAFF) {
    const userId = await ensureStaffUser(spec, fixture, passwordHash, now);
    byEmail[spec.email] = userId;

    await ensureRoleAssignment({
      userId,
      roleKey: spec.role,
      scopeType: RoleScopeType.SCHOOL,
      organizationId: fixture.organizationId,
      schoolId: fixture.schoolId,
      reason: 'Demo staff account created by the seed.',
    });

    if (spec.role !== RoleKey.TEACHER) continue;
    teacherIds.push(userId);

    for (const classCode of spec.leads ?? []) {
      const classId = fixture.classIds[classCode];
      if (!classId) continue;
      leadTeacherIds[classCode] = userId;
      await ensureClassTeacher({ classId, userId, subjectId: null, isLead: true, now });
      await ensureRoleAssignment({
        userId,
        roleKey: RoleKey.TEACHER,
        scopeType: RoleScopeType.CLASS,
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        classId,
        reason: `Lead teacher for ${classCode}.`,
      });
    }
  }

  // The specialist teaches one subject in every class — the case that proves
  // subject-scoped role assignments work.
  const mathsSpecialistId = byEmail[MATHS_SPECIALIST_EMAIL] as string;
  const mathsId = fixture.subjectIds['mathematics'];
  if (mathsId) {
    for (const [classCode, classId] of Object.entries(fixture.classIds)) {
      await ensureClassTeacher({ classId, userId: mathsSpecialistId, subjectId: mathsId, isLead: false, now });
      await ensureRoleAssignment({
        userId: mathsSpecialistId,
        roleKey: RoleKey.TEACHER,
        scopeType: RoleScopeType.SUBJECT,
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        classId,
        subjectId: mathsId,
        reason: `Mathematics specialist for ${classCode}.`,
      });
    }
  }

  log(`${STAFF.length} staff accounts — password "${DEMO_STAFF_PASSWORD}" (set on creation only)`);

  return {
    adminId: byEmail['nadia.okafor@riverbank.example'] as string,
    curriculumManagerId: byEmail['helen.mccormack@riverbank.example'] as string,
    supportAgentId: byEmail['sam.delgado@riverbank.example'] as string,
    leadTeacherIds,
    mathsSpecialistId,
    teacherIds,
  };
}

async function seedStudents(fixture: SchoolFixture, now: Date): Promise<DemoStudent[]> {
  const pinHash = await hashSecret(DEMO_STUDENT_PIN);
  const students: DemoStudent[] = [];

  for (const [index, [firstName, lastName]] of STUDENT_NAMES.entries()) {
    const { classCode, gradeKey } = classFor(index);
    const code = `RVB-${pad(index + 1)}`;
    const displayName = `${firstName} ${lastName.charAt(0)}.`;
    const band = pick(BANDS, `band:${code}`);
    const gradeId = fixture.gradeIds[gradeKey];
    const classId = fixture.classIds[classCode];

    const user = await prisma.user.upsert({
      where: { schoolId_studentCode: { schoolId: fixture.schoolId, studentCode: code } },
      update: {
        status: UserStatus.ACTIVE,
        primaryRole: RoleKey.STUDENT,
        firstName,
        lastName,
        displayName,
        suspendedAt: null,
        archivedAt: null,
      },
      create: {
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        status: UserStatus.ACTIVE,
        primaryRole: RoleKey.STUDENT,
        studentCode: code,
        firstName,
        lastName,
        displayName,
        nickname: `${firstName}${hashInt(code, 10, 99)}`,
        dateOfBirth: daysAgo(365 * (7 + Math.floor(index / 8)) + hashInt(code, 0, 300), now),
        ageMode: AgeMode.PRIMARY,
        locale: 'en-GB',
        timezone: 'Europe/London',
        pinHash,
        emailVerifiedAt: null,
        termsAcceptedAt: now,
        lastLoginAt: band === 'needs-support' ? daysAgo(hashInt(code, 5, 14), now) : daysAgo(hashInt(code, 0, 2), now),
        lastLoginMethod: LoginMethod.STUDENT_CODE_PIN,
      },
      select: { id: true },
    });

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { currentGradeId: gradeId ?? null },
      create: {
        userId: user.id,
        currentGradeId: gradeId ?? null,
        onboardingCompletedAt: daysAgo(hashInt(`onboard:${code}`, 30, 90), now),
        screeningCompletedAt: daysAgo(hashInt(`screen:${code}`, 28, 88), now),
        placementSummary:
          band === 'needs-support'
            ? 'Placed one level below year group in number fluency; reading on track.'
            : band === 'thriving'
              ? 'Placed at year group with stretch targets in reasoning.'
              : 'Placed at year group across all subjects.',
        // Blueprint 07: accessibility preferences are per learner, not per school.
        fontScale: chance(`font:${code}`, 15) ? 125 : 100,
        dyslexiaFont: chance(`dys:${code}`, 12),
        reduceMotion: chance(`motion:${code}`, 10),
        highContrast: chance(`contrast:${code}`, 8),
        audioSupport: band === 'needs-support' && chance(`audio:${code}`, 60),
        captionsPreferred: chance(`caption:${code}`, 20),
        supportNotes:
          band === 'needs-support' ? 'Small-group number work twice a week. Prefers audio prompts.' : null,
        targetMinutesPerWeek: band === 'thriving' ? 90 : 60,
        guardianEmail: `guardian.${code.toLowerCase()}@example.com`,
      },
    });

    if (classId) {
      await prisma.classMembership.upsert({
        where: { classId_userId: { classId, userId: user.id } },
        update: { isActive: true, leftAt: null },
        create: { classId, userId: user.id, joinedAt: daysAgo(120, now) },
      });

      await ensureRoleAssignment({
        userId: user.id,
        roleKey: RoleKey.STUDENT,
        scopeType: RoleScopeType.CLASS,
        organizationId: fixture.organizationId,
        schoolId: fixture.schoolId,
        gradeId: gradeId ?? null,
        classId,
        reason: `Enrolled in ${classCode} by the seed.`,
      });
    }

    students.push({ id: user.id, code, firstName, displayName, classCode, gradeKey, band });
  }

  log(`${students.length} learners — codes RVB-0001…RVB-${pad(students.length)}, PIN ${DEMO_STUDENT_PIN}`);
  return students;
}

/**
 * One saved group, so the group-scoped entitlement and the intervention report
 * in later modules have something real to point at.
 */
async function seedSupportGroup(
  fixture: SchoolFixture,
  students: DemoStudent[],
  adminId: string,
): Promise<string> {
  const group = await prisma.userGroup.upsert({
    where: { schoolId_key: { schoolId: fixture.schoolId, key: 'number-intervention' } },
    update: { name: 'Number intervention', archivedAt: null },
    create: {
      schoolId: fixture.schoolId,
      key: 'number-intervention',
      name: 'Number intervention',
      description: 'Learners receiving small-group number fluency support this term.',
      createdById: adminId,
    },
    select: { id: true },
  });

  const members = students.filter((student) => student.band === 'needs-support');
  for (const member of members) {
    await prisma.userGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: member.id } },
      update: {},
      create: { groupId: group.id, userId: member.id, addedById: adminId },
    });
  }

  log(`group "Number intervention" — ${members.length} members`);
  return group.id;
}

export async function seedDemoPeople(fixture: SchoolFixture, now: Date): Promise<PeopleFixture> {
  step('Demo staff and learners (blueprint 03, 05)');

  const staff = await seedStaff(fixture, now);
  const students = await seedStudents(fixture, now);
  const supportGroupId = await seedSupportGroup(fixture, students, staff.adminId);

  return { ...staff, students, supportGroupId };
}
