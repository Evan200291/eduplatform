// ─────────────────────────────────────────────────────────────────────────────
// Rewards
// Blueprint 03, quoted from the schema: rewards "are cosmetic or recognition-based.
// Nothing purchasable with real money, and nothing that gates learning content."
// Both halves are enforced here: there is no currency field to charge, and a reward
// payload never references a lesson, activity or assessment.
//
// One decision worth stating plainly, because it is not obvious from the column
// names. `Reward.pointsCost` is read as a **threshold**, not a price: unlocking a
// reward does not write a negative ledger entry. Two reasons, both from the schema
// itself:
//
//   • `PointsReason` has no redemption value. The eleven reasons it does have are
//     all things a learner *did*, plus MANUAL_ADJUSTMENT and REVERSAL. Recording a
//     purchase as MANUAL_ADJUSTMENT would file a spend under "correction".
//   • Blueprint 03 states negative entries "are corrections or reversals, never
//     punishments" — an exhaustive list of what a debit may be. A spend is neither,
//     so a spend cannot be a debit.
//
// The consequence is deliberate and desirable: a child who unlocks a hat does not
// slide down the class leaderboard for having engaged with the reward system.
// `StudentReward.pointsSpent` records what the unlock was priced at, so the history
// still shows the cost.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { RewardKind } from '@prisma/client';
import { diffRecords, recordAudit } from '../../core/audit/audit.service';
import { conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { accessibleStudentIds } from '../../core/rbac/scope.service';
import { assertAllInScope, balanceFor, resolveStudent } from './points.service';
import type {
  CreateRewardInput,
  EquipRewardInput,
  GrantRewardInput,
  RedeemRewardInput,
  RewardListQuery,
  StudentRewardListQuery,
  UpdateRewardInput,
} from './gamification.validation';

const REWARD_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  kind: true,
  pointsCost: true,
  payload: true,
  sortOrder: true,
  isActive: true,
  ageMode: true,
  previewMediaId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { grants: true } },
} satisfies Prisma.RewardSelect;

const GRANT_SELECT = {
  id: true,
  studentId: true,
  rewardId: true,
  unlockedAt: true,
  isEquipped: true,
  equippedAt: true,
  pointsSpent: true,
  grantedById: true,
  reward: {
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      kind: true,
      pointsCost: true,
      payload: true,
      previewMediaId: true,
      ageMode: true,
    },
  },
  student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} satisfies Prisma.StudentRewardSelect;

/** Kinds that occupy a slot on something, so only one can be worn at a time. */
const WEARABLE: RewardKind[] = [
  RewardKind.COSMETIC_ITEM,
  RewardKind.COMPANION_ACCESSORY,
  RewardKind.AVATAR_ITEM,
  RewardKind.THEME_UNLOCK,
];

// ── Catalogue ───────────────────────────────────────────────────────────────

/**
 * The shop window. `withMine` marks what the caller already owns and `affordableOnly`
 * narrows to what their balance reaches, so a learner is not shown a wall of
 * locked items — blueprint 03 asks for encouragement, not a paywall.
 */
