// ─────────────────────────────────────────────────────────────────────────────
// Audit trail
// Blueprint 05: "Every significant action is attributable." Blueprint 04: a
// teacher's decision on a recommendation, an override of a mark, and a change to
// a sensitive note must all be recoverable later with who, what, when and why.
//
// Two design decisions worth knowing:
//  - Writes never throw into the caller. An audit failure is logged loudly but
//    must not roll back the action the user just completed successfully.
//  - `beforeData`/`afterData` are passed through `sanitize()`, so a snapshot can
//    include a whole record without risking a password hash in the log.
// ─────────────────────────────────────────────────────────────────────────────

import { AuditResult, type Prisma, type RoleKey } from '@prisma/client';
import type { ActorContext } from '../context';
import { logger, sanitize } from '../logger';
import { prisma } from '../prisma';

const log = logger.child({ module: 'audit' });

/**
 * Canonical action keys. Kept as a union so a typo fails the build and so the
 * admin audit view can offer a fixed filter list.
 */
export type AuditAction =
  // Authentication
  | 'auth.login'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.refresh'
  | 'auth.password.change'
  | 'auth.password.reset'
  | 'auth.pin.reset'
  | 'auth.account.locked'
  | 'auth.session.revoke'
  // Tenancy
  | 'organization.create'
  | 'organization.update'
  | 'organization.suspend'
  | 'organization.archive'
  | 'school.create'
  | 'school.update'
  | 'school.suspend'
  | 'school.archive'
  | 'school.settings.update'
  // Commercial
  | 'subscription.create'
  | 'subscription.update'
  | 'subscription.cancel'
  | 'entitlement.set'
  | 'entitlement.delete'
  // Branding
  | 'theme.create'
  | 'theme.update'
  | 'theme.publish'
  | 'theme.activate'
  // Identity
  | 'user.create'
  | 'user.update'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.archive'
  | 'user.credentials.reset'
  | 'role.assign'
  | 'role.revoke'
  | 'invitation.create'
  | 'invitation.accept'
  | 'invitation.revoke'
  | 'usergroup.create'
  | 'usergroup.update'
  | 'usergroup.member.add'
  | 'usergroup.member.remove'
  // Academic
  | 'grade.create'
  | 'grade.update'
  | 'class.create'
  | 'class.update'
  | 'class.roster.update'
  | 'class.teacher.assign'
  | 'class.teacher.remove'
  | 'subject.create'
  | 'subject.update'
  | 'term.create'
  | 'term.update'
  // Content
  | 'curriculum.create'
  | 'curriculum.update'
  | 'lesson.create'
  | 'lesson.update'
  | 'activity.create'
  | 'activity.update'
  | 'content.review'
  | 'content.publish'
  | 'content.archive'
  | 'content.report.create'
  | 'content.report.resolve'
  | 'media.upload'
  | 'media.update'
  | 'media.moderate'
  | 'media.delete'
  | 'ownership.record'
  // Assessment and learning
  | 'assessment.create'
  | 'assessment.update'
  | 'assessment.publish'
  | 'assessment.attempt.start'
  | 'assessment.attempt.submit'
  | 'assessment.response.override'
  | 'learningpath.generate'
  | 'learningpath.update'
  | 'learningpath.approve'
  | 'recommendation.create'
  | 'recommendation.decide'
  | 'mastery.override'
  | 'teacherassessment.create'
  | 'note.create'
  | 'note.update'
  | 'note.withdraw'
  | 'note.escalate'
  // Assignments
  | 'assignment.create'
  | 'assignment.update'
  | 'assignment.publish'
  | 'assignment.delete'
  | 'assignment.feedback'
  | 'assignment.excuse'
  // Gamification
  | 'points.award'
  | 'points.adjust'
  | 'points.reverse'
  | 'badge.create'
  | 'badge.update'
  | 'badge.award'
  | 'badge.revoke'
  | 'reward.create'
  | 'reward.update'
  | 'reward.grant'
  | 'mission.create'
  | 'mission.update'
  | 'companion.configure'
  | 'leaderboard.configure'
  // Communication
  | 'notification.send'
  | 'notification.broadcast'
  // Reporting
  | 'report.definition.create'
  | 'report.definition.update'
  | 'report.export.request'
  | 'report.export.download'
  // Support
  | 'support.create'
  | 'support.update'
  | 'support.assign'
  | 'support.resolve'
  // Privacy and platform
  | 'datarequest.create'
  | 'datarequest.update'
  | 'consent.record'
  | 'retention.update'
  | 'retention.run'
  | 'platform.settings.update'
  | 'platform.feature.update'
  | 'platform.release.publish'
  | 'platform.incident.create'
  | 'platform.incident.update'
  | 'platform.tenant.impersonate';

export interface AuditInput {
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  summary?: string;
  result?: AuditResult;
  /** Why the action was taken, where the UI collects a reason. */
  reason?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  /** Overrides the tenant taken from the request context. */
  organizationId?: string | null;
  schoolId?: string | null;
  /** Overrides the actor, used by system jobs that have no request. */
  actorUserId?: string | null;
  actorRole?: RoleKey | null;
  isImpersonation?: boolean;
}

/**
 * Records an audited action. Fire-and-forget by design — callers do not await a
 * log write in the request's critical path unless they need ordering.
 */
export function recordAudit(context: ActorContext | null, input: AuditInput): void {
  void writeAudit(context, input).catch((error: unknown) => {
    log.error({ err: error, action: input.action }, 'failed to write audit entry');
  });
}

export async function writeAudit(context: ActorContext | null, input: AuditInput): Promise<void> {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    organizationId: input.organizationId ?? context?.tenant.organizationId ?? null,
    schoolId: input.schoolId ?? context?.tenant.schoolId ?? null,
    actorUserId: input.actorUserId ?? context?.actor.userId ?? null,
    actorRole: input.actorRole ?? context?.actor.primaryRole ?? null,
    isImpersonation: input.isImpersonation ?? context?.tenant.isImpersonatedTenant ?? false,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary?.slice(0, 500) ?? null,
    result: input.result ?? AuditResult.SUCCESS,
    reason: input.reason?.slice(0, 500) ?? null,
    beforeData: toJson(input.beforeData),
    afterData: toJson(input.afterData),
    ipAddress: context?.request.ipAddress?.slice(0, 64) ?? null,
    userAgent: context?.request.userAgent?.slice(0, 400) ?? null,
    requestId: context?.request.requestId ?? null,
  };

  await prisma.auditLog.create({ data });
}

/** Records a denied action. Blueprint 05: refusals are as informative as successes. */
export function recordDenied(context: ActorContext | null, input: Omit<AuditInput, 'result'>): void {
  recordAudit(context, { ...input, result: AuditResult.DENIED });
}

/** Records a failed action, e.g. a login attempt with the wrong password. */
export function recordFailure(context: ActorContext | null, input: Omit<AuditInput, 'result'>): void {
  recordAudit(context, { ...input, result: AuditResult.FAILURE });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitize(value) as Prisma.InputJsonValue;
}

/**
 * Produces a compact `{ field: [before, after] }` diff so an audit row records
 * what changed rather than two full copies of a wide record.
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, [unknown, unknown]> {
  const output: Record<string, [unknown, unknown]> = {};
  if (!before || !after) return output;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const previous = before[key];
    const next = after[key];
    if (JSON.stringify(previous) !== JSON.stringify(next)) output[key] = [previous, next];
  }
  return output;
}
