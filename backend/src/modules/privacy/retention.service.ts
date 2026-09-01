// ─────────────────────────────────────────────────────────────────────────────
// Retention service
// The policy side of blueprint 10: a school states how long it keeps each class of
// data, and the platform proves it did so. `applyRetentionPolicies` is the nightly
// job; everything above it is the screen a school administrator uses to set the
// clocks.
//
// The design decision worth knowing: **nothing is purged without a policy row.**
// There are sensible defaults in the catalogue and the seed writes them, but the
// job reads the database, not the defaults. A school that deletes its policies
// keeps its data — surprising a school by deleting children's work it never asked
// us to delete is the worse failure by a wide margin.
//
// Every run is recorded twice: on the policy row (`lastRunAt`, `lastRunRowCount`)
// so the screen can show it, and in the audit trail so it survives the row.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { AuditResult } from '@prisma/client';
import { recordAudit, writeAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { moduleLogger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { MS_PER_DAY } from '../../core/utils/dates';
import { findRetentionClass, retentionCatalogue, RETENTION_CLASSES } from './retention.classes';
import type { RetentionAction, retentionListQuery, upsertRetentionPolicySchema } from './privacy.validation';
import type { z } from 'zod';

const log = moduleLogger('retention');

/**
 * Rows touched per class per run. A first run against years of history would
 * otherwise hold locks long enough to be noticed by every learner online, and the
 * job runs daily, so a backlog drains in a few nights rather than one long stall.
 */
const PURGE_BATCH_LIMIT = 2_000;

type UpsertPolicyInput = z.infer<typeof upsertRetentionPolicySchema>;
type PolicyListQuery = z.infer<typeof retentionListQuery>;

const POLICY_SELECT = {
  id: true,
  schoolId: true,
  dataClass: true,
  retainMonths: true,
  action: true,
  isActive: true,
  notes: true,
  lastRunAt: true,
  lastRunRowCount: true,
  nextRunAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RetentionPolicySelect;

type PolicyRow = Prisma.RetentionPolicyGetPayload<{ select: typeof POLICY_SELECT }>;

/** A policy row plus what the code actually knows how to do with it. */
export interface AnnotatedPolicy extends PolicyRow {
  handler: {
    known: boolean;
    label: string | null;
    clock: string | null;
    supports: RetentionAction[];
    /** Set when the row asks for something this release cannot deliver. */
    warning: string | null;
  };
}

/** Months are how policy documents are written; days are how clocks are kept. */
export function cutoffFor(retainMonths: number, now = new Date()): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retainMonths);
  return cutoff;
}

function annotate(row: PolicyRow): AnnotatedPolicy {
  const handler = findRetentionClass(row.dataClass);
  if (!handler) {
    return {
      ...row,
      handler: {
        known: false,
        label: null,
        clock: null,
        supports: [],
        warning:
          'This platform release has no purge routine for this data class, so the policy is recorded but nothing is purged.',
      },
    };
  }
  const action = row.action as RetentionAction;
  return {
    ...row,
    handler: {
      known: true,
      label: handler.label,
      clock: handler.clock,
      supports: handler.supports,
      warning: handler.supports.includes(action)
        ? null
        : `This data class does not support ${action}. Supported: ${handler.supports.join(', ')}.`,
    },
  };
}

// ── The catalogue ───────────────────────────────────────────────────────────

/**
 * What can be set a clock on, with the platform's own defaults. A retention screen
 * shows this next to the school's rows so an administrator can see both the gap and
 * what each class actually means.
 */
export function retentionOptions(): ReturnType<typeof retentionCatalogue> {
  return retentionCatalogue();
}

// ── Policies ────────────────────────────────────────────────────────────────

export async function listPolicies(
  _context: ActorContext,
  schoolId: string,
  query: PolicyListQuery,
): Promise<{ items: AnnotatedPolicy[]; totalItems: number }> {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.RetentionPolicyWhereInput = {
    ...(query.includePlatformDefaults ? { OR: [{ schoolId }, { schoolId: null }] } : { schoolId }),
    ...(query.activeOnly ? { isActive: true } : {}),
    ...(query.search ? { dataClass: { contains: query.search } } : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.retentionPolicy.findMany({
      where,
      select: POLICY_SELECT,
      // A school's own row sorts above the platform default it overrides.
      orderBy: [{ dataClass: 'asc' }, { schoolId: 'desc' }],
      skip,
      take,
    }),
    prisma.retentionPolicy.count({ where }),
  ]);
  return { items: rows.map(annotate), totalItems };
}

/**
 * One row per school per data class, so setting a clock is idempotent. Written as
 * find-then-write rather than `upsert` because the unique key includes a nullable
 * column, which MySQL and Prisma between them do not make safe to upsert on.
 */
export async function upsertPolicy(
  context: ActorContext,
  schoolId: string,
  input: UpsertPolicyInput,
): Promise<AnnotatedPolicy> {
  const handler = findRetentionClass(input.dataClass);
  if (!handler) {
    throw badRequest(
      `Unknown data class "${input.dataClass}". Known classes: ${RETENTION_CLASSES.map((entry) => entry.dataClass).join(', ')}.`,
    );
  }
  if (!handler.supports.includes(input.action)) {
    throw badRequest(
      input.action === 'ARCHIVE'
        ? 'Archiving is not available: there is no cold storage tier to archive to. Use ANONYMIZE where the shape of the record still matters, or DELETE.'
        : `${handler.label} cannot be ${input.action.toLowerCase()}d. Supported actions: ${handler.supports.join(', ')}.`,
    );
  }

  const existing = await prisma.retentionPolicy.findFirst({
    where: { schoolId, dataClass: input.dataClass },
    select: POLICY_SELECT,
  });

  const data = {
    retainMonths: input.retainMonths,
    action: input.action,
    isActive: input.isActive ?? true,
    notes: input.notes ?? null,
  };

  const row = existing
    ? await prisma.retentionPolicy.update({
        where: { id: existing.id },
        data,
        select: POLICY_SELECT,
      })
    : await prisma.retentionPolicy.create({
        data: { schoolId, dataClass: input.dataClass, ...data },
        select: POLICY_SELECT,
      });

  recordAudit(context, {
    action: 'retention.update',
    targetType: 'RetentionPolicy',
    targetId: row.id,
    summary: `${existing ? 'Updated' : 'Set'} retention for ${handler.label}: ${input.action} after ${input.retainMonths} months`,
    beforeData: existing,
    afterData: row,
  });
  return annotate(row);
}

/**
 * Turning a policy off rather than deleting it. The row is the evidence that the
 * school once decided something, and a deleted row cannot be distinguished from a
 * clock nobody ever set.
 */
export async function setPolicyActive(
  context: ActorContext,
  schoolId: string,
  policyId: string,
  isActive: boolean,
): Promise<AnnotatedPolicy> {
  const existing = await prisma.retentionPolicy.findFirst({
    where: { id: policyId, schoolId },
    select: POLICY_SELECT,
  });
  if (!existing) throw notFound('Retention policy');

  const row = await prisma.retentionPolicy.update({
    where: { id: existing.id },
    data: { isActive },
    select: POLICY_SELECT,
  });
  recordAudit(context, {
    action: 'retention.update',
    targetType: 'RetentionPolicy',
    targetId: row.id,
    summary: `${isActive ? 'Resumed' : 'Paused'} retention for ${existing.dataClass}`,
    beforeData: existing,
    afterData: row,
  });
  return annotate(row);
}

// ── Running ─────────────────────────────────────────────────────────────────

export interface PolicyRunOutcome {
  policyId: string;
  schoolId: string | null;
  dataClass: string;
  action: string;
  cutoff: Date;
  rowsAffected: number;
  /** Set when the policy could not be run, and why, in words an operator can act on. */
  skippedReason: string | null;
}

/** One policy, one batch. Shared by the job and the manual "run now" route. */
async function runPolicy(policy: PolicyRow, now: Date): Promise<PolicyRunOutcome> {
  const base = {
    policyId: policy.id,
    schoolId: policy.schoolId,
    dataClass: policy.dataClass,
    action: policy.action,
    cutoff: cutoffFor(policy.retainMonths, now),
  };

  const handler = findRetentionClass(policy.dataClass);
  if (!handler) {
    return { ...base, rowsAffected: 0, skippedReason: 'No purge routine exists for this data class.' };
  }
  const action = policy.action as RetentionAction;
  if (!handler.supports.includes(action)) {
    return {
      ...base,
      rowsAffected: 0,
      skippedReason: `${handler.label} does not support ${action}; supported: ${handler.supports.join(', ')}.`,
    };
  }

  const rowsAffected = await handler.purge(action, {
    schoolId: policy.schoolId,
    cutoff: base.cutoff,
    limit: PURGE_BATCH_LIMIT,
  });

  await prisma.retentionPolicy.update({
    where: { id: policy.id },
    data: {
      lastRunAt: now,
      lastRunRowCount: rowsAffected,
      nextRunAt: new Date(now.getTime() + MS_PER_DAY),
    },
  });
  return { ...base, rowsAffected, skippedReason: null };
}

/**
 * The nightly job. Returns the total number of rows purged or anonymised, which is
 * what the job runner logs.
 *
 * A policy that cannot run does not stop the ones that can, and each failure is
 * recorded against its own policy — one school's misconfigured row must not stop
 * another school's retention from being honoured.
 */
export async function applyRetentionPolicies(now = new Date()): Promise<number> {
  const policies = await prisma.retentionPolicy.findMany({
    where: { isActive: true },
    select: POLICY_SELECT,
    orderBy: [{ schoolId: 'asc' }, { dataClass: 'asc' }],
  });
  if (policies.length === 0) {
    log.info('no active retention policies; nothing to purge');
    return 0;
  }

  let total = 0;
  for (const policy of policies) {
    try {
      const outcome = await runPolicy(policy, now);
      total += outcome.rowsAffected;

      if (outcome.skippedReason) {
        log.warn(
          { policyId: policy.id, dataClass: policy.dataClass, reason: outcome.skippedReason },
          'retention policy skipped',
        );
      }
      // Silence on a zero-row run: a clean night should not fill the audit trail.
      if (outcome.rowsAffected > 0 || outcome.skippedReason) {
        await writeAudit(null, {
          action: 'retention.run',
          targetType: 'RetentionPolicy',
          targetId: policy.id,
          schoolId: policy.schoolId,
          result: outcome.skippedReason ? AuditResult.FAILURE : AuditResult.SUCCESS,
          reason: outcome.skippedReason,
          summary: outcome.skippedReason
            ? `Retention skipped for ${policy.dataClass}`
            : `${policy.action} applied to ${outcome.rowsAffected} ${policy.dataClass} rows older than ${policy.retainMonths} months`,
          afterData: outcome,
        });
      }
    } catch (error: unknown) {
      log.error({ err: error, policyId: policy.id, dataClass: policy.dataClass }, 'retention run failed');
      await writeAudit(null, {
        action: 'retention.run',
        targetType: 'RetentionPolicy',
        targetId: policy.id,
        schoolId: policy.schoolId,
        result: AuditResult.FAILURE,
        reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        summary: `Retention failed for ${policy.dataClass}`,
      });
    }
  }
  return total;
}

/**
 * Running one policy on demand, which is how an administrator confirms a clock does
 * what they expect before trusting it to a job at 3am. Same code path as the job,
 * same batch cap, and audited the same way.
 */
export async function runPolicyNow(
  context: ActorContext,
  schoolId: string,
  policyId: string,
): Promise<PolicyRunOutcome> {
  const policy = await prisma.retentionPolicy.findFirst({
    where: { id: policyId, schoolId },
    select: POLICY_SELECT,
  });
  if (!policy) throw notFound('Retention policy');
  if (!policy.isActive) {
    throw badRequest('This policy is paused. Resume it before running it.');
  }

  const outcome = await runPolicy(policy, new Date());
  recordAudit(context, {
    action: 'retention.run',
    targetType: 'RetentionPolicy',
    targetId: policy.id,
    result: outcome.skippedReason ? AuditResult.FAILURE : AuditResult.SUCCESS,
    reason: outcome.skippedReason,
    summary: outcome.skippedReason
      ? `Manual retention run skipped for ${policy.dataClass}`
      : `Manual run: ${policy.action} applied to ${outcome.rowsAffected} ${policy.dataClass} rows`,
    afterData: outcome,
  });
  if (outcome.skippedReason) throw badRequest(outcome.skippedReason);
  return outcome;
}