export async function listRewards(context: ActorContext, schoolId: string, query: RewardListQuery) {
  const where: Prisma.RewardWhereInput = { schoolId };
  if (query.activeOnly) where.isActive = true;
  if (!query.includeArchived) where.archivedAt = null;
  if (query.kind) where.kind = query.kind;
  // A reward with no `ageMode` suits every age band, so it is never filtered out.
  if (query.ageMode) where.OR = [{ ageMode: query.ageMode }, { ageMode: null }];
  if (query.search) where.name = { contains: query.search };

  const needsBalance = query.affordableOnly || query.withMine;
  const studentId = needsBalance
    ? await resolveStudent(context, schoolId, undefined).catch(() => null)
    : null;
  const balance = studentId ? await balanceFor(studentId) : 0;
  if (query.affordableOnly && studentId) where.pointsCost = { lte: balance };

  const { skip, take } = toSkipTake(query);
  const [rows, totalItems] = await prisma.$transaction([
    prisma.reward.findMany({
      where,
      select: REWARD_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { pointsCost: 'asc' }, { name: 'asc' }],
      skip,
      take,
    }),
    prisma.reward.count({ where }),
  ]);

  if (!query.withMine || !studentId || rows.length === 0) return { items: rows, totalItems };

  const owned = await prisma.studentReward.findMany({
    where: { studentId, rewardId: { in: rows.map((row) => row.id) } },
    select: { rewardId: true, unlockedAt: true, isEquipped: true },
  });
  const byReward = new Map(owned.map((row) => [row.rewardId, row]));

  const items = rows.map((row) => {
    const held = byReward.get(row.id);
    return {
      ...row,
      mine: {
        owned: Boolean(held),
        isEquipped: held?.isEquipped ?? false,
        unlockedAt: held?.unlockedAt ?? null,
        affordable: row.pointsCost <= balance,
      },
    };
  });
  return { items, totalItems, meta: { balance } };
}

export async function getReward(_context: ActorContext, schoolId: string, id: string) {
  const reward = await prisma.reward.findFirst({ where: { id, schoolId }, select: REWARD_SELECT });
  if (!reward) throw notFound('Reward');
  return reward;
}

export async function createReward(
  context: ActorContext,
  schoolId: string,
  input: CreateRewardInput,
) {
  const clash = await prisma.reward.count({ where: { schoolId, key: input.key } });
  if (clash > 0) throw conflict('A reward with that key already exists in this school.');
  if (input.previewMediaId) await assertMediaExists(schoolId, input.previewMediaId);

  const reward = await prisma.reward.create({
    data: {
      schoolId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      pointsCost: input.pointsCost,
      payload: (input.payload ?? undefined),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      ageMode: input.ageMode ?? null,
      previewMediaId: input.previewMediaId ?? null,
    },
    select: REWARD_SELECT,
  });

  recordAudit(context, {
    action: 'reward.create',
    targetType: 'Reward',
    targetId: reward.id,
    summary: `Created reward ${reward.name}`,
    schoolId,
    afterData: { key: reward.key, kind: reward.kind, pointsCost: reward.pointsCost },
  });
  return reward;
}

export async function updateReward(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateRewardInput,
) {
  const before = await prisma.reward.findFirst({ where: { id, schoolId }, select: REWARD_SELECT });
  if (!before) throw notFound('Reward');
  if (input.previewMediaId) await assertMediaExists(schoolId, input.previewMediaId);

  const reward = await prisma.reward.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
      ...(input.payload !== undefined
        ? { payload: input.payload as Prisma.InputJsonValue }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.ageMode !== undefined ? { ageMode: input.ageMode ?? null } : {}),
      ...(input.previewMediaId !== undefined ? { previewMediaId: input.previewMediaId } : {}),
    },
    select: REWARD_SELECT,
  });

  recordAudit(context, {
    action: 'reward.update',
    targetType: 'Reward',
    targetId: reward.id,
    summary: `Updated reward ${reward.name}`,
    schoolId,
    afterData: diffRecords(before, reward),
  });
  return reward;
}

/**
 * Archiving withdraws a reward from the catalogue. Learners who already own it keep
 * it — taking a cosmetic back off a child because an administrator tidied the shop
 * would be a punishment, which blueprint 03 rules out.
 */
export async function archiveReward(context: ActorContext, schoolId: string, id: string) {
  const before = await prisma.reward.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!before) throw notFound('Reward');
  if (before.archivedAt) return getReward(context, schoolId, id);

  const reward = await prisma.reward.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
    select: REWARD_SELECT,
  });
  recordAudit(context, {
    action: 'reward.update',
    targetType: 'Reward',
    targetId: id,
    summary: `Archived reward ${before.name}`,
    schoolId,
  });
  return reward;
}

