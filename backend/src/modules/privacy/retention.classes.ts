// ─────────────────────────────────────────────────────────────────────────────
// Retention data classes
// Blueprint 10 asks for retention that is stated, scheduled and evidenced. A
// retention policy row says *what* and *how long*; this file says *how*, and the
// two are deliberately separate — a school administrator can set a clock, but only
// a release can teach the platform how to purge a new kind of data.
//
// Three rules hold everywhere below:
//
//   1. A data class with no handler is never purged. An unknown `dataClass` on a
//      policy row is reported as a skipped run with a reason, not silently ignored
//      and not guessed at. Deleting the wrong table is not a recoverable mistake.
//   2. Every purge is batched and ordered oldest-first, and every handler's filter
//      excludes rows it has already dealt with. A job that cannot make progress
//      past its first batch would report the same number every night and purge
//      nothing, which is worse than a job that does not run.
//   3. Nothing here supports ARCHIVE. There is no cold store on a single VPS, so
//      the policy writer refuses ARCHIVE rather than accepting a promise the
//      platform cannot keep.
// ─────────────────────────────────────────────────────────────────────────────

import { DataRequestStatus } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { storage } from '../../core/storage';
import type { RetentionAction } from './privacy.validation';

/** One batch of one class for one policy. */
export interface PurgeContext {
  /** Null for a platform default policy, which applies to every school. */
  schoolId: string | null;
  /** Rows whose clock field is older than this are in scope. */
  cutoff: Date;
  /** Hard cap on rows touched per run, so a first run cannot lock the database. */
  limit: number;
}

export interface RetentionClass {
  dataClass: string;
  label: string;
  /** What the data is, in the words a school would use. */
  description: string;
  /** The field the clock is measured from, named so a policy screen can show it. */
  clock: string;
  supports: RetentionAction[];
  defaultRetainMonths: number;
  defaultAction: RetentionAction;
  purge: (action: RetentionAction, context: PurgeContext) => Promise<number>;
}

/** Ids only: selecting then acting keeps the batch cap honest under MySQL. */
function idsOf(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id);
}

/** A school filter that a platform default policy widens to every school. */
function scopeFilter(schoolId: string | null): { schoolId?: string } {
  return schoolId ? { schoolId } : {};
}

// ── Audit trail ─────────────────────────────────────────────────────────────

