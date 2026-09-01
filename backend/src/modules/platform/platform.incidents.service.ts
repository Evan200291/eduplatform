// ─────────────────────────────────────────────────────────────────────────────
// Incident records (blueprint 13, with blueprint 10 duties)
// An incident record exists to answer four questions later: what happened, who
// was affected, when we knew, and what we changed so it does not happen again.
// The last one is enforced — `incidentClosureCheck` refuses to close a SEV1, or
// anything where personal data was affected, without a root cause and the
// preventive actions taken.
//
// `dataAffected` is the flag that matters most. Setting it produces a 72-hour
// notification deadline in every read of the record, so nobody has to remember
// that the clock exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { recordAudit } from '../../core/audit/audit.service';
import { badRequest, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import {
  OPEN_INCIDENT_STATUSES,
  canTransitionIncident,
  incidentClosureCheck,
  incidentTargets,
  isIncidentSeverity,
  isIncidentStatus,
  severityPolicy,
} from './platform.constants';
import type { ClosureCheck, IncidentStatus, IncidentTargets, SeverityPolicy } from './platform.constants';
import type { createIncidentSchema, incidentListQuery, incidentStatusSchema, updateIncidentSchema } from './platform.validation';
import type { z } from 'zod';

type CreateInput = z.infer<typeof createIncidentSchema>;
type UpdateInput = z.infer<typeof updateIncidentSchema>;
type StatusInput = z.infer<typeof incidentStatusSchema>;
type ListQuery = z.infer<typeof incidentListQuery>;

export const INCIDENT_SELECT = {
  id: true,
  reference: true,
  schoolId: true,
  title: true,
  severity: true,
  status: true,
  summary: true,
  impactSummary: true,
  dataAffected: true,
  detectedAt: true,
  mitigatedAt: true,
  resolvedAt: true,
  ownerUserId: true,
  rootCause: true,
  preventiveActions: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IncidentRecordSelect;

export type IncidentRow = Prisma.IncidentRecordGetPayload<{ select: typeof INCIDENT_SELECT }>;

export interface IncidentView {
  incident: IncidentRow;
  /** Null only if a stored severity string predates the current list. */
  policy: SeverityPolicy | null;
  targets: IncidentTargets | null;
  closure: ClosureCheck;
  isOpen: boolean;
  /** True when a target has passed and the incident is still live. */
  overdue: { acknowledge: boolean; mitigate: boolean; notify: boolean };
}

function toView(row: IncidentRow, now = new Date()): IncidentView {
  const severity = isIncidentSeverity(row.severity) ? row.severity : null;
  const policy = severity ? severityPolicy(severity) : null;
  const targets = severity ? incidentTargets(severity, row.detectedAt, row.dataAffected) : null;
  const isOpen = isIncidentStatus(row.status)
    ? OPEN_INCIDENT_STATUSES.includes(row.status)
    : true;

  return {
    incident: row,
    policy,
    targets,
    closure: incidentClosureCheck(row),
    isOpen,
    overdue: {
      // Acknowledgement is evidenced by an owner being named.
      acknowledge: !!targets && !row.ownerUserId && now > targets.acknowledgeBy,
      mitigate: !!targets && !row.mitigatedAt && now > targets.mitigateBy,
      notify: !!targets?.notifyBy && !row.resolvedAt && now > targets.notifyBy,
    },
  };
}

const REFERENCE_PREFIX = 'INC-';

/** `INC-2026-0007`: readable in a message to a school, sortable in a list. */
async function nextReference(detectedAt: Date): Promise<string> {
  const year = detectedAt.getUTCFullYear();
  const countThisYear = await prisma.incidentRecord.count({
    where: { detectedAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
  });

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const candidate = `${REFERENCE_PREFIX}${year}-${String(countThisYear + attempt).padStart(4, '0')}`;
    const taken = await prisma.incidentRecord.findUnique({
      where: { reference: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${REFERENCE_PREFIX}${year}-${Date.now().toString().slice(-6)}`;
}

export async function createIncident(
  context: ActorContext,
  input: CreateInput,
): Promise<IncidentView> {
  const reference = await nextReference(input.detectedAt);

  const row = await prisma.incidentRecord.create({
    data: {
      reference,
      schoolId: input.schoolId ?? null,
      title: input.title,
      severity: input.severity,
      status: 'OPEN',
      summary: input.summary,
      impactSummary: input.impactSummary ?? null,
      dataAffected: input.dataAffected ?? false,
      detectedAt: input.detectedAt,
      ownerUserId: input.ownerUserId ?? null,
    },
    select: INCIDENT_SELECT,
  });

  recordAudit(context, {
    action: 'platform.incident.create',
    targetType: 'IncidentRecord',
    targetId: row.id,
    summary: `${row.reference} raised (${row.severity}): ${row.title}`,
    schoolId: row.schoolId,
    afterData: { severity: row.severity, dataAffected: row.dataAffected },
  });

  return toView(row);
}

export async function listIncidents(query: ListQuery) {
  const { skip, take } = toSkipTake(query);
  const filters: Prisma.IncidentRecordWhereInput[] = [];

  if (query.status) filters.push({ status: query.status });
  if (query.severity) filters.push({ severity: query.severity });
  if (query.schoolId) filters.push({ schoolId: query.schoolId });
  if (query.dataAffected !== undefined) filters.push({ dataAffected: query.dataAffected });
  if (query.openOnly) filters.push({ status: { in: [...OPEN_INCIDENT_STATUSES] } });
  if (query.detectedFrom) filters.push({ detectedAt: { gte: query.detectedFrom } });
  if (query.detectedTo) filters.push({ detectedAt: { lte: query.detectedTo } });
  if (query.search) {
    filters.push({
      OR: [
        { reference: { contains: query.search } },
        { title: { contains: query.search } },
        { summary: { contains: query.search } },
      ],
    });
  }

  const where: Prisma.IncidentRecordWhereInput = filters.length ? { AND: filters } : {};

  const [rows, totalItems] = await Promise.all([
    prisma.incidentRecord.findMany({
      where,
      select: INCIDENT_SELECT,
      orderBy: { detectedAt: 'desc' },
      skip,
      take,
    }),
    prisma.incidentRecord.count({ where }),
  ]);

  return { items: rows.map((row) => toView(row)), totalItems };
}

async function load(id: string): Promise<IncidentRow> {
  const row = await prisma.incidentRecord.findUnique({ where: { id }, select: INCIDENT_SELECT });
  if (!row) throw notFound('That incident could not be found.');
  return row;
}

export async function getIncident(id: string): Promise<IncidentView> {
  return toView(await load(id));
}

export async function updateIncident(
  context: ActorContext,
  id: string,
  input: UpdateInput,
): Promise<IncidentView> {
  const before = await load(id);
  if (before.status === 'CLOSED') {
    throw badRequest(
      `${before.reference} is closed. A closed incident is the record of what happened; reopen it if the facts changed.`,
    );
  }

  const row = await prisma.incidentRecord.update({
    where: { id },
    data: {
      title: input.title ?? undefined,
      severity: input.severity ?? undefined,
      summary: input.summary ?? undefined,
      impactSummary: input.impactSummary ?? undefined,
      dataAffected: input.dataAffected ?? undefined,
      ownerUserId: input.ownerUserId === undefined ? undefined : input.ownerUserId,
      rootCause: input.rootCause ?? undefined,
      preventiveActions: input.preventiveActions ?? undefined,
      mitigatedAt: input.mitigatedAt ?? undefined,
      resolvedAt: input.resolvedAt ?? undefined,
    },
    select: INCIDENT_SELECT,
  });

  recordAudit(context, {
    action: 'platform.incident.update',
    targetType: 'IncidentRecord',
    targetId: row.id,
    summary: `${row.reference} updated`,
    reason: input.rootCause ?? null,
    schoolId: row.schoolId,
    beforeData: { severity: before.severity, dataAffected: before.dataAffected },
    afterData: { severity: row.severity, dataAffected: row.dataAffected },
  });

  return toView(row);
}

/**
 * Moves an incident along its timeline, stamping the time that the new status
 * implies. Closure is the one gated move: the check spells out what is missing
 * so an operator is told "no root cause recorded" rather than "not allowed".
 */
export async function setIncidentStatus(
  context: ActorContext,
  id: string,
  input: StatusInput,
): Promise<IncidentView> {
  const before = await load(id);
  const from: IncidentStatus = isIncidentStatus(before.status) ? before.status : 'OPEN';

  if (from !== input.status && !canTransitionIncident(from, input.status)) {
    throw badRequest(`An incident that is ${from} cannot move to ${input.status}.`);
  }

  const now = new Date();
  const data: Prisma.IncidentRecordUncheckedUpdateInput = { status: input.status };

  if (input.status === 'MITIGATED' && !before.mitigatedAt) data.mitigatedAt = now;
  if (input.status === 'RESOLVED') {
    if (!before.mitigatedAt) data.mitigatedAt = now;
    if (!before.resolvedAt) data.resolvedAt = now;
  }
  if (input.status === 'OPEN') {
    // Reopening means the incident is live again; the resolution no longer holds.
    data.resolvedAt = null;
  }
  if (input.status === 'CLOSED') {
    const check = incidentClosureCheck({
      ...before,
      resolvedAt: before.resolvedAt ?? now,
    });
    if (!check.allowed) {
      throw badRequest(
        `${before.reference} cannot be closed yet. Still needed: ${check.missing.join(', ')}.`,
        { details: { missing: check.missing } },
      );
    }
    if (!before.resolvedAt) data.resolvedAt = now;
  }

  const row = await prisma.incidentRecord.update({ where: { id }, data, select: INCIDENT_SELECT });

  recordAudit(context, {
    action: 'platform.incident.update',
    targetType: 'IncidentRecord',
    targetId: row.id,
    summary: `${row.reference} moved to ${input.status}`,
    reason: input.note ?? null,
    schoolId: row.schoolId,
    beforeData: { status: from },
    afterData: { status: input.status },
  });

  return toView(row);
}

/** Counters for the operations dashboard: what is live, and what is late. */
export async function incidentSummary(now = new Date()) {
  const [byStatus, bySeverity, openRows] = await Promise.all([
    prisma.incidentRecord.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.incidentRecord.groupBy({
      by: ['severity'],
      where: { status: { in: [...OPEN_INCIDENT_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.incidentRecord.findMany({
      where: { status: { in: [...OPEN_INCIDENT_STATUSES] } },
      select: INCIDENT_SELECT,
    }),
  ]);

  const views = openRows.map((row) => toView(row, now));

  return {
    byStatus: byStatus.map((entry) => ({ status: entry.status, count: entry._count._all })),
    openBySeverity: bySeverity.map((entry) => ({
      severity: entry.severity,
      count: entry._count._all,
    })),
    open: views.length,
    overdueMitigation: views.filter((view) => view.overdue.mitigate).length,
    awaitingNotification: views.filter((view) => view.overdue.notify).length,
    dataAffected: views.filter((view) => view.incident.dataAffected).length,
  };
}
