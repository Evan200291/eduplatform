// ─────────────────────────────────────────────────────────────────────────────
// Privacy service — data subject rights
// Blueprint 10: "export, deletion and correction requests are tracked to completion
// with an owner and a deadline." That sentence is the whole design of this file.
//
// A request is a workflow, not a flag. Three things follow from that:
//
//   • Status moves along a stated path. You cannot complete a request that was never
//     started, and you cannot reopen one that was closed — a request that can be
//     quietly reopened and re-closed is not evidence of anything.
//   • Closing one requires words. Rejection needs a reason; completion needs an
//     outcome note saying what was done and what was lawfully retained. Both are
//     enforced by the validator and re-checked here, because the API is not the only
//     way a status changes over a system's life.
//   • A deletion request never deletes anything on its own. It records the decision
//     and the outcome; the actual erasure is performed deliberately by a person or
//     by a retention policy. Wiring "mark request complete" to a cascading delete is
//     how a mis-click becomes a permanently lost child's account.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { DataRequestKind, DataRequestStatus } from '@prisma/client';
import { diffRecords, recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type { z } from 'zod';
import type {
  createDataRequestSchema,
  dataRequestListQuery,
  transitionDataRequestSchema,
  updateDataRequestSchema,
} from './privacy.validation';

type CreateInput = z.infer<typeof createDataRequestSchema>;
type UpdateInput = z.infer<typeof updateDataRequestSchema>;
type TransitionInput = z.infer<typeof transitionDataRequestSchema>;
type ListQuery = z.infer<typeof dataRequestListQuery>;

/**
 * Statutory deadlines are usually one calendar month. Where the school has not set
 * a date, this is the default so the queue always has a clock on it.
 */
const DEFAULT_DUE_DAYS = 30;

const PERSON_SELECT = {
  select: { id: true, displayName: true, primaryRole: true },
} satisfies Prisma.UserDefaultArgs;

const REQUEST_SELECT = {
  id: true,
  schoolId: true,
  kind: true,
  status: true,
  details: true,
  dueAt: true,
  ownerUserId: true,
  exportStorageKey: true,
  outcomeNote: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  completedAt: true,
  subjectUser: PERSON_SELECT,
  requestedBy: PERSON_SELECT,
} satisfies Prisma.DataRequestSelect;

export type DataRequestRow = Prisma.DataRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

/**
 * The stated path. `CANCELLED` is reachable from any open state because a requester
 * withdrawing their request is always legitimate; the closed states are terminal.
 */
const TRANSITIONS: Readonly<Record<DataRequestStatus, DataRequestStatus[]>> = {
  [DataRequestStatus.REQUESTED]: [
    DataRequestStatus.IN_REVIEW,
    DataRequestStatus.IN_PROGRESS,
    DataRequestStatus.REJECTED,
    DataRequestStatus.CANCELLED,
  ],
  [DataRequestStatus.IN_REVIEW]: [
    DataRequestStatus.IN_PROGRESS,
    DataRequestStatus.REJECTED,
    DataRequestStatus.CANCELLED,
  ],
  [DataRequestStatus.IN_PROGRESS]: [
    DataRequestStatus.COMPLETED,
    DataRequestStatus.REJECTED,
    DataRequestStatus.CANCELLED,
  ],
  [DataRequestStatus.COMPLETED]: [],
  [DataRequestStatus.REJECTED]: [],
  [DataRequestStatus.CANCELLED]: [],
};

const OPEN_STATUSES: DataRequestStatus[] = [
  DataRequestStatus.REQUESTED,
  DataRequestStatus.IN_REVIEW,
  DataRequestStatus.IN_PROGRESS,
];

/** What the subject is called, for a summary line a person will read later. */
function subjectName(row: DataRequestRow): string {
  return row.subjectUser.displayName;
}

// ── Creating ────────────────────────────────────────────────────────────────

export async function createDataRequest(
  context: ActorContext,
  schoolId: string,
  input: CreateInput,
): Promise<DataRequestRow> {
  const subject = await prisma.user.findFirst({
    where: { id: input.subjectUserId, schoolId },
    select: { id: true, displayName: true },
  });
  if (!subject) throw notFound('Subject');

  // One open request of a kind per subject: two live deletion requests for the same
  // child are two people about to do the same irreversible thing.
  const openSameKind = await prisma.dataRequest.findFirst({
    where: { schoolId, subjectUserId: subject.id, kind: input.kind, status: { in: OPEN_STATUSES } },
    select: { id: true },
  });
  if (openSameKind) {
    throw conflict(
      `There is already an open ${input.kind.toLowerCase()} request for ${subject.displayName}.`,
    );
  }

  if (input.ownerUserId) await assertOwnerExists(schoolId, input.ownerUserId);

  const dueAt =
    input.dueAt ?? new Date(Date.now() + DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1_000);

  const row = await prisma.dataRequest.create({
    data: {
      schoolId,
      subjectUserId: subject.id,
      requestedById: context.actor.userId,
      kind: input.kind,
      details: input.details ?? null,
      dueAt,
      ownerUserId: input.ownerUserId ?? context.actor.userId,
    },
    select: REQUEST_SELECT,
  });

  recordAudit(context, {
    action: 'datarequest.create',
    targetType: 'DataRequest',
    targetId: row.id,
    summary: `${input.kind} request raised for ${subject.displayName}`,
    afterData: row,
  });
  return row;
}

async function assertOwnerExists(schoolId: string, ownerUserId: string): Promise<void> {
  const owner = await prisma.user.findFirst({
    where: { id: ownerUserId, schoolId },
    select: { id: true },
  });
  if (!owner) throw badRequest('The named owner is not a member of this school.');
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listDataRequests(
  _context: ActorContext,
  schoolId: string,
  query: ListQuery,
  now = new Date(),
): Promise<{ items: DataRequestRow[]; totalItems: number; openCount: number; overdueCount: number }> {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.DataRequestWhereInput = {
    schoolId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.subjectUserId ? { subjectUserId: query.subjectUserId } : {}),
    ...(query.openOnly ? { status: { in: OPEN_STATUSES } } : {}),
    ...(query.overdueOnly
      ? { status: { in: OPEN_STATUSES }, dueAt: { lt: now } }
      : {}),
    ...(query.search ? { subjectUser: { displayName: { contains: query.search } } } : {}),
  };

  const [items, totalItems, openCount, overdueCount] = await Promise.all([
    prisma.dataRequest.findMany({
      where,
      select: REQUEST_SELECT,
      // Oldest deadline first: this list is a queue, not an archive.
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    }),
    prisma.dataRequest.count({ where }),
    prisma.dataRequest.count({ where: { schoolId, status: { in: OPEN_STATUSES } } }),
    prisma.dataRequest.count({
      where: { schoolId, status: { in: OPEN_STATUSES }, dueAt: { lt: now } },
    }),
  ]);
  return { items, totalItems, openCount, overdueCount };
}

export async function getDataRequest(
  schoolId: string,
  requestId: string,
): Promise<DataRequestRow> {
  const row = await prisma.dataRequest.findFirst({
    where: { id: requestId, schoolId },
    select: REQUEST_SELECT,
  });
  if (!row) throw notFound('Data request');
  return row;
}

// ── Editing and moving ──────────────────────────────────────────────────────

/** Details, deadline and owner. Status is deliberately not editable here. */
export async function updateDataRequest(
  context: ActorContext,
  schoolId: string,
  requestId: string,
  input: UpdateInput,
): Promise<DataRequestRow> {
  const before = await getDataRequest(schoolId, requestId);
  if (!OPEN_STATUSES.includes(before.status)) {
    throw conflict('This request is closed. Its record is kept as it was when it closed.');
  }
  if (input.ownerUserId) await assertOwnerExists(schoolId, input.ownerUserId);

  const after = await prisma.dataRequest.update({
    where: { id: before.id },
    data: {
      ...(input.details === undefined ? {} : { details: input.details }),
      ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
      ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
    },
    select: REQUEST_SELECT,
  });

  recordAudit(context, {
    action: 'datarequest.update',
    targetType: 'DataRequest',
    targetId: after.id,
    summary: `Updated ${after.kind} request for ${subjectName(after)}`,
    beforeData: before,
    afterData: diffRecords(before, after),
  });
  return after;
}

/**
 * The status change, with the evidence each destination requires. `startedAt` and
 * `completedAt` are stamped here rather than by the caller so the timeline cannot
 * disagree with the status.
 */
export async function transitionDataRequest(
  context: ActorContext,
  schoolId: string,
  requestId: string,
  input: TransitionInput,
): Promise<DataRequestRow> {
  const before = await getDataRequest(schoolId, requestId);
  if (before.status === input.status) {
    throw conflict(`This request is already ${input.status.toLowerCase()}.`);
  }
  const allowed = TRANSITIONS[before.status];
  if (!allowed.includes(input.status)) {
    throw conflict(
      allowed.length === 0
        ? `This request is ${before.status.toLowerCase()} and cannot be changed. Raise a new request instead.`
        : `A ${before.status.toLowerCase()} request can only move to: ${allowed.join(', ')}.`,
    );
  }
  // Re-checked here as well as in the validator: the rule is the workflow's, not
  // the HTTP layer's, and a future caller may not go through the same schema.
  if (input.status === DataRequestStatus.REJECTED && !input.rejectionReason?.trim()) {
    throw badRequest('Rejecting a data request requires a reason.');
  }
  if (input.status === DataRequestStatus.COMPLETED && !input.outcomeNote?.trim()) {
    throw badRequest(
      'Completing a data request requires an outcome note: what was done, and anything lawfully retained.',
    );
  }
  if (input.exportStorageKey && before.kind !== DataRequestKind.EXPORT) {
    throw badRequest('Only an export request carries a produced file.');
  }

  const now = new Date();
  const after = await prisma.dataRequest.update({
    where: { id: before.id },
    data: {
      status: input.status,
      ...(input.rejectionReason === undefined
        ? {}
        : { rejectionReason: input.rejectionReason }),
      ...(input.outcomeNote === undefined ? {} : { outcomeNote: input.outcomeNote }),
      ...(input.exportStorageKey === undefined
        ? {}
        : { exportStorageKey: input.exportStorageKey }),
      startedAt:
        input.status === DataRequestStatus.IN_PROGRESS && !before.startedAt ? now : before.startedAt,
      completedAt: isClosed(input.status) ? now : null,
    },
    select: REQUEST_SELECT,
  });

  recordAudit(context, {
    action: 'datarequest.update',
    targetType: 'DataRequest',
    targetId: after.id,
    reason: input.rejectionReason ?? null,
    summary: `${after.kind} request for ${subjectName(after)} moved to ${input.status}`,
    beforeData: before,
    afterData: diffRecords(before, after),
  });
  return after;
}

function isClosed(status: DataRequestStatus): boolean {
  return (
    status === DataRequestStatus.COMPLETED ||
    status === DataRequestStatus.REJECTED ||
    status === DataRequestStatus.CANCELLED
  );
}

/**
 * The compliance summary a school administrator opens first: how many requests are
 * open, how many are late, and how long the school is actually taking. Median rather
 * than mean, because one request that sat over a summer holiday should not make a
 * responsive school look slow.
 */
export async function requestSummary(
  schoolId: string,
  now = new Date(),
): Promise<{
  open: number;
  overdue: number;
  closedLast90Days: number;
  medianDaysToClose: number | null;
  byKind: Array<{ kind: DataRequestKind; open: number }>;
}> {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);

  const [open, overdue, closed, openByKind] = await Promise.all([
    prisma.dataRequest.count({ where: { schoolId, status: { in: OPEN_STATUSES } } }),
    prisma.dataRequest.count({
      where: { schoolId, status: { in: OPEN_STATUSES }, dueAt: { lt: now } },
    }),
    prisma.dataRequest.findMany({
      where: { schoolId, completedAt: { gte: ninetyDaysAgo } },
      select: { createdAt: true, completedAt: true },
    }),
    prisma.dataRequest.groupBy({
      by: ['kind'],
      where: { schoolId, status: { in: OPEN_STATUSES } },
      _count: { _all: true },
      orderBy: { kind: 'asc' },
    }),
  ]);

  const durations = closed
    .filter((row): row is { createdAt: Date; completedAt: Date } => row.completedAt !== null)
    .map((row) => (row.completedAt.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1_000))
    .sort((a, b) => a - b);

  const median =
    durations.length === 0
      ? null
      : Math.round(durations[Math.floor(durations.length / 2)] * 10) / 10;

  return {
    open,
    overdue,
    closedLast90Days: durations.length,
    medianDaysToClose: median,
    byKind: openByKind.map((entry) => ({ kind: entry.kind, open: entry._count._all })),
  };
}
