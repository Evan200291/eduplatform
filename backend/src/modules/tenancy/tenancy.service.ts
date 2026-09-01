// ─────────────────────────────────────────────────────────────────────────────
// Organizations and schools
// Blueprint 02 hierarchy: Platform → Organization → School → Grade → Class → User.
// Blueprint 05: a tenant is suspended or archived, never immediately deleted —
// learner records outlive a commercial relationship and are subject to the
// retention rules in blueprint 10.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, TenantStatus } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import { slugify } from '../../core/auth/codes';
import type { ActorContext } from '../../core/context';
import { invalidateFeatureCache } from '../../core/features/feature.service';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake, type ListQuery } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { canAccessOrganization, canAccessSchool } from '../../core/rbac/authorize';
import type { z } from 'zod';
import type {
  createOrganizationSchema,
  createSchoolSchema,
  updateOrganizationSchema,
  updateSchoolSchema,
  updateSchoolSettingsSchema,
} from './tenancy.validation';

type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>;
type UpdateSettingsInput = z.infer<typeof updateSchoolSettingsSchema>;

// ── Organizations ───────────────────────────────────────────────────────────

export async function listOrganizations(
  context: ActorContext,
  query: ListQuery & { status?: TenantStatus },
) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.OrganizationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search } }, { slug: { contains: query.search } }] }
      : {}),
    // A non-platform actor only ever sees their own organization, regardless of
    // the filters they send.
    ...(context.actor.isPlatformStaff
      ? {}
      : { id: context.actor.organizationId ?? '__none__' }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.organization.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        country: true,
        timezone: true,
        locale: true,
        contactName: true,
        contactEmail: true,
        createdAt: true,
        _count: { select: { schools: true, users: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getOrganization(context: ActorContext, id: string) {
  if (!canAccessOrganization(context.actor, id)) throw forbidden('That organization is out of scope.');

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      schools: {
        select: { id: true, name: true, slug: true, code: true, status: true },
        orderBy: { name: 'asc' },
      },
      subscriptions: {
        orderBy: { startsAt: 'desc' },
        take: 5,
        select: { id: true, plan: true, status: true, startsAt: true, endsAt: true },
      },
      _count: { select: { schools: true, users: true } },
    },
  });

  if (!organization) throw notFound('Organization');
  return organization;
}

export async function createOrganization(context: ActorContext, input: CreateOrganizationInput) {
  const slug = await uniqueOrganizationSlug(input.slug ?? slugify(input.name));

  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      slug,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      country: input.country,
      timezone: input.timezone,
      locale: input.locale,
      internalNotes: input.internalNotes,
      createdById: context.actor.userId,
    },
  });

  recordAudit(context, {
    action: 'organization.create',
    targetType: 'Organization',
    targetId: organization.id,
    summary: `Created organization "${organization.name}".`,
    afterData: organization,
  });

  return organization;
}

export async function updateOrganization(
  context: ActorContext,
  id: string,
  input: UpdateOrganizationInput,
) {
  if (!canAccessOrganization(context.actor, id)) throw forbidden('That organization is out of scope.');

  const before = await prisma.organization.findUnique({ where: { id } });
  if (!before) throw notFound('Organization');

  const slug = input.slug && input.slug !== before.slug ? await uniqueOrganizationSlug(input.slug) : undefined;

  const after = await prisma.organization.update({
    where: { id },
    data: { ...input, ...(slug ? { slug } : {}) },
  });

  invalidateFeatureCache(id, null);

  recordAudit(context, {
    action: 'organization.update',
    targetType: 'Organization',
    targetId: id,
    summary: `Updated organization "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setOrganizationStatus(
  context: ActorContext,
  id: string,
  status: TenantStatus,
  reason: string,
) {
  const before = await prisma.organization.findUnique({ where: { id } });
  if (!before) throw notFound('Organization');

  const now = new Date();
  const after = await prisma.organization.update({
    where: { id },
    data: {
      status,
      suspendedAt: status === TenantStatus.SUSPENDED ? now : null,
      archivedAt: status === TenantStatus.ARCHIVED ? now : before.archivedAt,
    },
  });

  invalidateFeatureCache(id, null);

  recordAudit(context, {
    action: status === TenantStatus.ARCHIVED ? 'organization.archive' : 'organization.suspend',
    targetType: 'Organization',
    targetId: id,
    summary: `Set organization status to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

// ── Schools ─────────────────────────────────────────────────────────────────

export async function listSchools(
  context: ActorContext,
  query: ListQuery & { status?: TenantStatus; organizationId?: string },
) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.SchoolWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { slug: { contains: query.search } },
            { code: { contains: query.search } },
          ],
        }
      : {}),
  };

  if (!context.actor.isPlatformStaff) {
    // Scoped actors see only their own school, whatever they asked for.
    where.id = context.actor.schoolId ?? '__none__';
  }

  const [items, totalItems] = await Promise.all([
    prisma.school.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        code: true,
        status: true,
        city: true,
        country: true,
        timezone: true,
        defaultAgeMode: true,
        launchedAt: true,
        onboardingStage: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        _count: { select: { users: true, classes: true, grades: true } },
      },
    }),
    prisma.school.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getSchool(context: ActorContext, id: string) {
  if (!canAccessSchool(context.actor, id)) throw forbidden('That school is out of scope.');

  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true, status: true } },
      settings: true,
      logoMedia: { select: { id: true, storageKey: true, altText: true } },
      activeTheme: { select: { id: true, name: true, key: true, status: true } },
      _count: {
        select: { users: true, grades: true, classes: true, subjects: true, lessons: true },
      },
    },
  });

  if (!school) throw notFound('School');
  return school;
}

