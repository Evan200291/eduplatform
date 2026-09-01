// ─────────────────────────────────────────────────────────────────────────────
// Seed — demo tenant: organization, school, settings, commerce, structure
// Blueprint 02: Platform → Organization → School → Grade → Class → User. This
// file builds that spine for one pilot school so every later module has real ids
// to hang off, and so a fresh install has something to sign in to.
//
// Everything here is demo data and runs only when SEED_DEMO_DATA is true.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AgeMode,
  BillingInterval,
  EntitlementScopeType,
  LoginMethod,
  Prisma,
  SubscriptionPlan,
  SubscriptionStatus,
  TenantStatus,
} from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { daysAgo, daysAhead, log, step } from './helpers';
import { seedSchoolTheme } from './theme.seed';

export const DEMO_ORG_SLUG = 'midas-pilot-trust';
export const DEMO_SCHOOL_SLUG = 'riverbank-primary';

/** Ids every later seed module needs. Keyed by the stable `key` columns. */
export interface SchoolFixture {
  organizationId: string;
  schoolId: string;
  termId: string;
  gradeIds: Record<string, string>;
  subjectIds: Record<string, string>;
  classIds: Record<string, string>;
}

const GRADES = [
  { key: 'year-3', name: 'Year 3', level: 3, typicalAgeFrom: 7, typicalAgeTo: 8 },
  { key: 'year-4', name: 'Year 4', level: 4, typicalAgeFrom: 8, typicalAgeTo: 9 },
  { key: 'year-5', name: 'Year 5', level: 5, typicalAgeFrom: 9, typicalAgeTo: 10 },
];

const SUBJECTS = [
  { key: 'mathematics', name: 'Mathematics', colorHex: '#4F46E5', iconKey: 'calculator', minutes: 240 },
  { key: 'english', name: 'English', colorHex: '#0EA5E9', iconKey: 'book-open', minutes: 300 },
  { key: 'science', name: 'Science', colorHex: '#16A34A', iconKey: 'flask', minutes: 120 },
];

const CLASSES = [
  { code: '3A', name: 'Year 3 Ash', gradeKey: 'year-3' },
  { code: '4B', name: 'Year 4 Birch', gradeKey: 'year-4' },
  { code: '5C', name: 'Year 5 Cedar', gradeKey: 'year-5' },
];

/** Northern-hemisphere school terms, so the demo term name matches the clock. */
function termLabel(now: Date): string {
  const month = now.getMonth();
  if (month >= 8 || month === 11) return `Autumn ${now.getFullYear()}`;
  if (month <= 2) return `Spring ${now.getFullYear()}`;
  return `Summer ${now.getFullYear()}`;
}