async function assertMediaExists(schoolId: string, mediaId: string): Promise<void> {
  const count = await prisma.mediaAsset.count({ where: { id: mediaId, schoolId } });
  if (count === 0) throw notFound('Media asset');
}

// ── Unlocking ───────────────────────────────────────────────────────────────

async function requireActiveReward(schoolId: string, rewardId: string) {
  const reward = await prisma.reward.findFirst({
    where: { id: rewardId, schoolId },
    select: {
      id: true,
      name: true,
      kind: true,
      pointsCost: true,
      payload: true,
      isActive: true,
      archivedAt: true,
    },
  });
  if (!reward || reward.archivedAt || !reward.isActive) throw notFound('Reward');
  return reward;
}

/**
 * A learner unlocking something they have reached. Staff may do it on a learner's
 * behalf — a child who cannot navigate the shop should not miss out — but a learner
 * may only unlock for themselves.
 */
export async function redeemReward(
  context: ActorContext,
  schoolId: string,
  rewardId: string,
  input: RedeemRewardInput,
) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  const reward = await requireActiveReward(schoolId, rewardId);

  const existing = await prisma.studentReward.findUnique({
    where: { studentId_rewardId: { studentId, rewardId } },
    select: { id: true },
  });
  if (existing) throw conflict('That reward has already been unlocked.');

  const balance = await balanceFor(studentId);
  if (reward.pointsCost > balance) {
    throw forbidden(
      `That needs ${reward.pointsCost} points. You have ${balance} — keep going, you are ${reward.pointsCost - balance} away.`,
    );
  }

  const grant = await prisma.studentReward.create({
    data: {
      schoolId,
      studentId,
      rewardId,
      // The price at unlock time, for the record. No ledger entry: see the file
      // header for why a spend is not a debit here.
      pointsSpent: reward.pointsCost,
      grantedById: context.actor.userId === studentId ? null : context.actor.userId,
    },
    select: GRANT_SELECT,
  });

  if (input.equip) await applyEquip(schoolId, studentId, grant.id, reward, true);

  recordAudit(context, {
    action: 'reward.grant',
    targetType: 'StudentReward',
    targetId: grant.id,
    summary: `${reward.name} unlocked at ${reward.pointsCost} points`,
    schoolId,
    afterData: { studentId, rewardId, pointsSpent: reward.pointsCost, balanceAtUnlock: balance },
  });

  return { grant: await readGrant(grant.id), balance };
}

/**
 * Staff granting a reward outright — a certificate, a recognition item. Costs
 * nothing, because recognition should never depend on a balance.
 */
