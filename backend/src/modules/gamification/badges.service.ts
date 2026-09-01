// ─────────────────────────────────────────────────────────────────────────────
// Badges
// Blueprint 03: recognition should cover "effort and improvement … not only
// attainment", which is why `recognisesEffort` is a column a school can filter on
// and why a manual badge is a supported kind rather than a workaround.
//
// Two shaping rules:
//
//   1. An award is never deleted. Withdrawing one sets `revokedAt`/`revokedById`
//      and reverses the badge's points through the ledger, so the learner's record
//      shows both that they earned it and that it was withdrawn.
//   2. A badge definition is archived, never removed, because awards point at it
//      and a learner's achievement should not vanish when a school tidies up.
//
// The award primitive itself lives in `gamification.rules.ts` so an automatic and
// a manual award are written identically.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { recordAudit, diffRecords } from '../../core/audit/audit.service';
import { conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { accessibleStudentIds } from '../../core/rbac/scope.service';
import { grantBadge } from './gamification.rules';
import { assertAllInScope, resolveStudent, reverseSourceEntries } from './points.service';
import type {
  AwardBadgeInput,
  BadgeListQuery,
  CreateBadgeInput,
  RevokeBadgeInput,
  StudentBadgeListQuery,
  UpdateBadgeInput,
} from './gamification.validation';

const BADGE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  tier: true,
  pointsValue: true,
  sortOrder: true,
  isActive: true,
  recognisesEffort: true,
  criteria: true,
  criteriaLabel: true,
  iconMediaId: true,
  iconKey: true,
  archivedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { awards: true } },
} satisfies Prisma.BadgeSelect;

const AWARD_SELECT = {
  id: true,
  studentId: true,
  badgeId: true,
  awardedAt: true,
  awardedById: true,
  reason: true,
  revokedAt: true,
  revokedById: true,
  seenAt: true,
  badge: {
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      tier: true,
      pointsValue: true,
      recognisesEffort: true,
      criteriaLabel: true,
      iconMediaId: true,
      iconKey: true,
    },
  },
  student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} satisfies Prisma.StudentBadgeSelect;

// ── Catalogue ───────────────────────────────────────────────────────────────

/**
 * The badge catalogue. `withMine` attaches the caller's own award state, which is
 * what turns the same endpoint into a learner's trophy cabinet without a second
 * route or a second permission.
 */
export async function listBadges(context: ActorContext, schoolId: string, query: BadgeListQuery) {
  const where: Prisma.BadgeWhereInput = { schoolId };
  if (query.activeOnly) where.isActive = true;
  if (!query.includeArchived) where.archivedAt = null;
  if (query.tier) where.tier = query.tier;
  if (query.recognisesEffort !== undefined) where.recognisesEffort = query.recognisesEffort;
  if (query.search) {
    where.OR = [{ name: { contains: query.search } }, { description: { contains: query.search } }];
  }

  const { skip, take } = toSkipTake(query);
  const [rows, totalItems] = await prisma.$transaction([
    prisma.badge.findMany({
      where,
      select: BADGE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
      skip,
      take,
    }),
    prisma.badge.count({ where }),
  ]);

  if (!query.withMine || rows.length === 0) return { items: rows, totalItems };

  const studentId = await resolveStudent(context, schoolId, undefined).catch(() => null);
  if (!studentId) return { items: rows, totalItems };

  const mine = await prisma.studentBadge.findMany({
    where: { studentId, badgeId: { in: rows.map((row) => row.id) } },
    select: { badgeId: true, awardedAt: true, revokedAt: true, seenAt: true },
  });
  const byBadge = new Map(mine.map((row) => [row.badgeId, row]));

  const items = rows.map((row) => {
    const held = byBadge.get(row.id);
    return {
      ...row,
      mine: {
        earned: Boolean(held && !held.revokedAt),
        awardedAt: held?.awardedAt ?? null,
        revokedAt: held?.revokedAt ?? null,
        seenAt: held?.seenAt ?? null,
      },
    };
  });
  return { items, totalItems };
}

export async function getBadge(_context: ActorContext, schoolId: string, id: string) {
  const badge = await prisma.badge.findFirst({ where: { id, schoolId }, select: BADGE_SELECT });
  if (!badge) throw notFound('Badge');
  return badge;
}

