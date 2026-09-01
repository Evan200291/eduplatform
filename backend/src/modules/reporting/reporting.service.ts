// ─────────────────────────────────────────────────────────────────────────────
// Reporting service
// Blueprint 04: "Every report must state what the measure is, where it came from,
// and what it does not prove."
//
// So `runReport` never returns a bare table. It returns the figures together with
// the window they cover, the size of the cohort they came from, the evidence
// sources behind them, and the definition's own measure and limitation notes. A
// caller cannot render the numbers without also having the caveats in hand.
//
// The other rule this file enforces is quieter but matters more: a report's cohort
// is resolved from the actor's scope, never from the query string. Passing
// `?classId=` you are not attached to does not widen a report; it fails.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { diffRecords, recordAudit } from '../../core/audit/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { requireSchoolId } from '../../core/rbac/authorize';
import {
  accessibleStudentIds,
  assertCanAccessClass,
  assertCanViewStudent,
  classStudentIds,
  gradeStudentIds,
  subjectStudentIds,
} from '../../core/rbac/scope.service';
import { rollingWindow } from '../../core/utils/dates';
import { findReport, STANDARD_REPORTS } from './reporting.reports';
import type { ReportColumn, ReportSpec } from './reporting.reports';
import type {
  CreateReportDefinitionInput,
  ReportDefinitionListQuery,
  RunReportQuery,
  UpdateReportDefinitionInput,
} from './reporting.validation';

/** Default reporting window when the caller names neither end. */
const DEFAULT_WINDOW_DAYS = 30;
/** Ceiling on a cohort for one interactive run, so a school-wide report stays bounded. */
const COHORT_CAP = 5_000;
const DEFAULT_ROW_LIMIT = 500;