const auditLogs: RetentionClass = {
  dataClass: 'audit_logs',
  label: 'Audit trail',
  description:
    'Who did what, to which record, and when. Anonymising keeps the shape of what happened for as long as the school needs it while dropping who did it and from where — which is usually the right answer for an old trail, because the accountability value fades faster than the personal data does.',
  clock: 'occurredAt',
  supports: ['ANONYMIZE', 'DELETE'],
  defaultRetainMonths: 84,
  defaultAction: 'ANONYMIZE',
  purge: async (action, { schoolId, cutoff, limit }) => {
    if (action === 'DELETE') {
      const rows = await prisma.auditLog.findMany({
        where: { ...scopeFilter(schoolId), occurredAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      });
      if (rows.length === 0) return 0;
      const result = await prisma.auditLog.deleteMany({ where: { id: { in: idsOf(rows) } } });
      return result.count;
    }

    // Already-stripped rows are excluded, so each run advances through the table.
    const rows = await prisma.auditLog.findMany({
      where: {
        ...scopeFilter(schoolId),
        occurredAt: { lt: cutoff },
        OR: [
          { actorUserId: { not: null } },
          { ipAddress: { not: null } },
          { userAgent: { not: null } },
        ],
      },
      select: { id: true },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await prisma.auditLog.updateMany({
      where: { id: { in: idsOf(rows) } },
      data: { actorUserId: null, ipAddress: null, userAgent: null },
    });
    return result.count;
  },
};

// ── Learner evidence ────────────────────────────────────────────────────────

const studentResponses: RetentionClass = {
  dataClass: 'student_responses',
  label: 'Learner answers',
  description:
    "Every answer a learner submitted, including the answer itself. There is no partial version of this worth keeping — a response stripped of the response is a row that costs storage and proves nothing — so when the clock runs out the row goes. Aggregate mastery and progress records survive independently, which means historical reports thin out rather than changing their figures.",
  clock: 'answeredAt',
  supports: ['DELETE'],
  defaultRetainMonths: 36,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const rows = await prisma.studentResponse.findMany({
      where: { ...scopeFilter(schoolId), answeredAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { answeredAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await prisma.studentResponse.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

const progressRecords: RetentionClass = {
  dataClass: 'progress_records',
  label: 'Activity progress',
  description:
    'One row per learner per activity: did they do it, how long it took, how many attempts. The clock runs from the last activity on the row, not from when it was created, so a path a learner is still working through is never in scope however old it is.',
  clock: 'lastActivityAt',
  supports: ['DELETE'],
  defaultRetainMonths: 36,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const rows = await prisma.progressRecord.findMany({
      where: { ...scopeFilter(schoolId), lastActivityAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { lastActivityAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await prisma.progressRecord.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

const teacherNotes: RetentionClass = {
  dataClass: 'teacher_notes',
  label: 'Teacher notes',
  description:
    'Free text a teacher wrote about a named child. The schema says notes are never hard-deleted, only withdrawn with a reason; retention is the single exception to that, and it is why the default clock here is the longest of any learner data class. Notes still under follow-up are excluded regardless of age.',
  clock: 'createdAt',
  supports: ['DELETE'],
  defaultRetainMonths: 84,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const rows = await prisma.teacherNote.findMany({
      where: {
        ...scopeFilter(schoolId),
        createdAt: { lt: cutoff },
        // An open follow-up means the note is still doing its job.
        OR: [{ followUpDueAt: null }, { followUpDoneAt: { not: null } }],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await prisma.teacherNote.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

// ── Operational data ────────────────────────────────────────────────────────

const notifications: RetentionClass = {
  dataClass: 'notifications',
  label: 'Notifications',
  description:
    'In-app and emailed notifications, which quote learner names and often a figure about them. Short by default: an unread nudge from two terms ago is not a record anybody needs.',
  clock: 'createdAt',
  supports: ['DELETE'],
  defaultRetainMonths: 6,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const rows = await prisma.notification.findMany({
      where: { ...scopeFilter(schoolId), createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;
    const result = await prisma.notification.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

const reportExports: RetentionClass = {
  dataClass: 'report_exports',
  label: 'Report export records',
  description:
    'The record that somebody exported a report: who, what parameters, how many rows. The file itself is deleted seven days after it is built by the reporting sweep, so what this class removes is the record of the request. Any file that somehow outlived the sweep is deleted here too.',
  clock: 'requestedAt',
  supports: ['DELETE'],
  defaultRetainMonths: 12,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const rows = await prisma.reportExport.findMany({
      where: { ...scopeFilter(schoolId), requestedAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
      orderBy: { requestedAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;

    for (const row of rows) {
      if (!row.storageKey) continue;
      // A missing object is the expected case; the sweep usually got there first.
      await storage.remove(row.storageKey).catch(() => undefined);
    }
    const result = await prisma.reportExport.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

const dataRequests: RetentionClass = {
  dataClass: 'data_requests',
  label: 'Closed data requests',
  description:
    'Completed, rejected and cancelled data rights requests, including the outcome note. An open request is never in scope at any age — the whole point of the record is that somebody still owes an answer.',
  clock: 'updatedAt',
  supports: ['DELETE'],
  defaultRetainMonths: 84,
  defaultAction: 'DELETE',
  purge: async (_action, { schoolId, cutoff, limit }) => {
    const closed: DataRequestStatus[] = [
      DataRequestStatus.COMPLETED,
      DataRequestStatus.REJECTED,
      DataRequestStatus.CANCELLED,
    ];
    const rows = await prisma.dataRequest.findMany({
      where: { ...scopeFilter(schoolId), status: { in: closed }, updatedAt: { lt: cutoff } },
      select: { id: true, exportStorageKey: true },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    if (rows.length === 0) return 0;

    for (const row of rows) {
      if (!row.exportStorageKey) continue;
      await storage.remove(row.exportStorageKey).catch(() => undefined);
    }
    const result = await prisma.dataRequest.deleteMany({
      where: { id: { in: idsOf(rows) } },
    });
    return result.count;
  },
};

// ── The registry ────────────────────────────────────────────────────────────

export const RETENTION_CLASSES: RetentionClass[] = [
  auditLogs,
  studentResponses,
  progressRecords,
  teacherNotes,
  notifications,
  reportExports,
  dataRequests,
];

export function findRetentionClass(dataClass: string): RetentionClass | undefined {
  return RETENTION_CLASSES.find((entry) => entry.dataClass === dataClass);
}

/**
 * What a school may set a clock on, and what the platform would set if nobody did.
 * The seed mirrors this so a new school starts with a defensible policy rather than
 * a blank retention screen.
 */
export function retentionCatalogue(): Array<
  Omit<RetentionClass, 'purge'> & { supports: RetentionAction[] }
> {
  return RETENTION_CLASSES.map(({ purge: _purge, ...entry }) => entry);
}

/** Type guard used by the API to keep an unusable action out of the database. */
export function supportsAction(dataClass: string, action: RetentionAction): boolean {
  return findRetentionClass(dataClass)?.supports.includes(action) ?? false;
}