export async function seedDemoSchool(now: Date): Promise<SchoolFixture> {
  step('Demo tenant (blueprint 02)');

  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: { status: TenantStatus.ACTIVE },
    create: {
      slug: DEMO_ORG_SLUG,
      name: 'Midas Pilot Trust',
      status: TenantStatus.ACTIVE,
      contactName: 'Alex Warrington',
      contactEmail: 'trust.office@midaspilot.example',
      country: 'GB',
      timezone: 'Europe/London',
      locale: 'en',
      internalNotes: 'Demo organization created by prisma/seed. Safe to archive.',
    },
    select: { id: true },
  });

  const school = await prisma.school.upsert({
    where: { slug: DEMO_SCHOOL_SLUG },
    update: { status: TenantStatus.ACTIVE, organizationId: organization.id },
    create: {
      organizationId: organization.id,
      slug: DEMO_SCHOOL_SLUG,
      code: 'RBP',
      name: 'Riverbank Primary School',
      status: TenantStatus.ACTIVE,
      contactName: 'Nadia Okafor',
      contactEmail: 'office@riverbank.example',
      addressLine: '2 Mill Lane',
      city: 'Leeds',
      country: 'GB',
      timezone: 'Europe/London',
      locale: 'en',
      defaultAgeMode: AgeMode.PRIMARY,
      primaryColor: '#2563EB',
      secondaryColor: '#8B5CF6',
      accentColor: '#F97316',
      welcomeMessage: 'Welcome back to Riverbank. Pick up where you left off.',
      onboardingStage: 'LAUNCHED',
      launchedAt: daysAgo(30, now),
    },
    select: { id: true },
  });

  const themeId = await seedSchoolTheme(
    school.id,
    { colorPrimary: '#2563EB', colorSecondary: '#8B5CF6', colorAccent: '#F97316' },
    {
      name: 'Riverbank Primary',
      description: 'Demo school brand: bright blue and violet with a warm orange accent.',
      isSystem: false,
    },
    now,
  );
  await prisma.school.update({ where: { id: school.id }, data: { activeThemeId: themeId } });

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    update: {},
    create: {
      schoolId: school.id,
      // Gamification on but calm: leaderboards stay off, which is the blueprint
      // default and the position most primary schools take.
      gamificationIntensity: 55,
      leaderboardEnabled: false,
      companionDecayEnabled: false,
      screeningEnabled: true,
      screeningMaxItems: 20,
      ongoingCheckFrequencyDays: 14,
      recommendationApprovalRequired: true,
      recommendationAutoApproveHours: null,
      homeworkEnabled: true,
      defaultGraceHours: 24,
      emailNotificationsEnabled: true,
      digestEnabled: true,
      quietHoursStart: 19,
      quietHoursEnd: 7,
      allowedLoginMethods: [
        LoginMethod.EMAIL_PASSWORD,
        LoginMethod.USERNAME_PASSWORD,
        LoginMethod.STUDENT_CODE_PIN,
      ] as unknown as Prisma.InputJsonValue,
      studentPinRequired: true,
      studentCodeLength: 8,
      contentReportingEnabled: true,
      moderationRequired: true,
      dataRetentionMonths: 36,
      parentPortalEnabled: false,
    },
  });

  log(`organization + school ready (${DEMO_SCHOOL_SLUG})`);

  const fixture: SchoolFixture = {
    organizationId: organization.id,
    schoolId: school.id,
    termId: '',
    gradeIds: {},
    subjectIds: {},
    classIds: {},
  };

  await seedCommerce(fixture, now);
  await seedStructure(fixture, now);
  await seedSchoolEntitlements(fixture);
  return fixture;
}

/**
 * Blueprint 09: a pilot attaches the subscription to the school directly rather
 * than to the organization, so the trial can end without touching a trust-wide
 * deal. Seats are set above the demo roll so nothing is blocked by enforcement.
 */
