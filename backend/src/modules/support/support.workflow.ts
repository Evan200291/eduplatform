// ─────────────────────────────────────────────────────────────────────────────
// Support workflow transitions (blueprint 13)
// Every function here moves a request between the states declared in
// ./support.policy.ts, and every one of them writes an audit entry. The reason
// is the blueprint's own closure criteria: to say a category was handled
// correctly you have to be able to show who decided what, and when.
//
// The transition map is checked before any write, so an out-of-order move
// returns a readable error instead of leaving a request in a state the reports
// cannot explain.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { SupportStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { assertPermission } from '../../core/rbac/authorize';
import { recordAudit } from '../../core/audit/audit.service';
import { badRequest, forbidden, notFound } from '../../core/http/errors';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  categoryPolicy,
  effectivePriority,
  responseTargets,
} from './support.policy';
import {
  loadVisible,
  toView,
  REQUEST_SELECT,
  type RequestRow,
  type RequestView,
} from './support.service';
import type {
  assignSchema,
  closeSchema,
  escalateSchema,
  resolveSchema,
  statusChangeSchema,
  triageSchema,
} from './support.validation';
import type { z } from 'zod';

type AssignInput = z.infer<typeof assignSchema>;
type CloseInput = z.infer<typeof closeSchema>;
type EscalateInput = z.infer<typeof escalateSchema>;
type ResolveInput = z.infer<typeof resolveSchema>;
type StatusInput = z.infer<typeof statusChangeSchema>;
type TriageInput = z.infer<typeof triageSchema>;

/** Loads a request for an agent action, refusing anything already closed. */
async function loadForAction(context: ActorContext, id: string): Promise<RequestRow> {
  const row = await loadVisible(context, id);
  if (row.status === SupportStatus.CLOSED) {
    throw badRequest(
      `${row.reference} is closed. Reopening a closed request would hide the history, so raise a new one and reference it.`,
    );
  }
  return row;
}

function assertMove(row: RequestRow, next: SupportStatus): void {
  if (row.status === next) return;
  if (!canTransition(row.status, next)) {
    throw badRequest(
      `A request that is ${row.status} cannot move to ${next}.`,
      { details: { from: row.status, allowed: ALLOWED_TRANSITIONS[row.status] } },
    );
  }
}

/**
 * Records the decision as a message on the request. An agent note without a
 * trace is how a school ends up being told two different things by two people.
 */
async function noteOnRequest(
  requestId: string,
  authorId: string,
  body: string,
  isInternal: boolean,
): Promise<void> {
  await prisma.supportMessage.create({ data: { requestId, authorId, body, isInternal } });
}

// ── Triage ──────────────────────────────────────────────────────────────────

/**
 * Triage is the moment someone decides what a request actually is. Changing the
 * category can change the owner and the floor priority, so both are recut here.
 * The response clock is only reset when asked for, because a mis-filed request
 * should not buy the platform extra time by default.
 */
export async function triageRequest(
  context: ActorContext,
  id: string,
  input: TriageInput,
): Promise<RequestView> {
  assertPermission(context.actor, 'support.respond');
  const row = await loadForAction(context, id);

  const category = input.category ?? row.category;
  const priority = effectivePriority(category, input.priority ?? row.priority);

  const data: Prisma.SupportRequestUncheckedUpdateInput = { category, priority };
  if (row.status === SupportStatus.NEW) data.status = SupportStatus.TRIAGED;
  if (input.recalculateTargets) {
    const targets = responseTargets(priority);
    data.firstResponseDueAt = targets.firstResponseDueAt;
    data.resolutionDueAt = targets.resolutionDueAt;
  }

  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data,
    select: REQUEST_SELECT,
  });

  if (input.note) {
    await noteOnRequest(row.id, context.actor.userId, input.note, true);
  }

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `Triaged ${row.reference} as ${category} / ${priority}`,
    reason: input.note ?? null,
    schoolId: row.schoolId,
    beforeData: { category: row.category, priority: row.priority, status: row.status },
    afterData: { category, priority, status: updated.status },
  });

  return toView(context, updated);
}