const DEFINITION_SELECT = {
  id: true,
  schoolId: true,
  name: true,
  key: true,
  description: true,
  scopeLevel: true,
  audience: true,
  measureNotes: true,
  limitationNotes: true,
  evidenceSources: true,
  configuration: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportDefinitionSelect;

type DefinitionRow = Prisma.ReportDefinitionGetPayload<{ select: typeof DEFINITION_SELECT }>;

export interface ReportCohort {
  studentIds: string[];
  /** How the cohort was arrived at, so the output can say so. */
  scope: string;
  scopeId: string | null;
  truncated: boolean;
}

export interface RunReportResult {
  report: {
    key: string;
    name: string;
    description: string | null;
    scopeLevel: string;
  };
  /** Blueprint 04's honesty block. Always present, never optional. */
  measure: {
    measureNotes: string;
    limitationNotes: string;
    evidenceSources: unknown;
    /** Set when a saved definition runs on a standard builder whose notes differ. */
    builder?: { key: string; measureNotes: string; limitationNotes: string };
  };
  window: { from: Date; to: Date; days: number };
  cohort: { size: number; scope: string; scopeId: string | null; truncated: boolean };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  generatedAt: Date;
}

// ── Definitions ─────────────────────────────────────────────────────────────

export async function listDefinitions(
  _context: ActorContext,
  schoolId: string,
  query: ReportDefinitionListQuery,
): Promise<{ items: DefinitionRow[]; totalItems: number }> {
  const where: Prisma.ReportDefinitionWhereInput = {
    archivedAt: null,
    ...(query.includeSystem ? { OR: [{ schoolId }, { schoolId: null }] } : { schoolId }),
    ...(query.activeOnly ? { isActive: true } : {}),
    ...(query.scopeLevel ? { scopeLevel: query.scopeLevel } : {}),
    ...(query.search ? { name: { contains: query.search } } : {}),
  };

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await Promise.all([
    prisma.reportDefinition.findMany({
      where,
      select: DEFINITION_SELECT,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      skip,
      take,
    }),
    prisma.reportDefinition.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * One definition, by id or by key. A school sees its own definitions and the
 * platform's standard ones; nothing else resolves, so a guessed id from another
 * tenant reads as "not found" rather than "forbidden".
 */
export async function getDefinition(schoolId: string, idOrKey: string): Promise<DefinitionRow> {
  const definition = await prisma.reportDefinition.findFirst({
    where: {
      archivedAt: null,
      OR: [{ schoolId }, { schoolId: null }],
      ...(idOrKey.includes('.') ? { key: idOrKey } : { id: idOrKey }),
    },
    select: DEFINITION_SELECT,
    orderBy: { schoolId: 'desc' },
  });

  if (!definition) throw notFound('Report');
  return definition;
}

export async function createDefinition(
  context: ActorContext,
  schoolId: string,
  input: CreateReportDefinitionInput,
): Promise<DefinitionRow> {
  const clash = await prisma.reportDefinition.findFirst({
    where: { schoolId, key: input.key },
    select: { id: true },
  });
  if (clash) throw conflict('A report with that key already exists.');

  const definition = await prisma.reportDefinition.create({
    data: {
      schoolId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      scopeLevel: input.scopeLevel,
      audience: input.audience,
      measureNotes: input.measureNotes,
      limitationNotes: input.limitationNotes,
      evidenceSources: input.evidenceSources,
      configuration: (input.configuration ?? undefined),
      isSystem: false,
      createdById: context.actor.userId,
    },
    select: DEFINITION_SELECT,
  });

  recordAudit(context, {
    action: 'report.definition.create',
    targetType: 'ReportDefinition',
    targetId: definition.id,
    summary: `Created report "${definition.name}"`,
    afterData: { key: definition.key, scopeLevel: definition.scopeLevel },
  });

  return definition;
}

export async function updateDefinition(
  context: ActorContext,
  schoolId: string,
  definitionId: string,
  input: UpdateReportDefinitionInput,
): Promise<DefinitionRow> {
  const before = await prisma.reportDefinition.findFirst({
    where: { id: definitionId, schoolId, archivedAt: null },
    select: DEFINITION_SELECT,
  });

  // A platform standard report is not editable by a school: every export that
  // cites it would silently change meaning for every other tenant.
  if (!before) throw notFound('Report');

  const after = await prisma.reportDefinition.update({
    where: { id: definitionId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description ?? null }),
      ...(input.scopeLevel === undefined ? {} : { scopeLevel: input.scopeLevel }),
      ...(input.audience === undefined ? {} : { audience: input.audience }),
      ...(input.measureNotes === undefined ? {} : { measureNotes: input.measureNotes }),
      ...(input.limitationNotes === undefined ? {} : { limitationNotes: input.limitationNotes }),
      ...(input.evidenceSources === undefined ? {} : { evidenceSources: input.evidenceSources }),
      ...(input.configuration === undefined
        ? {}
        : { configuration: input.configuration as Prisma.InputJsonValue }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: DEFINITION_SELECT,
  });

  recordAudit(context, {
    action: 'report.definition.update',
    targetType: 'ReportDefinition',
    targetId: definitionId,
    summary: `Updated report "${after.name}"`,
    beforeData: { name: before.name },
    afterData: diffRecords(before, after),
  });

  return after;
}

/**
 * Archiving rather than deleting. An export row keeps a `definitionId`, and a
 * figure whose report cannot be looked up is exactly the untraceable number
 * blueprint 04 is written against.
 */
export async function archiveDefinition(
  context: ActorContext,
  schoolId: string,
  definitionId: string,
): Promise<DefinitionRow> {
  const existing = await prisma.reportDefinition.findFirst({
    where: { id: definitionId, schoolId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound('Report');

  const definition = await prisma.reportDefinition.update({
    where: { id: definitionId },
    data: { archivedAt: new Date(), isActive: false },
    select: DEFINITION_SELECT,
  });

  recordAudit(context, {
    action: 'report.definition.update',
    targetType: 'ReportDefinition',
    targetId: definitionId,
    summary: `Archived report "${existing.name}"`,
    afterData: { archived: true },
  });

  return definition;
}

/** The code registry, for a "what can I run?" screen and for the seed to mirror. */
export function standardReportCatalogue(): Array<{
  key: string;
  name: string;
  scopeLevel: string;
  description: string;
  audience: string[];
  measureNotes: string;
  limitationNotes: string;
  evidenceSources: string[];
  columns: ReportColumn[];
}> {
  return STANDARD_REPORTS.map((report) => ({
    key: report.key,
    name: report.name,
    scopeLevel: report.scopeLevel,
    description: report.description,
    audience: report.audience,
    measureNotes: report.measureNotes,
    limitationNotes: report.limitationNotes,
    evidenceSources: report.evidenceSources,
    columns: report.columns,
  }));
}

// ── Running ─────────────────────────────────────────────────────────────────

/**
 * Resolves which learners a run covers.
 *
 * Every branch narrows against `accessibleStudentIds`, including the ones that
 * start from a class or grade id, because being able to name a class is not the
 * same as being allowed to read it.
 */
export async function resolveCohort(
  context: ActorContext,
  schoolId: string,
  query: { studentId?: string; classId?: string; gradeId?: string; subjectId?: string },
): Promise<ReportCohort> {
  const allowed = await accessibleStudentIds(context.actor, context.tenant);

  const narrow = (ids: string[]): string[] =>
    allowed === null ? ids : ids.filter((id) => allowed.includes(id));

  if (query.studentId) {
    await assertCanViewStudent(context.actor, context.tenant, query.studentId);
    return { studentIds: [query.studentId], scope: 'STUDENT', scopeId: query.studentId, truncated: false };
  }

  if (query.classId) {
    await assertCanAccessClass(context.actor, context.tenant, query.classId);
    return cap(narrow(await classStudentIds(query.classId)), 'CLASS', query.classId);
  }

  if (query.gradeId) {
    return cap(narrow(await gradeStudentIds(schoolId, query.gradeId)), 'GRADE', query.gradeId);
  }

  if (query.subjectId) {
    return cap(narrow(await subjectStudentIds(schoolId, query.subjectId)), 'SUBJECT', query.subjectId);
  }

  if (allowed !== null) return cap(allowed, 'ASSIGNED_LEARNERS', null);

  const learners = await prisma.user.findMany({
    where: { schoolId, primaryRole: 'STUDENT', archivedAt: null },
    select: { id: true },
    take: COHORT_CAP + 1,
  });
  return cap(
    learners.map((learner) => learner.id),
    'SCHOOL',
    schoolId,
  );
}

function cap(ids: string[], scope: string, scopeId: string | null): ReportCohort {
  return {
    studentIds: ids.slice(0, COHORT_CAP),
    scope,
    scopeId,
    truncated: ids.length > COHORT_CAP,
  };
}

/** The window a run covers, defaulted here so the output can label it. */
export function resolveWindow(query: { from?: Date; to?: Date }): {
  from: Date;
  to: Date;
  days: number;
} {
  const fallback = rollingWindow(DEFAULT_WINDOW_DAYS);
  const from = query.from ?? fallback.start;
  const to = query.to ?? fallback.end;
  if (from > to) throw badRequest('The start of the window is after its end.');
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  return { from, to, days };
}

/**
 * Which builder a definition runs on.
 *
 * A saved definition is a catalogue entry and a set of caveats; the query behind
 * it is code. A definition whose key is a standard report runs that report; a
 * custom one names its base in `configuration.baseReport`. A definition that
 * names no builder is a description of a report nobody has written yet, and
 * saying so plainly is better than returning an empty table.
 */
export function specFor(definition: Pick<DefinitionRow, 'key' | 'configuration'>): ReportSpec {
  const direct = findReport(definition.key);
  if (direct) return direct;

  const configuration = definition.configuration;
  if (configuration && typeof configuration === 'object' && !Array.isArray(configuration)) {
    const base = (configuration as Record<string, unknown>).baseReport;
    if (typeof base === 'string') {
      const spec = findReport(base);
      if (spec) return spec;
    }
  }

  throw badRequest(
    'This report has no query behind it yet. Set `configuration.baseReport` to one of the standard report keys.',
  );
}

export async function runReport(
  context: ActorContext,
  schoolId: string,
  idOrKey: string,
  query: RunReportQuery,
): Promise<RunReportResult> {
  const definition = await getDefinition(schoolId, idOrKey);
  if (!definition.isActive) throw badRequest('That report is switched off.');

  const spec = specFor(definition);
  assertAudience(context, definition);

  const window = resolveWindow(query);
  const cohort = await resolveCohort(context, schoolId, query);
  const limit = query.limit ?? DEFAULT_ROW_LIMIT;

  const rows = await spec.build({
    schoolId,
    studentIds: cohort.studentIds,
    classId: query.classId,
    gradeId: query.gradeId,
    subjectId: query.subjectId,
    from: window.from,
    to: window.to,
    limit,
  });

  const notesDiffer =
    spec.measureNotes !== definition.measureNotes ||
    spec.limitationNotes !== definition.limitationNotes;

  return {
    report: {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      scopeLevel: definition.scopeLevel,
    },
    measure: {
      measureNotes: definition.measureNotes,
      limitationNotes: definition.limitationNotes,
      evidenceSources: definition.evidenceSources,
      ...(notesDiffer
        ? {
            builder: {
              key: spec.key,
              measureNotes: spec.measureNotes,
              limitationNotes: spec.limitationNotes,
            },
          }
        : {}),
    },
    window,
    cohort: {
      size: cohort.studentIds.length,
      scope: cohort.scope,
      scopeId: cohort.scopeId,
      truncated: cohort.truncated,
    },
    columns: spec.columns,
    rows,
    rowCount: rows.length,
    generatedAt: new Date(),
  };
}

/**
 * A report written for staff is not a report a parent should read, even when the
 * cohort would resolve to their own child. `audience` is a list of role keys and
 * is checked here rather than as a permission, because it is a property of the
 * report rather than of the person.
 */
function assertAudience(context: ActorContext, definition: DefinitionRow): void {
  const audience = definition.audience;
  if (!Array.isArray(audience) || audience.length === 0) return;

  const roles = audience.filter((entry): entry is string => typeof entry === 'string');
  if (roles.length === 0) return;
  if (roles.includes(context.actor.primaryRole)) return;
  if (context.actor.roles.some((role) => roles.includes(role.roleKey))) return;

  throw forbidden('That report is not written for your role.');
}

/** Used by the export worker, which has a school id but no request context. */
export function schoolIdOf(context: ActorContext): string {
  return requireSchoolId(context.tenant);
}
