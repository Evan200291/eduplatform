// ─────────────────────────────────────────────────────────────────────────────
// Points ledger
// Blueprint 12 "Points ledger principle", quoted from the schema itself: "each
// change records a reason, source event, value, timestamp and reversal where
// necessary. There is no mutable 'total points' column anywhere — a balance is
// always a sum over this ledger."
//
// Three rules follow, and every function here obeys them:
//
//   1. Nothing in this file ever updates `points` on an existing row, and nothing
//      deletes a row. A mistake is corrected by writing a *new* signed entry.
//   2. A reversal is that new entry: it carries `reversesEntryId`, and the
//      original is stamped `reversedAt`/`reversedById` so the pair reads as one
//      story. The original keeps its original value.
//   3. A balance is `SUM(points)` over live entries. Because a reversal is itself
//      an entry with the opposite sign, "live" for arithmetic means *all* entries
//      — excluding a reversed original would double-count the correction.
//
// Blueprint 03 adds the tone: negative entries "are corrections or reversals,
// never punishments". `deductPoints` does not exist; `adjust` does, and it demands
// a note.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { PointsReason } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import { conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { accessibleStudentIds, assertCanViewStudent } from '../../core/rbac/scope.service';
import type {
  AdjustPointsInput,
  AwardPointsInput,
  LedgerListQuery,
  ReversePointsInput,
} from './gamification.validation';

const LEDGER_SELECT = {
  id: true,
  studentId: true,
  reason: true,
  points: true,
  sourceType: true,
  sourceId: true,
  note: true,
  reversedAt: true,
  reversedById: true,
  reversesEntryId: true,
  awardedById: true,
  occurredAt: true,
  createdAt: true,
  student: { select: { id: true, displayName: true, firstName: true, lastName: true } },
} satisfies Prisma.PointsLedgerSelect;

/** What the engine writes when a learner finishes something. */
export interface EarnInput {
  schoolId: string;
  studentId: string;
  reason: PointsReason;
  points: number;
  sourceType: string;
  sourceId: string;
  note?: string | null;
  occurredAt?: Date;
}

// ── Writing (engine side) ───────────────────────────────────────────────────

/**
 * Records points earned by doing something. Returns the entry id, or `null` when
 * there was nothing to record.
 *
 * Idempotent per source event: an activity replayed by a retried request, or a
 * teacher re-marking the same submission, must not pay twice. The check is on
 * `(studentId, reason, sourceType, sourceId)`, which is what the
 * `[sourceType, sourceId]` index exists for.
 */
