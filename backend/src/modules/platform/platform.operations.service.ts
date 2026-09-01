// ─────────────────────────────────────────────────────────────────────────────
// Job runs and release notes (blueprint 13 / 17)
// Two small operational records that share one idea: work the platform does on
// its own must leave a trace a human can read afterwards.
//
// `runJob` is the piece other modules use. It writes the RUNNING row, calls the
// work, and writes a terminal status either way — including on a throw, which is
// exactly the case where a job most needs to have left a record.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, RoleKey } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { recordAudit } from '../../core/audit/audit.service';
import { conflict, notFound } from '../../core/http/errors';
import { toSkipTake, toOrderBy } from '../../core/http/pagination';
import { moduleLogger } from '../../core/logger';
import { STALLED_JOB_HOURS, isStalledRun, jobHealth } from './platform.constants';
import type { JobHealth } from './platform.constants';
import type {
  jobRunListQuery,
  releaseNoteListQuery,
  releaseNoteSchema,
  updateReleaseNoteSchema,
} from './platform.validation';
import type { z } from 'zod';

type JobQuery = z.infer<typeof jobRunListQuery>;
type ReleaseInput = z.infer<typeof releaseNoteSchema>;
type ReleaseUpdate = z.infer<typeof updateReleaseNoteSchema>;
type ReleaseQuery = z.infer<typeof releaseNoteListQuery>;

const log = moduleLogger('platform.operations');

// ── Job runs ────────────────────────────────────────────────────────────────

export const JOB_RUN_SELECT = {
  id: true,
  jobKey: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  itemsProcessed: true,
  itemsFailed: true,
  failureReason: true,
  detail: true,
} satisfies Prisma.JobRunSelect;

export type JobRunRow = Prisma.JobRunGetPayload<{ select: typeof JOB_RUN_SELECT }>;

export interface JobOutcome {
  itemsProcessed?: number;
  itemsFailed?: number;
  detail?: Prisma.InputJsonValue;
  /** Set when the job decided there was nothing to do. */
  skipped?: boolean;
}

/**
 * Runs `work` under an observable job record. The return value of `work` is
 * passed through, so a caller can use this without restructuring anything.
 *
 * Errors are re-thrown after the FAILED row is written: swallowing them here
 * would make a scheduler believe the job succeeded.
 */
export async function runJob<T>(
  jobKey: string,
  work: () => Promise<{ result: T; outcome?: JobOutcome }>,
): Promise<T> {
  const started = Date.now();
  const run = await prisma.jobRun.create({
    data: { jobKey, status: 'RUNNING' },
    select: { id: true },
  });

  try {
    const { result, outcome } = await work();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: {
        status: outcome?.skipped ? 'SKIPPED' : 'SUCCEEDED',
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        itemsProcessed: outcome?.itemsProcessed ?? 0,
        itemsFailed: outcome?.itemsFailed ?? 0,
        detail: outcome?.detail === undefined ? Prisma.DbNull : outcome.detail,
      },
    });
    return result;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    await prisma.jobRun
      .update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Date.now() - started,
          failureReason: reason.slice(0, 4000),
        },
      })
      .catch((writeError: unknown) => {
        log.error({ err: writeError, jobKey }, 'failed to record job failure');
      });
    throw error;
  }
}

export async function listJobRuns(query: JobQuery) {
  const { skip, take } = toSkipTake(query);
  const filters: Prisma.JobRunWhereInput[] = [];

  if (query.jobKey) filters.push({ jobKey: query.jobKey });
  if (query.status) filters.push({ status: query.status });
  if (query.startedFrom) filters.push({ startedAt: { gte: query.startedFrom } });
  if (query.startedTo) filters.push({ startedAt: { lte: query.startedTo } });
  if (query.problemsOnly) {
    const stalledBefore = new Date(Date.now() - STALLED_JOB_HOURS * 3_600_000);
    filters.push({
      OR: [
        { status: 'FAILED' },
        { itemsFailed: { gt: 0 } },
        { status: 'RUNNING', startedAt: { lt: stalledBefore } },
      ],
    });
  }

  const where: Prisma.JobRunWhereInput = filters.length ? { AND: filters } : {};

  const [rows, totalItems] = await Promise.all([
    prisma.jobRun.findMany({
      where,
      select: JOB_RUN_SELECT,
      orderBy: { startedAt: 'desc' },
      skip,
      take,
    }),
    prisma.jobRun.count({ where }),
  ]);

  const now = new Date();
  return {
    items: rows.map((row) => ({ ...row, isStalled: isStalledRun(row, now) })),
    totalItems,
  };
}

/**
 * One line per job key, newest run first. Reads a bounded window rather than the
 * whole table: an operator needs to know whether a job is broken now, and four
 * consecutive failures is already an answer.
 */