export async function createBadge(
  context: ActorContext,
  schoolId: string,
  input: CreateBadgeInput,
) {
  const clash = await prisma.badge.count({ where: { schoolId, key: input.key } });
  if (clash > 0) throw conflict('A badge with that key already exists in this school.');
  if (input.iconMediaId) await assertMediaExists(schoolId, input.iconMediaId);

  const badge = await prisma.badge.create({
    data: {
      schoolId,
      key: input.key,
      name: input.name,
      description: input.description,
      tier: input.tier,
      pointsValue: input.pointsValue,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      recognisesEffort: input.recognisesEffort,
      criteria: input.criteria,
      criteriaLabel: input.criteriaLabel,
      iconMediaId: input.iconMediaId ?? null,
      iconKey: input.iconKey ?? null,
      createdById: context.actor.userId,
    },
    select: BADGE_SELECT,
  });

  recordAudit(context, {
    action: 'badge.create',
    targetType: 'Badge',
    targetId: badge.id,
    summary: `Created badge ${badge.name}`,
    schoolId,
    afterData: { key: badge.key, tier: badge.tier, criteria: input.criteria },
  });
  return badge;
}

export async function updateBadge(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateBadgeInput,
) {
  const before = await prisma.badge.findFirst({ where: { id, schoolId }, select: BADGE_SELECT });
  if (!before) throw notFound('Badge');
  if (input.iconMediaId) await assertMediaExists(schoolId, input.iconMediaId);

  const badge = await prisma.badge.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tier !== undefined ? { tier: input.tier } : {}),
      ...(input.pointsValue !== undefined ? { pointsValue: input.pointsValue } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.recognisesEffort !== undefined
        ? { recognisesEffort: input.recognisesEffort }
        : {}),
      ...(input.criteria !== undefined
        ? { criteria: input.criteria }
        : {}),
      ...(input.criteriaLabel !== undefined ? { criteriaLabel: input.criteriaLabel } : {}),
      ...(input.iconMediaId !== undefined ? { iconMediaId: input.iconMediaId } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey ?? null } : {}),
    },
    select: BADGE_SELECT,
  });

  recordAudit(context, {
    action: 'badge.update',
    targetType: 'Badge',
    targetId: badge.id,
    summary: `Updated badge ${badge.name}`,
    schoolId,
    afterData: diffRecords(before, badge),
  });
  return badge;
}

/**
 * Archiving hides a badge from the catalogue and stops the engine awarding it.
 * Existing awards are untouched: a child who earned it last term still has it.
 */
export async function archiveBadge(context: ActorContext, schoolId: string, id: string) {
  const before = await prisma.badge.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!before) throw notFound('Badge');
  if (before.archivedAt) return getBadge(context, schoolId, id);

  const badge = await prisma.badge.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
    select: BADGE_SELECT,
  });
  recordAudit(context, {
    action: 'badge.update',
    targetType: 'Badge',
    targetId: id,
    summary: `Archived badge ${before.name}`,
    schoolId,
  });
  return badge;
}

async function assertMediaExists(schoolId: string, mediaId: string): Promise<void> {
  const count = await prisma.mediaAsset.count({ where: { id: mediaId, schoolId } });
  if (count === 0) throw notFound('Media asset');
}

// ── Awarding and withdrawing ────────────────────────────────────────────────

/**
 * A teacher awarding a badge. Works for any badge, not only `{ "type": "manual" }`
 * ones: blueprint 04's "the teacher decides" means a teacher may recognise
 * something the rule has not caught yet, and doing so is not an override worth
 * blocking.
 */
export async function awardBadge(
  context: ActorContext,
  schoolId: string,
  badgeId: string,
  input: AwardBadgeInput,
) {
  const badge = await prisma.badge.findFirst({
    where: { id: badgeId, schoolId },
    select: { id: true, key: true, name: true, tier: true, pointsValue: true, criteria: true },
  });
  if (!badge) throw notFound('Badge');

  const studentIds = await assertAllInScope(context, schoolId, input.studentIds);
  let awarded = 0;
  let alreadyHeld = 0;

  for (const studentId of studentIds) {
    const result = await grantBadge(badge, schoolId, studentId, {
      awardedById: context.actor.userId,
      reason: input.reason,
    });
    if (result.alreadyHeld) alreadyHeld += 1;
    else awarded += 1;
  }

  recordAudit(context, {
    action: 'badge.award',
    targetType: 'Badge',
    targetId: badge.id,
    summary: `Awarded ${badge.name} to ${awarded} student(s)`,
    reason: input.reason,
    schoolId,
    afterData: { studentIds, awarded, alreadyHeld },
  });

  return { badgeId: badge.id, awarded, alreadyHeld };
}

