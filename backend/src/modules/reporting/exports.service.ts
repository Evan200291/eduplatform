// ─────────────────────────────────────────────────────────────────────────────
// Report exports
// Blueprint 10: an export containing learner data expires rather than lingers, and
// a download is authorized per request rather than by holding a URL. Both rules are
// load-bearing here: `storageKey` never leaves this module, every download is
// checked and audited, and `expireStaleExports` deletes the bytes rather than just
// flipping a status column.
//
// Exports run in-process. There is no queue service, because the deployment is one
// PM2 process on one VPS and a queue nobody operates is worse than no queue: the
// row is created first, the file is built after the response, and a restart leaves
// a row this module can honestly mark as failed rather than a job that vanished.
// ─────────────────────────────────────────────────────────────────────────────

import { ReportExportStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, forbidden, notFound, preconditionFailed } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { moduleLogger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { hasSchoolWideRead } from '../../core/rbac/authorize';
import { storage, storagePrefix } from '../../core/storage';
import { MS_PER_DAY, MS_PER_MINUTE } from '../../core/utils/dates';
import { exportFileName, FORMAT_MIME, serialise } from './exports.formats';
import type { ExportPayload } from './exports.formats';
import { getDefinition, resolveCohort, resolveWindow, specFor } from './reporting.service';
import type { ExportListQuery, RequestExportInput } from './reporting.validation';

const log = moduleLogger('reporting.exports');

/** Blueprint 10: learner data in a file does not sit on disk indefinitely. */
const EXPORT_TTL_DAYS = 7;
/** An export may be far larger than an interactive run, but not unbounded. */
const EXPORT_ROW_LIMIT = 20_000;
/** A build still marked RUNNING after this long did not survive a restart. */
const STALE_MINUTES = 30;

const EXPORT_SELECT = {
  id: true,
  schoolId: true,
  definitionId: true,
  requestedById: true,
  format: true,
  status: true,
  parameters: true,
  rowCount: true,
  fileName: true,
  byteSize: true,
  failureReason: true,
  requestedAt: true,
  startedAt: true,
  completedAt: true,
  expiresAt: true,
  downloadCount: true,
  lastDownloadedAt: true,
  definition: { select: { id: true, key: true, name: true, scopeLevel: true } },
} satisfies Prisma.ReportExportSelect;

type ExportRow = Prisma.ReportExportGetPayload<{ select: typeof EXPORT_SELECT }>;

// ── Requesting ──────────────────────────────────────────────────────────────

/**
 * Creates the export row, then builds the file after returning.
 *
 * The actor's context is captured for the build rather than stored, so the file is
 * produced with exactly the scope the requester had at the moment they asked. An
 * export is a snapshot of what one person could see, and re-deriving that later
 * from a saved role list would be a different — and wider — question.
 */
export async function requestExport(
  context: ActorContext,
  schoolId: string,
  input: RequestExportInput,
): Promise<ExportRow> {
  const definition = await getDefinition(schoolId, input.definitionId ?? (input.reportKey as string));
  if (!definition.isActive) throw badRequest('That report is switched off.');
  // Fails now rather than inside the background build, where nobody is watching.
  specFor(definition);

  const parameters = {
    studentId: input.studentId ?? null,
    classId: input.classId ?? null,
    gradeId: input.gradeId ?? null,
    subjectId: input.subjectId ?? null,
    from: input.from?.toISOString() ?? null,
    to: input.to?.toISOString() ?? null,
  };

  const row = await prisma.reportExport.create({
    data: {
      schoolId,
      definitionId: definition.id,
      requestedById: context.actor.userId,
      format: input.format,
      status: ReportExportStatus.QUEUED,
      parameters: parameters,
      expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * MS_PER_DAY),
    },
    select: EXPORT_SELECT,
  });

  recordAudit(context, {
    action: 'report.export.request',
    targetType: 'ReportExport',
    targetId: row.id,
    summary: `Requested ${input.format} export of "${definition.name}"`,
    afterData: parameters,
  });

  void buildExport(context, schoolId, row.id, input).catch((error: unknown) => {
    log.error({ err: error, exportId: row.id }, 'export build failed outside its own handler');
  });

  return row;
}