export async function grantReward(
  context: ActorContext,
  schoolId: string,
  rewardId: string,
  input: GrantRewardInput,
) {
  const reward = await requireActiveReward(schoolId, rewardId);
  const studentIds = await assertAllInScope(context, schoolId, input.studentIds);

  const already = await prisma.studentReward.findMany({
    where: { rewardId, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const held = new Set(already.map((row) => row.studentId));
  const pending = studentIds.filter((id) => !held.has(id));

  if (pending.length > 0) {
    await prisma.studentReward.createMany({
      data: pending.map((studentId) => ({
        schoolId,
        studentId,
        rewardId,
        pointsSpent: 0,
        grantedById: context.actor.userId,
      })),
      skipDuplicates: true,
    });
  }

  if (input.equip) {
    const grants = await prisma.studentReward.findMany({
      where: { rewardId, studentId: { in: pending } },
      select: { id: true, studentId: true },
    });
    for (const row of grants) {
      await applyEquip(schoolId, row.studentId, row.id, reward, true);
    }
  }

  recordAudit(context, {
    action: 'reward.grant',
    targetType: 'Reward',
    targetId: reward.id,
    summary: `Granted ${reward.name} to ${pending.length} student(s)`,
    reason: input.reason,
    schoolId,
    afterData: { studentIds, granted: pending.length, alreadyHeld: held.size },
  });

  return { rewardId: reward.id, granted: pending.length, alreadyHeld: held.size };
}

// ── Wearing ─────────────────────────────────────────────────────────────────

/** Reads `{ "slot": "hat" }` out of a reward payload, when it names one. */
function slotOf(payload: Prisma.JsonValue | null): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const slot = (payload).slot;
  return typeof slot === 'string' ? slot : null;
}

/**
 * Equips or removes one owned item. Equipping first clears whatever else occupies
 * the same slot, so a learner cannot end up wearing two hats — and if the payload
 * names no slot, the reward's kind is the slot.
 */
async function applyEquip(
  schoolId: string,
  studentId: string,
  grantId: string,
  reward: { kind: RewardKind; payload: Prisma.JsonValue | null },
  equip: boolean,
): Promise<void> {
  const now = new Date();
  if (!equip) {
    await prisma.studentReward.update({
      where: { id: grantId },
      data: { isEquipped: false, equippedAt: null },
      select: { id: true },
    });
    return;
  }

  if (WEARABLE.includes(reward.kind)) {
    const slot = slotOf(reward.payload);
    const conflicting = await prisma.studentReward.findMany({
      where: {
        schoolId,
        studentId,
        isEquipped: true,
        id: { not: grantId },
        reward: { kind: reward.kind },
      },
      select: { id: true, reward: { select: { payload: true } } },
    });
    const toClear = conflicting
      .filter((row) => slot === null || slotOf(row.reward.payload) === slot)
      .map((row) => row.id);
    if (toClear.length > 0) {
      await prisma.studentReward.updateMany({
        where: { id: { in: toClear } },
        data: { isEquipped: false, equippedAt: null },
      });
    }
  }

  await prisma.studentReward.update({
    where: { id: grantId },
    data: { isEquipped: true, equippedAt: now },
    select: { id: true },
  });
}

/** Wear or take off something already owned. */
export async function equipReward(
  context: ActorContext,
  schoolId: string,
  rewardId: string,
  input: EquipRewardInput,
) {
  const studentId = await resolveStudent(context, schoolId, input.studentId);
  const grant = await prisma.studentReward.findUnique({
    where: { studentId_rewardId: { studentId, rewardId } },
    select: { id: true, reward: { select: { kind: true, payload: true } } },
  });
  if (!grant) throw notFound('Reward');

  await applyEquip(schoolId, studentId, grant.id, grant.reward, input.equip);
  return readGrant(grant.id);
}

async function readGrant(id: string) {
  return prisma.studentReward.findUniqueOrThrow({ where: { id }, select: GRANT_SELECT });
}

// ── What a learner owns ─────────────────────────────────────────────────────

export async function listStudentRewards(
  context: ActorContext,
  schoolId: string,
  query: StudentRewardListQuery,
) {
  const scoped = await accessibleStudentIds(context.actor, context.tenant);

  const where: Prisma.StudentRewardWhereInput = { schoolId };
  if (scoped !== null) where.studentId = { in: scoped };
  if (query.studentId) {
    where.studentId =
      scoped === null || scoped.includes(query.studentId) ? query.studentId : { in: [] };
  }
  if (query.kind) where.reward = { kind: query.kind };
  if (query.equippedOnly) where.isEquipped = true;

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await prisma.$transaction([
    prisma.studentReward.findMany({
      where,
      select: GRANT_SELECT,
      orderBy: { unlockedAt: 'desc' },
      skip,
      take,
    }),
    prisma.studentReward.count({ where }),
  ]);
  return { items, totalItems };
}

/** Everything a learner is currently wearing, for the avatar and companion views. */
export async function equippedFor(studentId: string) {
  return prisma.studentReward.findMany({
    where: { studentId, isEquipped: true },
    select: GRANT_SELECT,
    orderBy: { equippedAt: 'desc' },
  });
}
