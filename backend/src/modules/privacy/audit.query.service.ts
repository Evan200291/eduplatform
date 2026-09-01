// ─────────────────────────────────────────────────────────────────────────────
// Audit trail reading
// Blueprint 05: "every significant action is attributable." Writing the trail is the
// job of `core/audit`; this file is the only way to read it back, and it is read-only
// by construction — there is no update or delete path for an audit row anywhere in
// the codebase, and retention is the single thing allowed to touch old entries.
//
// The trail is scoped to a school like everything else. Platform staff reading a
// school's trail do so through the same query with the same filters, and their own
// visit is itself an ordinary request the platform logs.
//
// One deliberate omission: this module never returns `ipAddress` or `userAgent` in a
// list. They are stored, they matter for a security investigation, and they are shown
// on the single-entry view — but a paginated table of every staff member's IP address
// is a surveillance tool, and a school administrator scrolling an audit list does not
// need one.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { AuditResult } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { rollingWindow } from '../../core/utils/dates';
import type { z } from 'zod';
import type { auditListQuery } from './privacy.validation';

type ListQuery = z.infer<typeof auditListQuery>;

const ACTOR_SELECT = {
  select: { id: true, displayName: true, primaryRole: true },
} satisfies Prisma.UserDefaultArgs;

/** The list view. No IP address, no user agent — see the header. */
const LIST_SELECT = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  summary: true,
  result: true,
  reason: true,
  actorRole: true,
  isImpersonation: true,
  occurredAt: true,
  actor: ACTOR_SELECT,
} satisfies Prisma.AuditLogSelect;

/** The single-entry view, which is where an investigation actually happens. */
const DETAIL_SELECT = {
  ...LIST_SELECT,
  organizationId: true,
  schoolId: true,
  beforeData: true,
  afterData: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
} satisfies Prisma.AuditLogSelect;

export type AuditListRow = Prisma.AuditLogGetPayload<{ select: typeof LIST_SELECT }>;
export type AuditDetailRow = Prisma.AuditLogGetPayload<{ select: typeof DETAIL_SELECT }>;

const PROBLEM_RESULTS: AuditResult[] = [AuditResult.FAILURE, AuditResult.DENIED];

function buildWhere(schoolId: string, query: ListQuery): Prisma.AuditLogWhereInput {
  return {
    schoolId,
    // `startsWith` so `user.` matches every user action without listing them.
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    ...(query.problemsOnly ? { result: { in: PROBLEM_RESULTS } } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
    ...(query.search ? { summary: { contains: query.search } } : {}),
  };
}

export async function listAuditEntries(
  _context: ActorContext,
  schoolId: string,
  query: ListQuery,
): Promise<{ items: AuditListRow[]; totalItems: number }> {
  const { skip, take } = toSkipTake(query);
  const where = buildWhere(schoolId, query);

  const [items, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { occurredAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, totalItems };
}

export async function getAuditEntry(schoolId: string, entryId: string): Promise<AuditDetailRow> {
  const row = await prisma.auditLog.findFirst({
    where: { id: entryId, schoolId },
    select: DETAIL_SELECT,
  });
  if (!row) throw notFound('Audit entry');
  return row;
}

/**
 * The trail for one record, which is the question people actually ask: "who changed
 * this learner's account, and when?" Capped rather than paginated — a record with
 * more than two hundred audited changes is a case for the filtered list.
 */
export async function targetHistory(
  schoolId: string,
  targetType: string,
  targetId: string,
  limit = 200,
): Promise<AuditListRow[]> {
  return prisma.auditLog.findMany({
    where: { schoolId, targetType, targetId },
    select: LIST_SELECT,
    orderBy: { occurredAt: 'desc' },
    take: limit,
  });
}

export interface AuditSummary {
  window: { from: Date; to: Date; days: number };
  total: number;
  denied: number;
  failed: number;
  impersonated: number;
  topActions: Array<{ action: string; count: number }>;
  busiestActors: Array<{ actorUserId: string; displayName: string; count: number }>;
}

/**
 * The security review page. Denied attempts and impersonation are surfaced first
 * because they are the two things a school should look at without being asked to.
 */
export async function auditSummary(
  schoolId: string,
  days = 30,
  now = new Date(),
): Promise<AuditSummary> {
  const { start, end } = rollingWindow(days, now);
  const where: Prisma.AuditLogWhereInput = { schoolId, occurredAt: { gte: start, lte: end } };

  const [total, denied, failed, impersonated, actionGroups, actorGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count({ where: { ...where, result: AuditResult.DENIED } }),
    prisma.auditLog.count({ where: { ...where, result: AuditResult.FAILURE } }),
    prisma.auditLog.count({ where: { ...where, isImpersonation: true } }),
    prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 12,
    }),
    prisma.auditLog.groupBy({
      by: ['actorUserId'],
      where: { ...where, actorUserId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { actorUserId: 'desc' } },
      take: 8,
    }),
  ]);

  const actorIds = actorGroups
    .map((entry) => entry.actorUserId)
    .filter((id): id is string => id !== null);
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true },
  });
  const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));

  return {
    window: { from: start, to: end, days },
    total,
    denied,
    failed,
    impersonated,
    topActions: actionGroups.map((entry) => ({ action: entry.action, count: entry._count._all })),
    busiestActors: actorIds.map((id, index) => ({
      actorUserId: id,
      // A deleted account still owns its history; the trail keeps the id either way.
      displayName: names.get(id) ?? 'Removed account',
      count: actorGroups[index]._count._all,
    })),
  };
}
