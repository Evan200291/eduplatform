// ─────────────────────────────────────────────────────────────────────────────
// Support requests: reads, creation and conversation (blueprint 13)
// The visibility rule is the whole point of this file. `support.read.own` means
// exactly the requests you raised; `support.read.all` means the queue. Those two
// answers are produced by one function, `visibilityFilter`, so a new endpoint
// cannot accidentally widen the first into the second.
//
// Agent workflow transitions (triage, assign, escalate, resolve, close) live in
// ./support.workflow.ts, which imports from here. The split keeps each file
// short enough to read in one sitting.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, SupportStatus } from '@prisma/client';
import { prisma } from '../../core/prisma';
import type { ActorContext } from '../../core/context';
import { assertPermission, hasPermission } from '../../core/rbac/authorize';
import { recordAudit } from '../../core/audit/audit.service';
import { badRequest, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake, toOrderBy } from '../../core/http/pagination';
import { breachState, categoryPolicy, effectivePriority, responseTargets } from './support.policy';
import type { BreachState, CategoryPolicy } from './support.policy';
import type {
  createSupportRequestSchema,
  satisfactionSchema,
  supportListQuery,
  supportMessageListQuery,
  supportMessageSchema,
} from './support.validation';
import type { z } from 'zod';

type CreateInput = z.infer<typeof createSupportRequestSchema>;
type ListQuery = z.infer<typeof supportListQuery>;
type MessageInput = z.infer<typeof supportMessageSchema>;
type MessageListQuery = z.infer<typeof supportMessageListQuery>;
type SatisfactionInput = z.infer<typeof satisfactionSchema>;

// ── Shapes ──────────────────────────────────────────────────────────────────

const PERSON_SELECT = { id: true, displayName: true } satisfies Prisma.UserSelect;