/**
 * Withdraws an award — normally because the evidence behind it was reversed. The
 * row stays, stamped with who withdrew it, and the badge's points are reversed
 * through the ledger rather than subtracted.
 */
export async function revokeBadge(
  context: ActorContext,
  schoolId: string,
  badgeId: string,
  input: RevokeBadgeInput,
) {
  const badge = await prisma.badge.findFirst({
    where: { id: badgeId, schoolId },
    select: { id: true, name: true },
  });
  if (!badge) throw notFound('Badge');

  const studentIds = await assertAllInScope(context, schoolId, input.studentIds);
  const awards = await prisma.studentBadge.findMany({
    where: { badgeId, studentId: { in: studentIds }, revokedAt: null },
    select: { id: true, studentId: true },
  });

  const now = new Date();
  let revoked = 0;
  let pointsReversed = 0;
  for (const award of awards) {
    await prisma.studentBadge.update({
      where: { id: award.id },
      data: { revokedAt: now, revokedById: context.actor.userId },
      select: { id: true },
    });
    pointsReversed += await reverseSourceEntries(
      schoolId,
      'StudentBadge',
      award.id,
      `Badge withdrawn: ${input.reason}`,
      context.actor.userId,
    );
    revoked += 1;
  }

  recordAudit(context, {
    action: 'badge.revoke',
    targetType: 'Badge',
    targetId: badge.id,
    summary: `Withdrew ${badge.name} from ${revoked} student(s)`,
    reason: input.reason,
    schoolId,
    afterData: { studentIds, revoked, pointsReversed },
  });

  return { badgeId: badge.id, revoked, pointsReversed };
}

// ── Awards a learner holds ──────────────────────────────────────────────────

/**
 * Awards, scoped the same way every learner-data list in the platform is: the
 * filter comes from `accessibleStudentIds`, so a learner sees their own and a
 * teacher sees their classes without either passing an id we then have to trust.
 */
export async function listStudentBadges(
  context: ActorContext,
  schoolId: string,
  query: StudentBadgeListQuery,
) {
  const scoped = await accessibleStudentIds(context.actor, context.tenant);

  const where: Prisma.StudentBadgeWhereInput = { schoolId };
  if (scoped !== null) where.studentId = { in: scoped };
  if (query.studentId) {
    where.studentId =
      scoped === null || scoped.includes(query.studentId) ? query.studentId : { in: [] };
  }
  if (query.badgeId) where.badgeId = query.badgeId;
  if (!query.includeRevoked) where.revokedAt = null;
  if (query.unseenOnly) where.seenAt = null;

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.studentBadge.findMany({
      where,
      select: AWARD_SELECT,
      orderBy: { awardedAt: 'desc' },
      skip,
      take,
    }),
    prisma.studentBadge.count({ where }),
  ]);
  return { items, totalItems };
}

/**
 * Clears the "new badge" marker. Separate from reading the list so a learner who
 * glances at a dashboard does not silently lose the celebration.
 */
export async function markBadgesSeen(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
): Promise<number> {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);
  const result = await prisma.studentBadge.updateMany({
    where: { schoolId, studentId, seenAt: null, revokedAt: null },
    data: { seenAt: new Date() },
  });
  return result.count;
}

/** Trophy cabinet for one learner: what they hold, and what is still to earn. */
export async function badgeProgressFor(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);

  const [earned, catalogue] = await prisma.$transaction([
    prisma.studentBadge.findMany({
      where: { schoolId, studentId, revokedAt: null },
      select: AWARD_SELECT,
      orderBy: { awardedAt: 'desc' },
    }),
    prisma.badge.findMany({
      where: { schoolId, isActive: true, archivedAt: null },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        tier: true,
        pointsValue: true,
        recognisesEffort: true,
        criteriaLabel: true,
        iconKey: true,
        iconMediaId: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const held = new Set(earned.map((row) => row.badgeId));
  return {
    studentId,
    earned,
    unseen: earned.filter((row) => row.seenAt === null).length,
    // Shown as "next to aim for". `criteriaLabel` is the human sentence the schema
    // requires alongside the machine rule, so a child can read what to do.
    available: catalogue.filter((badge) => !held.has(badge.id)),
  };
}