// ── Assignment ──────────────────────────────────────────────────────────────

/**
 * Assignment names the owner the blueprint requires per category. The assignee
 * must be an active user; a request parked on a suspended account is the same
 * as an unowned one, only harder to notice.
 */
export async function assignRequest(
  context: ActorContext,
  id: string,
  input: AssignInput,
): Promise<RequestView> {
  assertPermission(context.actor, 'support.assign');
  const row = await loadForAction(context, id);

  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: input.assigneeId, status: UserStatus.ACTIVE },
      select: { id: true, displayName: true },
    });
    if (!assignee) throw notFound('That person could not be assigned. Check they are still active.');
  }

  const data: Prisma.SupportRequestUncheckedUpdateInput = { assigneeId: input.assigneeId };
  // Picking up unowned work is the same act as starting it.
  if (input.assigneeId && (row.status === SupportStatus.NEW || row.status === SupportStatus.TRIAGED)) {
    data.status = SupportStatus.IN_PROGRESS;
  }

  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data,
    select: REQUEST_SELECT,
  });

  if (input.note) await noteOnRequest(row.id, context.actor.userId, input.note, true);

  recordAudit(context, {
    action: 'support.assign',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: input.assigneeId
      ? `${row.reference} assigned to ${updated.assignee?.displayName ?? input.assigneeId}`
      : `${row.reference} returned to the queue`,
    reason: input.note ?? null,
    schoolId: row.schoolId,
    beforeData: { assigneeId: row.assigneeId },
    afterData: { assigneeId: input.assigneeId },
  });

  return toView(context, updated);
}

// ── Plain status moves ──────────────────────────────────────────────────────

/**
 * Used for the moves that carry no extra payload, chiefly starting work and
 * handing a request back to the school. RESOLVED and CLOSED are deliberately
 * not reachable from here: they need an outcome, so they have their own calls.
 */
export async function changeStatus(
  context: ActorContext,
  id: string,
  input: StatusInput,
): Promise<RequestView> {
  assertPermission(context.actor, 'support.respond');

  if (input.status === SupportStatus.RESOLVED || input.status === SupportStatus.CLOSED) {
    throw badRequest(
      'Resolving or closing a request needs an outcome. Use the resolve or close action.',
    );
  }
  if (input.status === SupportStatus.ESCALATED) {
    throw badRequest('Escalation needs a target and a reason. Use the escalate action.');
  }

  const row = await loadForAction(context, id);
  assertMove(row, input.status);

  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data: { status: input.status },
    select: REQUEST_SELECT,
  });

  if (input.note) await noteOnRequest(row.id, context.actor.userId, input.note, false);

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `${row.reference} moved to ${input.status}`,
    reason: input.note ?? null,
    schoolId: row.schoolId,
    beforeData: { status: row.status },
    afterData: { status: input.status },
  });

  return toView(context, updated);
}

// ── Escalation ──────────────────────────────────────────────────────────────

/**
 * The escalation route is policy, not free choice, so the route text is
 * returned with the result — an agent escalating a security report should see
 * that it goes to the platform owner immediately, not discover it later.
 */
export async function escalateRequest(
  context: ActorContext,
  id: string,
  input: EscalateInput,
): Promise<RequestView & { route: string }> {
  assertPermission(context.actor, 'support.respond');
  const row = await loadForAction(context, id);
  assertMove(row, SupportStatus.ESCALATED);

  const policy = categoryPolicy(row.category);

  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data: {
      status: SupportStatus.ESCALATED,
      escalatedAt: new Date(),
      escalatedToId: input.escalateTo,
    },
    select: REQUEST_SELECT,
  });

  await noteOnRequest(
    row.id,
    context.actor.userId,
    `Escalated to ${input.escalateTo}. ${input.reason}`,
    true,
  );

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `${row.reference} escalated to ${input.escalateTo}`,
    reason: input.reason,
    schoolId: row.schoolId,
    beforeData: { status: row.status },
    afterData: { status: SupportStatus.ESCALATED, escalatedToId: input.escalateTo },
  });

  return { ...toView(context, updated), route: policy.escalationRoute };
}