async function seedCommerce(fixture: SchoolFixture, now: Date): Promise<void> {
  const existing = await prisma.subscription.findFirst({
    where: { schoolId: fixture.schoolId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.subscription.create({
    data: {
      schoolId: fixture.schoolId,
      plan: SubscriptionPlan.PILOT,
      status: SubscriptionStatus.TRIALING,
      interval: BillingInterval.ANNUAL,
      licensedStudentSeats: 120,
      licensedTeacherSeats: 12,
      pricePerStudentMinor: 0,
      pricePerTeacherMinor: 0,
      currency: 'GBP',
      startsAt: daysAgo(30, now),
      trialEndsAt: daysAhead(60, now),
      endsAt: daysAhead(335, now),
      renewsAt: daysAhead(335, now),
      autoRenew: false,
      invoiceEmail: 'finance@midaspilot.example',
      notes: 'Free pilot term created by the seed. No invoice is due.',
    },
  });
  log('pilot subscription created (120 learner seats, 12 teacher seats)');
}

async function seedStructure(fixture: SchoolFixture, now: Date): Promise<void> {
  for (const [index, grade] of GRADES.entries()) {
    const row = await prisma.grade.upsert({
      where: { schoolId_key: { schoolId: fixture.schoolId, key: grade.key } },
      update: { name: grade.name, level: grade.level },
      create: {
        schoolId: fixture.schoolId,
        key: grade.key,
        name: grade.name,
        level: grade.level,
        typicalAgeFrom: grade.typicalAgeFrom,
        typicalAgeTo: grade.typicalAgeTo,
        ageMode: AgeMode.PRIMARY,
        sortOrder: index * 10,
      },
      select: { id: true },
    });
    fixture.gradeIds[grade.key] = row.id;
  }

  for (const [index, subject] of SUBJECTS.entries()) {
    const row = await prisma.subject.upsert({
      where: { schoolId_key: { schoolId: fixture.schoolId, key: subject.key } },
      update: { name: subject.name, isActive: true },
      create: {
        schoolId: fixture.schoolId,
        key: subject.key,
        name: subject.name,
        colorHex: subject.colorHex,
        iconKey: subject.iconKey,
        sortOrder: index * 10,
      },
      select: { id: true },
    });
    fixture.subjectIds[subject.key] = row.id;
  }

  const termName = termLabel(now);
  const existingTerm = await prisma.academicTerm.findFirst({
    where: { schoolId: fixture.schoolId, name: termName },
    select: { id: true },
  });
  const term =
    existingTerm ??
    (await prisma.academicTerm.create({
      data: {
        schoolId: fixture.schoolId,
        name: termName,
        startsAt: daysAgo(45, now),
        endsAt: daysAhead(45, now),
        isCurrent: true,
      },
      select: { id: true },
    }));
  fixture.termId = term.id;

  for (const [index, entry] of CLASSES.entries()) {
    const gradeId = fixture.gradeIds[entry.gradeKey];
    if (!gradeId) throw new Error(`Grade ${entry.gradeKey} was not seeded before class ${entry.code}`);
    const row = await prisma.class.upsert({
      where: { schoolId_code: { schoolId: fixture.schoolId, code: entry.code } },
      update: { name: entry.name, gradeId, academicTermId: term.id, isActive: true },
      create: {
        schoolId: fixture.schoolId,
        gradeId,
        academicTermId: term.id,
        code: entry.code,
        name: entry.name,
        description: `${entry.name} — demo class ${index + 1} of ${CLASSES.length}.`,
        capacity: 30,
      },
      select: { id: true },
    });
    fixture.classIds[entry.code] = row.id;

    for (const subject of SUBJECTS) {
      const subjectId = fixture.subjectIds[subject.key];
      if (!subjectId) continue;
      await prisma.classSubject.upsert({
        where: { classId_subjectId: { classId: row.id, subjectId } },
        update: { weeklyMinutes: subject.minutes },
        create: { classId: row.id, subjectId, weeklyMinutes: subject.minutes },
      });
    }
  }

  log(
    `${GRADES.length} grades, ${SUBJECTS.length} subjects, ${CLASSES.length} classes, term "${termName}"`,
  );
}

/**
 * Two school-scoped decisions, written as entitlement rows rather than settings
 * columns so the demo shows the blueprint 06 precedence chain doing real work.
 */
async function seedSchoolEntitlements(fixture: SchoolFixture): Promise<void> {
  const decisions = [
    {
      featureKey: 'gamification.leaderboard',
      enabled: false,
      reason: 'Pilot school keeps competitive boards off while it beds the platform in.',
    },
    {
      featureKey: 'learning.path.autoApprove',
      enabled: false,
      reason: 'The teacher stays the decision maker for every path change (blueprint 04).',
    },
  ];

  for (const decision of decisions) {
    const existing = await prisma.featureEntitlement.findFirst({
      where: {
        schoolId: fixture.schoolId,
        featureKey: decision.featureKey,
        scopeType: EntitlementScopeType.SCHOOL,
      },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.featureEntitlement.create({
      data: {
        featureKey: decision.featureKey,
        scopeType: EntitlementScopeType.SCHOOL,
        schoolId: fixture.schoolId,
        enabled: decision.enabled,
        reason: decision.reason,
      },
    });
  }
  log(`${decisions.length} school-scoped feature decisions recorded`);
}