export async function createSchool(context: ActorContext, input: CreateSchoolInput) {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, status: true },
  });
  if (!organization) throw notFound('Organization');
  if (organization.status === TenantStatus.ARCHIVED) {
    throw badRequest('That organization is archived and cannot take new schools.');
  }

  const slug = await uniqueSchoolSlug(input.slug ?? slugify(input.name));
  const code = await uniqueSchoolCode(input.code ?? deriveCode(input.name));

  const school = await prisma.$transaction(async (tx) => {
    const created = await tx.school.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        slug,
        code,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        addressLine: input.addressLine,
        city: input.city,
        country: input.country,
        timezone: input.timezone,
        locale: input.locale,
        defaultAgeMode: input.defaultAgeMode,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        accentColor: input.accentColor,
        welcomeMessage: input.welcomeMessage,
        onboardingStage: 'created',
        createdById: context.actor.userId,
      },
    });

    // A school without settings would have no configuration layer at all, so the
    // row is created with the schema defaults rather than lazily.
    await tx.schoolSettings.create({
      data: {
        schoolId: created.id,
        allowedLoginMethods: ['EMAIL_PASSWORD', 'STUDENT_CODE_PIN'],
      },
    });

    return created;
  });

  recordAudit(context, {
    action: 'school.create',
    targetType: 'School',
    targetId: school.id,
    schoolId: school.id,
    organizationId: school.organizationId,
    summary: `Created school "${school.name}".`,
    afterData: school,
  });

  return school;
}