export async function jobHealthReport(now = new Date()): Promise<JobHealth[]> {
  const keys = await prisma.jobRun.findMany({
    distinct: ['jobKey'],
    select: { jobKey: true },
    orderBy: { jobKey: 'asc' },
  });

  const reports = await Promise.all(
    keys.map(async ({ jobKey }) => {
      const runs = await prisma.jobRun.findMany({
        where: { jobKey },
        select: { status: true, startedAt: true, finishedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });
      return jobHealth(jobKey, runs, now);
    }),
  );

  // Broken jobs first: the list is read top-down when something is wrong.
  return reports.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
}

// ── Release notes ───────────────────────────────────────────────────────────

export const RELEASE_SELECT = {
  id: true,
  version: true,
  title: true,
  summary: true,
  changes: true,
  affectsEvidenceInterpretation: true,
  audience: true,
  releasedAt: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReleaseNoteSelect;

export type ReleaseRow = Prisma.ReleaseNoteGetPayload<{ select: typeof RELEASE_SELECT }>;

function audienceOf(row: ReleaseRow): RoleKey[] | null {
  if (!Array.isArray(row.audience)) return null;
  return row.audience.filter((value): value is RoleKey =>
    Object.values(RoleKey).includes(value as RoleKey),
  );
}

/**
 * Blueprint 17 keeps the log inside the product so a school can see what
 * changed. An unpublished note is invisible to everyone but platform staff, and
 * an audience list narrows it further — a change to the platform admin panel is
 * not news for a class of nine-year-olds.
 */
export function isVisibleTo(row: ReleaseRow, actor: AuthenticatedActor): boolean {
  if (actor.isPlatformStaff) return true;
  if (!row.isPublished) return false;
  const audience = audienceOf(row);
  if (!audience || audience.length === 0) return true;
  return actor.roles.some((grant) => audience.includes(grant.roleKey));
}

export async function listReleaseNotes(context: ActorContext, query: ReleaseQuery) {
  const { skip, take } = toSkipTake(query);
  const filters: Prisma.ReleaseNoteWhereInput[] = [];

  // Anyone who cannot write releases only ever sees published ones.
  const canSeeDrafts = context.actor.permissions.has('platform.releases.write');
  if (!canSeeDrafts || query.publishedOnly) filters.push({ isPublished: true });
  if (query.affectsEvidenceOnly) filters.push({ affectsEvidenceInterpretation: true });
  if (query.search) {
    filters.push({
      OR: [
        { version: { contains: query.search } },
        { title: { contains: query.search } },
        { summary: { contains: query.search } },
      ],
    });
  }

  const where: Prisma.ReleaseNoteWhereInput = filters.length ? { AND: filters } : {};

  const [rows, totalItems] = await Promise.all([
    prisma.releaseNote.findMany({
      where,
      select: RELEASE_SELECT,
      orderBy: toOrderBy(query.sort, query.order),
      skip,
      take,
    }),
    prisma.releaseNote.count({ where }),
  ]);

  // The audience filter is applied in code because the column is a JSON array.
  return {
    items: rows.filter((row) => isVisibleTo(row, context.actor)),
    totalItems,
  };
}

export async function getReleaseNote(context: ActorContext, version: string): Promise<ReleaseRow> {
  const row = await prisma.releaseNote.findUnique({
    where: { version },
    select: RELEASE_SELECT,
  });
  if (!row || !isVisibleTo(row, context.actor)) {
    throw notFound('That release note could not be found.');
  }
  return row;
}

export async function createReleaseNote(
  context: ActorContext,
  input: ReleaseInput,
): Promise<ReleaseRow> {
  const existing = await prisma.releaseNote.findUnique({
    where: { version: input.version },
    select: { id: true },
  });
  if (existing) throw conflict(`Version ${input.version} already has a release note.`);

  const row = await prisma.releaseNote.create({
    data: {
      version: input.version,
      title: input.title,
      summary: input.summary,
      changes: input.changes,
      affectsEvidenceInterpretation: input.affectsEvidenceInterpretation ?? false,
      audience:
        input.audience === undefined
          ? Prisma.DbNull
          : (input.audience as unknown as Prisma.InputJsonValue),
      releasedAt: input.releasedAt,
      isPublished: input.isPublished ?? false,
    },
    select: RELEASE_SELECT,
  });

  recordAudit(context, {
    action: 'platform.release.publish',
    targetType: 'ReleaseNote',
    targetId: row.id,
    summary: `Release ${row.version} recorded${row.isPublished ? ' and published' : ' as a draft'}`,
    afterData: {
      version: row.version,
      isPublished: row.isPublished,
      affectsEvidenceInterpretation: row.affectsEvidenceInterpretation,
    },
  });

  return row;
}

export async function updateReleaseNote(
  context: ActorContext,
  version: string,
  input: ReleaseUpdate,
): Promise<ReleaseRow> {
  const before = await prisma.releaseNote.findUnique({
    where: { version },
    select: RELEASE_SELECT,
  });
  if (!before) throw notFound('That release note could not be found.');

  const row = await prisma.releaseNote.update({
    where: { version },
    data: {
      version: input.version ?? undefined,
      title: input.title ?? undefined,
      summary: input.summary ?? undefined,
      changes:
        input.changes === undefined ? undefined : (input.changes as unknown as Prisma.InputJsonValue),
      affectsEvidenceInterpretation: input.affectsEvidenceInterpretation ?? undefined,
      audience:
        input.audience === undefined
          ? undefined
          : (input.audience as unknown as Prisma.InputJsonValue),
      releasedAt: input.releasedAt ?? undefined,
      isPublished: input.isPublished ?? undefined,
    },
    select: RELEASE_SELECT,
  });

  recordAudit(context, {
    action: 'platform.release.publish',
    targetType: 'ReleaseNote',
    targetId: row.id,
    summary: `Release ${row.version} updated`,
    beforeData: { isPublished: before.isPublished, version: before.version },
    afterData: { isPublished: row.isPublished, version: row.version },
  });

  return row;
}