// ── Resolution and closure ──────────────────────────────────────────────────

/**
 * Resolving requires a written note, and for the categories whose closure
 * criteria demand a written outcome it is published to the requester rather
 * than kept internal. `closeNow` is refused for those categories: a content
 * error or a privacy concern is closed when the school agrees it is fixed, not
 * when the agent says so.
 */
export async function resolveRequest(
  context: ActorContext,
  id: string,
  input: ResolveInput,
): Promise<RequestView> {
  assertPermission(context.actor, 'support.respond');
  const row = await loadForAction(context, id);
  assertMove(row, SupportStatus.RESOLVED);

  const policy = categoryPolicy(row.category);
  const now = new Date();

  if (input.closeNow && policy.requiresWrittenOutcome) {
    throw forbidden(
      `${policy.label} must be confirmed by the requester before closing. Closure criteria: ${policy.closureCriteria}`,
    );
  }

  const data: Prisma.SupportRequestUncheckedUpdateInput = {
    status: input.closeNow ? SupportStatus.CLOSED : SupportStatus.RESOLVED,
    resolutionNote: input.resolutionNote,
    resolvedAt: row.resolvedAt ?? now,
    defectReference: input.defectReference ?? row.defectReference,
    // A resolution is a response. Without this the first-response target could
    // read as breached on a request that was answered by being fixed.
    firstRespondedAt: row.firstRespondedAt ?? now,
    closedAt: input.closeNow ? now : null,
  };

  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data,
    select: REQUEST_SELECT,
  });

  await noteOnRequest(row.id, context.actor.userId, input.resolutionNote, false);

  recordAudit(context, {
    action: 'support.resolve',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `${row.reference} resolved`,
    reason: input.resolutionNote,
    schoolId: row.schoolId,
    beforeData: { status: row.status },
    afterData: { status: updated.status, defectReference: updated.defectReference },
  });

  return toView(context, updated);
}

/**
 * Closure. The requester may close their own request at any point — it is their
 * problem, and they are allowed to say it no longer matters. An agent may only
 * close something already resolved, which is what stops a queue being tidied by
 * closing work nobody did.
 */
export async function closeRequest(
  context: ActorContext,
  id: string,
  input: CloseInput,
): Promise<RequestView> {
  const row = await loadVisible(context, id);
  const isRequester = row.requesterId === context.actor.userId;
  const isResponder = context.actor.permissions.has('support.respond');

  if (!isRequester && !isResponder) throw forbidden('You cannot close this request.');
  if (row.status === SupportStatus.CLOSED) return toView(context, row);

  if (!isRequester && row.status !== SupportStatus.RESOLVED) {
    throw badRequest(
      'Record the resolution before closing, so the request shows what was done.',
    );
  }
  if (!row.resolutionNote && !input.note) {
    throw badRequest('Add a short note saying how this ended before closing it.');
  }

  const now = new Date();
  const updated = await prisma.supportRequest.update({
    where: { id: row.id },
    data: {
      status: SupportStatus.CLOSED,
      closedAt: now,
      resolvedAt: row.resolvedAt ?? now,
      resolutionNote: row.resolutionNote ?? input.note ?? null,
    },
    select: REQUEST_SELECT,
  });

  if (input.note) await noteOnRequest(row.id, context.actor.userId, input.note, false);

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `${row.reference} closed by ${isRequester ? 'the requester' : 'support'}`,
    reason: input.note ?? null,
    schoolId: row.schoolId,
    beforeData: { status: row.status },
    afterData: { status: SupportStatus.CLOSED },
  });

  return toView(context, updated);
}