/** Runs the report and stores the file. Failures are recorded on the row, not thrown. */
async function buildExport(
  context: ActorContext,
  schoolId: string,
  exportId: string,
  input: RequestExportInput,
): Promise<void> {
  try {
    await prisma.reportExport.update({
      where: { id: exportId },
      data: { status: ReportExportStatus.RUNNING, startedAt: new Date() },
    });

    const definition = await getDefinition(schoolId, input.definitionId ?? (input.reportKey as string));
    const spec = specFor(definition);
    const window = resolveWindow(input);
    const cohort = await resolveCohort(context, schoolId, input);

    const rows = await spec.build({
      schoolId,
      studentIds: cohort.studentIds,
      classId: input.classId,
      gradeId: input.gradeId,
      subjectId: input.subjectId,
      from: window.from,
      to: window.to,
      limit: EXPORT_ROW_LIMIT,
    });

    const generatedAt = new Date();
    const payload: ExportPayload = {
      reportName: definition.name,
      reportKey: definition.key,
      measureNotes: definition.measureNotes,
      limitationNotes: definition.limitationNotes,
      evidenceSources: asStrings(definition.evidenceSources),
      window: { from: window.from, to: window.to },
      cohortSize: cohort.studentIds.length,
      scope: cohort.scope,
      generatedAt,
      columns: spec.columns,
      rows,
    };

    const file = serialise(input.format, payload);
    const fileName = exportFileName(definition.key, generatedAt, file.extension);

    const stored = await storage.put({
      prefix: storagePrefix.reportExport(schoolId),
      fileName,
      mimeType: file.mimeType.split(';')[0],
      content: file.content,
    });

    await prisma.reportExport.update({
      where: { id: exportId },
      data: {
        status: ReportExportStatus.READY,
        completedAt: new Date(),
        rowCount: rows.length,
        fileName,
        storageKey: stored.storageKey,
        byteSize: stored.byteSize,
        failureReason: null,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The export could not be produced.';
    log.error({ err: error, exportId }, 'export build failed');
    await prisma.reportExport
      .update({
        where: { id: exportId },
        data: {
          status: ReportExportStatus.FAILED,
          completedAt: new Date(),
          failureReason: reason.slice(0, 600),
        },
      })
      .catch(() => undefined);
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listExports(
  context: ActorContext,
  schoolId: string,
  query: ExportListQuery,
): Promise<{ items: ExportRow[]; totalItems: number }> {
  // Without school-wide read, an actor sees their own requests and nothing else:
  // an export names a cohort, and a cohort is learner data.
  const ownOnly = query.mineOnly || !hasSchoolWideRead(context.actor);

  const where: Prisma.ReportExportWhereInput = {
    schoolId,
    ...(ownOnly ? { requestedById: context.actor.userId } : {}),
    ...(query.definitionId ? { definitionId: query.definitionId } : {}),
    ...(query.includeExpired ? {} : { status: { not: ReportExportStatus.EXPIRED } }),
  };

  const { skip, take } = toSkipTake(query);
  const [items, totalItems] = await Promise.all([
    prisma.reportExport.findMany({
      where,
      select: EXPORT_SELECT,
      orderBy: { requestedAt: 'desc' },
      skip,
      take,
    }),
    prisma.reportExport.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getExport(
  context: ActorContext,
  schoolId: string,
  exportId: string,
): Promise<ExportRow> {
  const row = await prisma.reportExport.findFirst({
    where: { id: exportId, schoolId },
    select: EXPORT_SELECT,
  });
  if (!row) throw notFound('Export');
  assertMayRead(context, row);
  return row;
}

export interface DownloadableExport {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Resolves an export to bytes. Every path through here is authorized and audited,
 * which is the point of storing a key rather than handing out a URL.
 */
export async function downloadExport(
  context: ActorContext,
  schoolId: string,
  exportId: string,
): Promise<DownloadableExport> {
  const row = await prisma.reportExport.findFirst({
    where: { id: exportId, schoolId },
    select: { ...EXPORT_SELECT, storageKey: true },
  });
  if (!row) throw notFound('Export');
  assertMayRead(context, row);

  if (row.status === ReportExportStatus.EXPIRED) {
    throw preconditionFailed('That export has expired. Request it again.');
  }
  if (row.status !== ReportExportStatus.READY || !row.storageKey) {
    throw preconditionFailed('That export is not ready yet.');
  }
  if (row.expiresAt && row.expiresAt <= new Date()) {
    // Expiry is a promise about learner data, so it is enforced on read as well as
    // by the job: a file the sweep has not reached yet is still expired.
    throw preconditionFailed('That export has expired. Request it again.');
  }

  const content = await storage.get(row.storageKey);

  await prisma.reportExport.update({
    where: { id: row.id },
    data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
  });

  recordAudit(context, {
    action: 'report.export.download',
    targetType: 'ReportExport',
    targetId: row.id,
    summary: `Downloaded "${row.fileName ?? row.id}"`,
  });

  return {
    fileName: row.fileName ?? `export-${row.id}.${row.format.toLowerCase()}`,
    mimeType: FORMAT_MIME[row.format],
    content,
  };
}

function assertMayRead(context: ActorContext, row: { requestedById: string }): void {
  if (row.requestedById === context.actor.userId) return;
  if (hasSchoolWideRead(context.actor)) return;
  throw forbidden('That export belongs to someone else.');
}

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * The 6-hourly job. Three jobs in one pass, because they share a clock:
 * expire what is past its date, delete the bytes, and close off builds that a
 * restart left mid-flight.
 *
 * Returns the number of rows it changed, which is what the job registry logs.
 */
export async function expireStaleExports(now = new Date()): Promise<number> {
  let changed = 0;

  const expired = await prisma.reportExport.findMany({
    where: {
      status: { in: [ReportExportStatus.READY, ReportExportStatus.QUEUED, ReportExportStatus.RUNNING] },
      expiresAt: { lte: now },
    },
    select: { id: true, storageKey: true },
    take: 500,
  });

  for (const row of expired) {
    if (row.storageKey) {
      // The row is kept as a record that the export happened; only the bytes go.
      await storage.remove(row.storageKey).catch((error: unknown) => {
        log.warn({ err: error, exportId: row.id }, 'could not delete an expired export file');
      });
    }
    await prisma.reportExport.update({
      where: { id: row.id },
      data: { status: ReportExportStatus.EXPIRED, storageKey: null, byteSize: null },
    });
    changed += 1;
  }

  const stale = await prisma.reportExport.updateMany({
    where: {
      status: { in: [ReportExportStatus.QUEUED, ReportExportStatus.RUNNING] },
      requestedAt: { lte: new Date(now.getTime() - STALE_MINUTES * MS_PER_MINUTE) },
    },
    data: {
      status: ReportExportStatus.FAILED,
      completedAt: now,
      failureReason: 'The server restarted before this export finished. Request it again.',
    },
  });

  changed += stale.count;
  if (changed > 0) log.info({ changed }, 'export sweep complete');
  return changed;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