export const REQUEST_SELECT = {
  id: true,
  reference: true,
  schoolId: true,
  requesterId: true,
  requester: { select: PERSON_SELECT },
  assigneeId: true,
  assignee: { select: PERSON_SELECT },
  category: true,
  priority: true,
  status: true,
  subject: true,
  description: true,
  contextPath: true,
  contextData: true,
  firstResponseDueAt: true,
  resolutionDueAt: true,
  firstRespondedAt: true,
  resolvedAt: true,
  closedAt: true,
  resolutionNote: true,
  defectReference: true,
  escalatedAt: true,
  escalatedToId: true,
  satisfactionScore: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupportRequestSelect;

export type RequestRow = Prisma.SupportRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

export const MESSAGE_SELECT = {
  id: true,
  requestId: true,
  authorId: true,
  author: { select: PERSON_SELECT },
  body: true,
  isInternal: true,
  attachments: true,
  createdAt: true,
} satisfies Prisma.SupportMessageSelect;

export type MessageRow = Prisma.SupportMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

export interface RequestView {
  request: RequestRow;
  policy: CategoryPolicy;
  breach: BreachState;
  /** True when the viewer may act on the request rather than only read it. */
  canRespond: boolean;
}

// ── Visibility ──────────────────────────────────────────────────────────────

export function isAgent(context: ActorContext): boolean {
  return hasPermission(context.actor, 'support.read.all');
}

/**
 * The single source of truth for who sees which request. An agent sees the
 * queue for the tenants they are in; everyone else sees the requests they
 * raised, and nothing else — not even other requests from their own school,
 * because a parent's account problem is not their neighbour's business.
 */
export function visibilityFilter(context: ActorContext): Prisma.SupportRequestWhereInput {
  if (!isAgent(context)) {
    assertPermission(context.actor, 'support.read.own');
    return { requesterId: context.actor.userId };
  }
  if (context.actor.isPlatformStaff) {
    // Platform staff working inside a tenant see that tenant only.
    return context.tenant.schoolId ? { schoolId: context.tenant.schoolId } : {};
  }
  const schoolId = context.tenant.schoolId ?? context.actor.schoolId;
  if (!schoolId) return { requesterId: context.actor.userId };
  return { schoolId };
}

/** Loads a request the actor is allowed to see, or throws 404. */
export async function loadVisible(context: ActorContext, id: string): Promise<RequestRow> {
  const row = await prisma.supportRequest.findFirst({
    where: { AND: [{ id }, visibilityFilter(context)] },
    select: REQUEST_SELECT,
  });
  if (!row) throw notFound('That support request could not be found.');
  return row;
}

export function toView(context: ActorContext, request: RequestRow): RequestView {
  return {
    request,
    policy: categoryPolicy(request.category),
    breach: breachState(request),
    canRespond: hasPermission(context.actor, 'support.respond'),
  };
}

// ── Reference generation ────────────────────────────────────────────────────

const REFERENCE_PREFIX = 'MID-';

/**
 * A short human reference like "MID-1042". Derived from the row count so the
 * numbers stay small and readable, with a retry because two simultaneous
 * requests would otherwise pick the same one. The unique index is the real
 * guard; this loop just makes the collision invisible to the requester.
 */
async function nextReference(): Promise<string> {
  const base = 1000 + (await prisma.supportRequest.count());
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `${REFERENCE_PREFIX}${base + attempt}`;
    const taken = await prisma.supportRequest.findUnique({
      where: { reference: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Twelve consecutive collisions means heavy concurrency, not a bug. Fall back
  // to a wider space rather than failing a request someone needs help with.
  return `${REFERENCE_PREFIX}${base}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createRequest(
  context: ActorContext,
  input: CreateInput,
): Promise<RequestView> {
  assertPermission(context.actor, 'support.create');

  const priority = effectivePriority(input.category, input.priority);
  const targets = responseTargets(priority);
  const reference = await nextReference();

  const data: Prisma.SupportRequestUncheckedCreateInput = {
    reference,
    schoolId: context.tenant.schoolId ?? context.actor.schoolId ?? null,
    requesterId: context.actor.userId,
    category: input.category,
    priority,
    status: SupportStatus.NEW,
    subject: input.subject,
    description: input.description,
    contextPath: input.contextPath ?? null,
    contextData:
      input.contextData === undefined || input.contextData === null
        ? Prisma.DbNull
        : (input.contextData),
    firstResponseDueAt: targets.firstResponseDueAt,
    resolutionDueAt: targets.resolutionDueAt,
  };

  const row = await prisma.supportRequest.create({ data, select: REQUEST_SELECT });

  recordAudit(context, {
    action: 'support.create',
    targetType: 'SupportRequest',
    targetId: row.id,
    summary: `Raised ${row.reference}: ${row.subject}`,
    afterData: { category: row.category, priority: row.priority, reference: row.reference },
  });

  return toView(context, row);
}

// ── List and read ───────────────────────────────────────────────────────────

export async function listRequests(context: ActorContext, query: ListQuery) {
  const { skip, take } = toSkipTake(query);
  const filters: Prisma.SupportRequestWhereInput[] = [visibilityFilter(context)];

  if (query.status) filters.push({ status: query.status });
  if (query.category) filters.push({ category: query.category });
  if (query.priority) filters.push({ priority: query.priority });
  if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });
  if (query.requesterId) filters.push({ requesterId: query.requesterId });
  if (query.unassigned) filters.push({ assigneeId: null });
  if (query.openOnly) {
    filters.push({ status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] } });
  }
  if (query.breachedOnly) {
    // Still owed something and already past a target.
    filters.push({
      status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] },
      OR: [
        { firstRespondedAt: null, firstResponseDueAt: { lt: new Date() } },
        { resolutionDueAt: { lt: new Date() } },
      ],
    });
  }
  if (query.createdFrom) filters.push({ createdAt: { gte: query.createdFrom } });
  if (query.createdTo) filters.push({ createdAt: { lte: query.createdTo } });
  if (query.search) {
    filters.push({
      OR: [
        { reference: { contains: query.search } },
        { subject: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    });
  }
  // Only an agent may narrow to another school, and only within their tenant.
  if (query.schoolId && isAgent(context)) filters.push({ schoolId: query.schoolId });

  const where: Prisma.SupportRequestWhereInput = { AND: filters };

  const [items, totalItems] = await Promise.all([
    prisma.supportRequest.findMany({
      where,
      select: REQUEST_SELECT,
      orderBy: toOrderBy(query.sort, query.order),
      skip,
      take,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  return { items: items.map((row) => toView(context, row)), totalItems };
}

export async function getRequest(context: ActorContext, id: string): Promise<RequestView> {
  return toView(context, await loadVisible(context, id));
}

/** Queue counters for the support dashboard, scoped exactly like the list. */
export async function requestSummary(context: ActorContext) {
  const scope = visibilityFilter(context);
  const now = new Date();

  const [byStatus, byPriority, unassigned, breached] = await Promise.all([
    prisma.supportRequest.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    prisma.supportRequest.groupBy({
      by: ['priority'],
      where: { AND: [scope, { status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] } }] },
      _count: { _all: true },
    }),
    prisma.supportRequest.count({
      where: {
        AND: [scope, { assigneeId: null, status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] } }],
      },
    }),
    prisma.supportRequest.count({
      where: {
        AND: [
          scope,
          { status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] } },
          {
            OR: [
              { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
              { resolutionDueAt: { lt: now } },
            ],
          },
        ],
      },
    }),
  ]);

  return {
    byStatus: byStatus.map((entry) => ({ status: entry.status, count: entry._count._all })),
    byPriority: byPriority.map((entry) => ({ priority: entry.priority, count: entry._count._all })),
    unassigned,
    breachingTargets: breached,
  };
}

// ── Conversation ────────────────────────────────────────────────────────────

export async function listMessages(context: ActorContext, id: string, query: MessageListQuery) {
  const request = await loadVisible(context, id);
  const canSeeInternal = hasPermission(context.actor, 'support.respond');
  const { skip, take } = toSkipTake(query);

  const where: Prisma.SupportMessageWhereInput = {
    requestId: request.id,
    // A requester never sees an internal note, whatever they ask for.
    ...(canSeeInternal && query.includeInternal !== false ? {} : { isInternal: false }),
  };

  const [items, totalItems] = await Promise.all([
    prisma.supportMessage.findMany({
      where,
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
    prisma.supportMessage.count({ where }),
  ]);

  return { items, totalItems };
}

/**
 * Adds a message. Two side effects matter: the first agent reply stamps
 * `firstRespondedAt`, which is what makes the response target measurable; and a
 * requester replying to a request that was waiting on them moves it back into
 * the queue, so their answer is not left sitting unread.
 */
export async function addMessage(
  context: ActorContext,
  id: string,
  input: MessageInput,
): Promise<MessageRow> {
  const request = await loadVisible(context, id);
  const isResponder = hasPermission(context.actor, 'support.respond');
  const isRequester = request.requesterId === context.actor.userId;

  if (!isResponder && !isRequester) {
    throw forbidden('Only the requester or a support agent can add to this conversation.');
  }
  if (request.status === SupportStatus.CLOSED) {
    throw badRequest('This request is closed. Raise a new one and reference ' + request.reference);
  }
  if (input.isInternal && !isResponder) {
    throw forbidden('Only a support agent can add an internal note.');
  }

  const isInternal = input.isInternal === true;

  const message = await prisma.supportMessage.create({
    data: {
      requestId: request.id,
      authorId: context.actor.userId,
      body: input.body,
      isInternal,
      attachments:
        input.attachments === undefined
          ? Prisma.DbNull
          : (input.attachments as unknown as Prisma.InputJsonValue),
    },
    select: MESSAGE_SELECT,
  });

  const changes: Prisma.SupportRequestUncheckedUpdateInput = {};
  if (isResponder && !isInternal && !isRequester && !request.firstRespondedAt) {
    changes.firstRespondedAt = message.createdAt;
  }
  if (isRequester && request.status === SupportStatus.WAITING_ON_CUSTOMER) {
    changes.status = SupportStatus.IN_PROGRESS;
  }
  if (Object.keys(changes).length > 0) {
    await prisma.supportRequest.update({ where: { id: request.id }, data: changes });
  }

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: request.id,
    summary: isInternal
      ? `Internal note added to ${request.reference}`
      : `Reply added to ${request.reference}`,
    schoolId: request.schoolId,
  });

  return message;
}

// ── Satisfaction ────────────────────────────────────────────────────────────

/**
 * Blueprint 13 asks whether the help actually helped. Only the requester may
 * answer, and only once a resolution exists — a score on an unanswered request
 * would measure the wrong thing.
 */
export async function recordSatisfaction(
  context: ActorContext,
  id: string,
  input: SatisfactionInput,
): Promise<RequestView> {
  const request = await loadVisible(context, id);
  if (request.requesterId !== context.actor.userId) {
    throw forbidden('Only the person who raised the request can rate it.');
  }
  if (request.status !== SupportStatus.RESOLVED && request.status !== SupportStatus.CLOSED) {
    throw badRequest('You can rate the help once the request has been resolved.');
  }

  const row = await prisma.supportRequest.update({
    where: { id: request.id },
    data: { satisfactionScore: input.score },
    select: REQUEST_SELECT,
  });

  if (input.comment) {
    await prisma.supportMessage.create({
      data: {
        requestId: request.id,
        authorId: context.actor.userId,
        body: `Satisfaction ${input.score}/5: ${input.comment}`,
        isInternal: false,
      },
    });
  }

  recordAudit(context, {
    action: 'support.update',
    targetType: 'SupportRequest',
    targetId: request.id,
    summary: `${request.reference} rated ${input.score}/5`,
    schoolId: request.schoolId,
  });

  return toView(context, row);
}