export async function earnPoints(input: EarnInput): Promise<string | null> {
  if (input.points === 0) return null;

  const existing = await prisma.pointsLedger.findFirst({
    where: {
      studentId: input.studentId,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reversedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const row = await prisma.pointsLedger.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      reason: input.reason,
      points: input.points,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * The same for many learners at once — a whole class finishing a lesson. Skips
 * anyone who already has an entry for this source event, so a re-run tops up the
 * stragglers instead of paying the class again.
 */
export async function earnPointsForMany(
  base: Omit<EarnInput, 'studentId'>,
  studentIds: readonly string[],
): Promise<number> {
  const unique = [...new Set(studentIds)];
  if (unique.length === 0 || base.points === 0) return 0;

  const already = await prisma.pointsLedger.findMany({
    where: {
      studentId: { in: unique },
      reason: base.reason,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      reversedAt: null,
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const paid = new Set(already.map((row) => row.studentId));
  const pending = unique.filter((id) => !paid.has(id));
  if (pending.length === 0) return 0;

  const occurredAt = base.occurredAt ?? new Date();
  const result = await prisma.pointsLedger.createMany({
    data: pending.map((studentId) => ({
      schoolId: base.schoolId,
      studentId,
      reason: base.reason,
      points: base.points,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      note: base.note ?? null,
      occurredAt,
    })),
  });
  return result.count;
}

/**
 * Cancels the points attached to a source event that has been undone — a
 * submission withdrawn, an award revoked. Writes the mirror entry rather than
 * removing the original, so the learner's history still shows what happened.
 */
export async function reverseSourceEntries(
  schoolId: string,
  sourceType: string,
  sourceId: string,
  note: string,
  reversedById?: string | null,
): Promise<number> {
  const originals = await prisma.pointsLedger.findMany({
    where: { schoolId, sourceType, sourceId, reversedAt: null },
    select: { id: true, studentId: true, points: true },
  });
  let count = 0;
  for (const original of originals) {
    await writeReversal(schoolId, original, note, reversedById ?? null);
    count += 1;
  }
  return count;
}

/** The one place a reversal pair is written, so the two halves never drift apart. */
async function writeReversal(
  schoolId: string,
  original: { id: string; studentId: string; points: number },
  note: string,
  reversedById: string | null,
): Promise<string> {
  const now = new Date();
  const [, reversal] = await prisma.$transaction([
    prisma.pointsLedger.update({
      where: { id: original.id },
      data: { reversedAt: now, reversedById },
      select: { id: true },
    }),
    prisma.pointsLedger.create({
      data: {
        schoolId,
        studentId: original.studentId,
        reason: PointsReason.REVERSAL,
        // The mirror image. Together the pair nets to zero, which is why the
        // balance query can simply sum every row.
        points: -original.points,
        sourceType: 'PointsLedger',
        sourceId: original.id,
        note,
        reversesEntryId: original.id,
        awardedById: reversedById,
        occurredAt: now,
      },
      select: { id: true },
    }),
  ]);
  return reversal.id;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * A learner's balance. Always computed, never stored.
 *
 * `from`/`to` bound `occurredAt`, which makes "points this term" answerable
 * without a second table — and keeps the leaderboard honest when a school
 * chooses to reset each term.
 */
export async function balanceFor(
  studentId: string,
  range?: { from?: Date; to?: Date },
): Promise<number> {
  const occurredAt = dateFilter(range);
  const aggregate = await prisma.pointsLedger.aggregate({
    where: { studentId, ...(occurredAt ? { occurredAt } : {}) },
    _sum: { points: true },
  });
  return aggregate._sum.points ?? 0;
}

/** Balances for many learners in one query, for a board or a class list. */
export async function balancesFor(
  studentIds: readonly string[],
  range?: { from?: Date; to?: Date },
): Promise<Map<string, number>> {
  const unique = [...new Set(studentIds)];
  const balances = new Map<string, number>(unique.map((id) => [id, 0]));
  if (unique.length === 0) return balances;

  const occurredAt = dateFilter(range);
  const grouped = await prisma.pointsLedger.groupBy({
    by: ['studentId'],
    where: { studentId: { in: unique }, ...(occurredAt ? { occurredAt } : {}) },
    _sum: { points: true },
    orderBy: { studentId: 'asc' },
  });
  for (const row of grouped) balances.set(row.studentId, row._sum?.points ?? 0);
  return balances;
}

function dateFilter(range?: { from?: Date; to?: Date }): Prisma.DateTimeFilter | null {
  if (!range?.from && !range?.to) return null;
  return { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) };
}

/**
 * The statement view. Whose entries a caller may read is decided by
 * `accessibleStudentIds`, never by the `studentId` they send — a learner asking
 * for someone else's history gets an empty page, not a 403, because the request
 * is answerable and the answer is "nothing you may see".
 */
export async function listLedger(context: ActorContext, schoolId: string, query: LedgerListQuery) {
  const { actor } = context;
  const scoped = await accessibleStudentIds(actor, context.tenant);

  const where: Prisma.PointsLedgerWhereInput = { schoolId };
  if (scoped !== null) where.studentId = { in: scoped };
  if (query.studentId) {
    where.studentId = scoped === null || scoped.includes(query.studentId)
      ? query.studentId
      : { in: [] };
  }
  if (query.classId) {
    where.student = { classMemberships: { some: { classId: query.classId, isActive: true } } };
  }
  if (query.reason) where.reason = query.reason;
  if (query.sourceType) where.sourceType = query.sourceType;
  if (query.sourceId) where.sourceId = query.sourceId;
  if (!query.includeReversed) {
    // Hides both halves of a correction: the cancelled original and its mirror.
    where.reversedAt = null;
    where.reversesEntryId = null;
  }
  const occurredAt = dateFilter({ from: query.from, to: query.to });
  if (occurredAt) where.occurredAt = occurredAt;
  if (query.search) where.note = { contains: query.search };

  const { skip, take } = toSkipTake(query);
  const [items, totalItems, sum] = await prisma.$transaction([
    prisma.pointsLedger.findMany({
      where,
      select: LEDGER_SELECT,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
    prisma.pointsLedger.count({ where }),
    prisma.pointsLedger.aggregate({ where, _sum: { points: true } }),
  ]);
  return { items, totalItems, filteredTotal: sum._sum.points ?? 0 };
}

/**
 * The learner-facing summary: balance, what earned it, and the recent entries.
 * One call, because a dashboard should not need four.
 */
export async function pointsSummary(
  context: ActorContext,
  schoolId: string,
  requestedStudentId?: string,
) {
  const studentId = await resolveStudent(context, schoolId, requestedStudentId);

  // `groupBy` is awaited on its own rather than inside the `$transaction` array:
  // Prisma's tuple inference widens `_count` there, and the resulting union is not
  // worth casting away for a read that needs no atomicity.
  const byReason = await prisma.pointsLedger.groupBy({
    by: ['reason'],
    where: { studentId, points: { gt: 0 }, reversedAt: null },
    _sum: { points: true },
    _count: { id: true },
    orderBy: { reason: 'asc' },
  });

  const [total, recent, thisWeek] = await prisma.$transaction([
    prisma.pointsLedger.aggregate({ where: { studentId }, _sum: { points: true } }),
    prisma.pointsLedger.findMany({
      where: { studentId },
      select: LEDGER_SELECT,
      orderBy: { occurredAt: 'desc' },
      take: 20,
    }),
    prisma.pointsLedger.aggregate({
      where: { studentId, occurredAt: { gte: startOfWeek(new Date()) } },
      _sum: { points: true },
    }),
  ]);

  return {
    studentId,
    balance: total._sum.points ?? 0,
    earnedThisWeek: thisWeek._sum.points ?? 0,
    byReason: byReason.map((row) => ({
      reason: row.reason,
      points: row._sum.points ?? 0,
      entries: row._count.id,
    })),
    recent,
  };
}

/** Monday 00:00 local. Used only for the "this week" figure on a dashboard. */
function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

/**
 * Who this request is about. A learner is always themselves; staff must name the
 * learner and pass the scope check. Shared by every "my …" endpoint in the module.
 */
export async function resolveStudent(
  context: ActorContext,
  schoolId: string,
  requested?: string,
): Promise<string> {
  const { actor } = context;
  const scoped = await accessibleStudentIds(actor, context.tenant);

  // `[self]` is exactly the shape `accessibleStudentIds` returns for a student.
  if (scoped !== null && scoped.length === 1 && scoped[0] === actor.userId) {
    if (requested && requested !== actor.userId) {
      throw forbidden('You can only see your own points.');
    }
    return actor.userId;
  }
  if (!requested) throw notFound('Student');
  await assertCanViewStudent(actor, context.tenant, requested);
  return requested;
}

// ── Writing (human side) ────────────────────────────────────────────────────

/**
 * A teacher award. Blueprint 03: recognition is part of teaching, so this is a
 * first-class path rather than an admin escape hatch — but it is audited, and the
 * note is mandatory, so "why" survives the term.
 */
export async function awardPoints(
  context: ActorContext,
  schoolId: string,
  input: AwardPointsInput,
): Promise<{ created: number; studentIds: string[] }> {
  const studentIds = await assertAllInScope(context, schoolId, input.studentIds);
  const occurredAt = input.occurredAt ?? new Date();

  const result = await prisma.pointsLedger.createMany({
    data: studentIds.map((studentId) => ({
      schoolId,
      studentId,
      reason: input.reason,
      points: input.points,
      sourceType: input.sourceType ?? 'TeacherAward',
      sourceId: input.sourceId ?? null,
      note: input.note,
      awardedById: context.actor.userId,
      occurredAt,
    })),
  });

  recordAudit(context, {
    action: 'points.award',
    targetType: 'PointsLedger',
    summary: `Awarded ${input.points} points to ${studentIds.length} student(s)`,
    reason: input.note,
    schoolId,
    afterData: { points: input.points, reason: input.reason, studentIds },
  });

  return { created: result.count, studentIds };
}

/**
 * A correction, either way. Written as a plain entry with reason
 * MANUAL_ADJUSTMENT: it is not a reversal of one specific entry, so it must not
 * claim to be one by setting `reversesEntryId`.
 */
export async function adjustPoints(
  context: ActorContext,
  schoolId: string,
  input: AdjustPointsInput,
) {
  await assertCanViewStudent(context.actor, context.tenant, input.studentId);

  const entry = await prisma.pointsLedger.create({
    data: {
      schoolId,
      studentId: input.studentId,
      reason: PointsReason.MANUAL_ADJUSTMENT,
      points: input.points,
      sourceType: 'ManualAdjustment',
      note: input.note,
      awardedById: context.actor.userId,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: LEDGER_SELECT,
  });

  recordAudit(context, {
    action: 'points.adjust',
    targetType: 'PointsLedger',
    targetId: entry.id,
    summary: `Adjusted balance by ${input.points}`,
    reason: input.note,
    schoolId,
    afterData: { studentId: input.studentId, points: input.points },
  });

  return { entry, balance: await balanceFor(input.studentId) };
}

/**
 * Reverses one specific entry. Refuses a second reversal of the same entry — the
 * mirror already exists, and writing another would move the balance in the wrong
 * direction while looking like a correction.
 */
export async function reverseEntry(
  context: ActorContext,
  schoolId: string,
  entryId: string,
  input: ReversePointsInput,
) {
  const original = await prisma.pointsLedger.findFirst({
    where: { id: entryId, schoolId },
    select: { id: true, studentId: true, points: true, reversedAt: true, reversesEntryId: true },
  });
  if (!original) throw notFound('Points entry');
  if (original.reversedAt) throw conflict('That entry has already been reversed.');
  if (original.reversesEntryId) {
    throw conflict('A reversal cannot itself be reversed. Award or adjust instead.');
  }
  await assertCanViewStudent(context.actor, context.tenant, original.studentId);

  const reversalId = await writeReversal(schoolId, original, input.reason, context.actor.userId);

  recordAudit(context, {
    action: 'points.reverse',
    targetType: 'PointsLedger',
    targetId: original.id,
    summary: `Reversed ${original.points} points`,
    reason: input.reason,
    schoolId,
    beforeData: { points: original.points },
    afterData: { reversalId, points: -original.points },
  });

  const reversal = await prisma.pointsLedger.findUniqueOrThrow({
    where: { id: reversalId },
    select: LEDGER_SELECT,
  });
  return { reversal, balance: await balanceFor(original.studentId) };
}

/**
 * Bulk scope check for the multi-learner endpoints. One query instead of N, and it
 * fails loudly: a teacher naming a learner outside their classes has made a
 * mistake worth seeing, unlike a list filter where an empty page is the answer.
 */
export async function assertAllInScope(
  context: ActorContext,
  schoolId: string,
  studentIds: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(studentIds)];
  const scoped = await accessibleStudentIds(context.actor, context.tenant);
  if (scoped !== null) {
    const allowed = new Set(scoped);
    const outside = unique.filter((id) => !allowed.has(id));
    if (outside.length > 0) {
      throw forbidden('One or more of those students is outside the classes you can see.');
    }
  }
  const found = await prisma.user.findMany({
    where: { id: { in: unique }, schoolId },
    select: { id: true },
  });
  if (found.length !== unique.length) throw notFound('Student');
  return unique;
}