export async function updateSchool(context: ActorContext, id: string, input: UpdateSchoolInput) {
  if (!canAccessSchool(context.actor, id)) throw forbidden('That school is out of scope.');

  const before = await prisma.school.findUnique({ where: { id } });
  if (!before) throw notFound('School');

  const slug = input.slug && input.slug !== before.slug ? await uniqueSchoolSlug(input.slug) : undefined;
  const code = input.code && input.code !== before.code ? await uniqueSchoolCode(input.code) : undefined;

  if (input.activeThemeId) {
    const theme = await prisma.theme.findUnique({
      where: { id: input.activeThemeId },
      select: { schoolId: true, status: true },
    });
    if (!theme) throw notFound('Theme');
    if (theme.schoolId !== null && theme.schoolId !== id) throw forbidden('That theme belongs to another school.');
    if (theme.status !== 'PUBLISHED') throw badRequest('Publish the theme before making it active.');
  }

  const after = await prisma.school.update({
    where: { id },
    data: {
      ...input,
      ...(slug ? { slug } : {}),
      ...(code ? { code } : {}),
    },
  });

  invalidateFeatureCache(after.organizationId, id);

  recordAudit(context, {
    action: 'school.update',
    targetType: 'School',
    targetId: id,
    schoolId: id,
    summary: `Updated school "${after.name}".`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

export async function setSchoolStatus(
  context: ActorContext,
  id: string,
  status: TenantStatus,
  reason: string,
) {
  const before = await prisma.school.findUnique({ where: { id } });
  if (!before) throw notFound('School');

  const now = new Date();
  const after = await prisma.school.update({
    where: { id },
    data: {
      status,
      suspendedAt: status === TenantStatus.SUSPENDED ? now : null,
      archivedAt: status === TenantStatus.ARCHIVED ? now : before.archivedAt,
      launchedAt: status === TenantStatus.ACTIVE && !before.launchedAt ? now : before.launchedAt,
    },
  });

  invalidateFeatureCache(after.organizationId, id);

  // A suspended tenant must not keep live sessions; otherwise access continues
  // until each access token expires.
  if (status === TenantStatus.SUSPENDED || status === TenantStatus.ARCHIVED) {
    await prisma.session.updateMany({
      where: { revokedAt: null, user: { schoolId: id } },
      data: { revokedAt: now },
    });
  }

  recordAudit(context, {
    action: status === TenantStatus.ARCHIVED ? 'school.archive' : 'school.suspend',
    targetType: 'School',
    targetId: id,
    schoolId: id,
    summary: `Set school status to ${status}.`,
    reason,
    beforeData: { status: before.status },
    afterData: { status },
  });

  return after;
}

// ── School settings ─────────────────────────────────────────────────────────

export async function getSchoolSettings(schoolId: string) {
  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  if (settings) return settings;

  // Self-heals a school created before settings existed rather than 404-ing on
  // an administrator opening the settings page.
  return prisma.schoolSettings.create({
    data: { schoolId, allowedLoginMethods: ['EMAIL_PASSWORD', 'STUDENT_CODE_PIN'] },
  });
}

export async function updateSchoolSettings(
  context: ActorContext,
  schoolId: string,
  input: UpdateSettingsInput,
) {
  const before = await getSchoolSettings(schoolId);

  if (
    input.quietHoursStart !== undefined &&
    input.quietHoursEnd !== undefined &&
    input.quietHoursStart !== null &&
    input.quietHoursEnd !== null &&
    input.quietHoursStart === input.quietHoursEnd
  ) {
    throw badRequest('Quiet hours must start and end at different times.');
  }

  const { allowedLoginMethods, allowedPathModes, attemptLimitByAgeMode, ...rest } = input;

  const after = await prisma.schoolSettings.update({
    where: { schoolId },
    data: {
      ...rest,
      ...(allowedLoginMethods ? { allowedLoginMethods } : {}),
      // Json columns: `undefined` leaves the column untouched, `null` clears the
      // override back to "unrestricted"/"no override", matching the schema docs.
      ...(allowedPathModes !== undefined
        ? { allowedPathModes: (allowedPathModes ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
      ...(attemptLimitByAgeMode !== undefined
        ? {
            attemptLimitByAgeMode: (attemptLimitByAgeMode ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          }
        : {}),
      updatedById: context.actor.userId,
    },
  });

  recordAudit(context, {
    action: 'school.settings.update',
    targetType: 'SchoolSettings',
    targetId: after.id,
    schoolId,
    summary: `Updated ${Object.keys(input).length} school setting(s).`,
    beforeData: before,
    afterData: after,
  });

  return after;
}

// ── Public tenant lookup ────────────────────────────────────────────────────

/**
 * Branding for the sign-in screen, resolvable without a session. Deliberately
 * returns only what a sign-in page needs — never counts, contacts or status
 * detail — because this endpoint is unauthenticated.
 */
export async function publicSchoolProfile(slug: string) {
  const school = await prisma.school.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      welcomeMessage: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      defaultAgeMode: true,
      locale: true,
      logoMedia: { select: { storageKey: true, altText: true } },
      activeTheme: { select: { key: true, tokens: true } },
      settings: { select: { allowedLoginMethods: true, studentPinRequired: true } },
    },
  });

  if (!school || school.status === TenantStatus.ARCHIVED) throw notFound('School');

  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    welcomeMessage: school.welcomeMessage,
    locale: school.locale,
    defaultAgeMode: school.defaultAgeMode,
    branding: {
      primaryColor: school.primaryColor,
      secondaryColor: school.secondaryColor,
      accentColor: school.accentColor,
      logoStorageKey: school.logoMedia?.storageKey ?? null,
      logoAltText: school.logoMedia?.altText ?? null,
      themeKey: school.activeTheme?.key ?? null,
      themeTokens: school.activeTheme?.tokens ?? null,
    },
    loginMethods: Array.isArray(school.settings?.allowedLoginMethods)
      ? school.settings.allowedLoginMethods
      : ['EMAIL_PASSWORD'],
    studentPinRequired: school.settings?.studentPinRequired ?? true,
    isAcceptingSignIn: school.status !== TenantStatus.SUSPENDED,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deriveCode(name: string): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const initials = letters.map((word) => word[0]).join('').slice(0, 6);
  return initials.length >= 2 ? initials : (letters[0] ?? 'SCHOOL').slice(0, 6);
}

async function uniqueOrganizationSlug(candidate: string): Promise<string> {
  return uniqueValue(candidate, async (value) => {
    const existing = await prisma.organization.findUnique({ where: { slug: value }, select: { id: true } });
    return existing === null;
  });
}

async function uniqueSchoolSlug(candidate: string): Promise<string> {
  return uniqueValue(candidate, async (value) => {
    const existing = await prisma.school.findUnique({ where: { slug: value }, select: { id: true } });
    return existing === null;
  });
}

async function uniqueSchoolCode(candidate: string): Promise<string> {
  const base = candidate.toUpperCase();
  return uniqueValue(base, async (value) => {
    const existing = await prisma.school.findUnique({ where: { code: value }, select: { id: true } });
    return existing === null;
  });
}

/** Appends `-2`, `-3`… until the value is free, rather than rejecting the request. */
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
