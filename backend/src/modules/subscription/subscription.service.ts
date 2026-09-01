// ─────────────────────────────────────────────────────────────────────────────
// Subscription lifecycle (blueprint 09)
// A subscription is a commercial record, and it is also the plan gate the
// feature resolver reads. That gives this module one obligation the rest of the
// codebase depends on: any write that could change the plan or its status must
// call `invalidateFeatureCache`, or a school keeps seeing a feature it no longer
// pays for (or worse, loses one it just bought) for the next thirty seconds.
//
// Blueprint 09 is also explicit that collections are a conversation, not a
// switch: a PAST_DUE subscription keeps working. Only CANCELLED and EXPIRED
// close the gate, which is why `syncSubscriptionStatuses` never invents either
// state early.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { RoleKey, SubscriptionStatus, UserStatus } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { recordAudit, diffRecords } from '../../core/audit/audit.service';
import { invalidateFeatureCache, isFeatureEnabled } from '../../core/features/feature.service';
import { badRequest, conflict, forbidden, notFound, preconditionFailed } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import {
  computeSeatUsage,
  DAY_MS,
  OPEN_STATUSES,
  subscriptionState,
  wouldExceedSeats,
  type SeatUsage,
  type SubscriptionState,
} from './subscription.lifecycle';
import { planEntry, type PlanEntry, type PlanFeatureSummary, planPackaging } from './subscription.plans';
import type {
  cancelSubscriptionSchema,
  createSubscriptionSchema,
  renewSubscriptionSchema,
  subscriptionListQuery,
  updateSubscriptionSchema,
} from './subscription.validation';
import type { z } from 'zod';

const log = logger.child({ module: 'subscription' });

type CreateInput = z.infer<typeof createSubscriptionSchema>;
type UpdateInput = z.infer<typeof updateSubscriptionSchema>;
type CancelInput = z.infer<typeof cancelSubscriptionSchema>;
type RenewInput = z.infer<typeof renewSubscriptionSchema>;
type ListQuery = z.infer<typeof subscriptionListQuery>;

export const SUBSCRIPTION_SELECT = {
  id: true,
  organizationId: true,
  schoolId: true,
  plan: true,
  status: true,
  interval: true,
  licensedStudentSeats: true,
  licensedTeacherSeats: true,
  pricePerStudentMinor: true,
  pricePerTeacherMinor: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  trialEndsAt: true,
  renewsAt: true,
  cancelledAt: true,
  autoRenew: true,
  purchaseOrderRef: true,
  invoiceEmail: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
} satisfies Prisma.SubscriptionSelect;

export type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof SUBSCRIPTION_SELECT }>;

/** The gate is open for anything except a cancelled or expired agreement. */
export { OPEN_STATUSES, subscriptionState } from './subscription.lifecycle';
export type { SeatUsage, SubscriptionState } from './subscription.lifecycle';

// ── Seats ───────────────────────────────────────────────────────────────────

/** Seats count people who can sign in: invited and active, never archived. */
const OCCUPYING_STATUSES: UserStatus[] = [UserStatus.INVITED, UserStatus.ACTIVE, UserStatus.SUSPENDED];

export async function seatUsage(
  schoolId: string,
  licensedStudentSeats: number,
  licensedTeacherSeats: number,
): Promise<SeatUsage> {
  const [studentsUsed, teachersUsed] = await Promise.all([
    prisma.user.count({
      where: { schoolId, primaryRole: RoleKey.STUDENT, status: { in: OCCUPYING_STATUSES } },
    }),
    prisma.user.count({
      where: { schoolId, primaryRole: RoleKey.TEACHER, status: { in: OCCUPYING_STATUSES } },
    }),
  ]);

  return computeSeatUsage({ licensedStudentSeats, studentsUsed, licensedTeacherSeats, teachersUsed });
}

/**
 * Called before creating a user. Enforcement is itself a feature
 * (`commercial.seatEnforcement`), so a school mid-negotiation can be allowed
 * over its seat count deliberately rather than by someone editing a number.
 */
export async function assertSeatAvailable(
  schoolId: string,
  kind: 'student' | 'teacher',
  additional = 1,
): Promise<void> {
  const subscription = await findSchoolSubscription(schoolId);
  if (!subscription) return;

  const enforced = await isFeatureEnabled('commercial.seatEnforcement', {
    organizationId: subscription.organizationId,
    schoolId,
  });
  if (!enforced) return;

  const usage = await seatUsage(
    schoolId,
    subscription.licensedStudentSeats,
    subscription.licensedTeacherSeats,
  );

  const licensed = kind === 'student' ? usage.studentsLicensed : usage.teachersLicensed;
  const used = kind === 'student' ? usage.studentsUsed : usage.teachersUsed;

  if (wouldExceedSeats(licensed, used, additional)) {
    throw preconditionFailed(
      `This school has ${licensed} licensed ${kind} seats and ${used} in use. Add seats to the subscription before creating more.`,
      { details: { licensed, used, kind } },
    );
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface SubscriptionDetail {
  subscription: SubscriptionRow;
  state: SubscriptionState;
  plan: PlanEntry;
  /** Features the current plan does not include — the upgrade conversation. */
  gatedFeatures: PlanFeatureSummary[];
  seats: SeatUsage | null;
}

async function buildDetail(row: SubscriptionRow): Promise<SubscriptionDetail> {
  const packaging = planPackaging(row.plan);
  return {
    subscription: row,
    state: subscriptionState(row),
    plan: planEntry(row.plan),
    gatedFeatures: packaging.gatedFeatures,
    // Seats are a school-level idea. An organization agreement is counted per
    // school, so it reports no single number here.
    seats: row.schoolId
      ? await seatUsage(row.schoolId, row.licensedStudentSeats, row.licensedTeacherSeats)
      : null,
  };
}

/** The subscription that governs a school: its own first, then its organization's. */
export async function findSchoolSubscription(schoolId: string): Promise<SubscriptionRow | null> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { organizationId: true },
  });
  if (!school) throw notFound('School');

  return prisma.subscription.findFirst({
    where: {
      OR: [{ schoolId }, { organizationId: school.organizationId }],
      status: { in: OPEN_STATUSES },
    },
    orderBy: [{ schoolId: 'desc' }, { startsAt: 'desc' }],
    select: SUBSCRIPTION_SELECT,
  });
}

export async function listSubscriptions(
  context: ActorContext,
  query: ListQuery,
): Promise<{ items: SubscriptionDetail[]; totalItems: number }> {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.SubscriptionWhereInput = {
    ...(query.plan ? { plan: query.plan } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.expiringWithinDays
      ? {
          endsAt: {
            gte: new Date(),
            lte: new Date(Date.now() + query.expiringWithinDays * DAY_MS),
          },
        }
      : {}),
    ...(query.search ? { purchaseOrderRef: { contains: query.search } } : {}),
  };

  if (context.actor.isPlatformStaff) {
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.schoolId) where.schoolId = query.schoolId;
  } else {
    // A scoped actor sees their own agreements whatever they asked for.
    where.OR = [
      { schoolId: context.actor.schoolId ?? '__none__' },
      { organizationId: context.actor.organizationId ?? '__none__' },
    ];
  }

  const [rows, totalItems] = await Promise.all([
    prisma.subscription.findMany({
      where,
      skip,
      take,
      orderBy: [{ startsAt: 'desc' }],
      select: SUBSCRIPTION_SELECT,
    }),
    prisma.subscription.count({ where }),
  ]);

  const items = await Promise.all(rows.map(buildDetail));
  return { items, totalItems };
}

function assertVisible(context: ActorContext, row: SubscriptionRow): void {
  if (context.actor.isPlatformStaff) return;
  const ownSchool = !!row.schoolId && row.schoolId === context.actor.schoolId;
  const ownOrganization =
    !!row.organizationId && row.organizationId === context.actor.organizationId;
  if (!ownSchool && !ownOrganization) throw notFound('Subscription');
}

export async function getSubscription(context: ActorContext, id: string): Promise<SubscriptionDetail> {
  const row = await prisma.subscription.findUnique({ where: { id }, select: SUBSCRIPTION_SELECT });
  if (!row) throw notFound('Subscription');
  assertVisible(context, row);
  return buildDetail(row);
}

/** What the admin panel header needs: the agreement in force, or nothing. */
export async function currentSubscription(
  context: ActorContext,
  schoolId: string,
): Promise<SubscriptionDetail | null> {
  if (!context.actor.isPlatformStaff && schoolId !== context.actor.schoolId) {
    throw forbidden('You can only read your own school subscription.');
  }
  const row = await findSchoolSubscription(schoolId);
  return row ? buildDetail(row) : null;
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Non-platform billing admins may only write against their own tenant. */
function assertWritableTarget(
  context: ActorContext,
  target: { organizationId?: string | null; schoolId?: string | null },
): void {
  if (context.actor.isPlatformStaff) return;
  const ownSchool = !!target.schoolId && target.schoolId === context.actor.schoolId;
  const ownOrganization =
    !!target.organizationId && target.organizationId === context.actor.organizationId;
  if (!ownSchool && !ownOrganization) {
    throw forbidden('You can only manage a subscription for your own school or organization.');
  }
}

async function resolveOrganizationId(input: CreateInput): Promise<string | null> {
  if (input.organizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!organization) throw notFound('Organization');
    return organization.id;
  }
  if (!input.schoolId) return null;
  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { organizationId: true },
  });
  if (!school) throw notFound('School');
  // Denormalised deliberately: the resolver's plan lookup filters on both, so a
  // school agreement that knows its organization answers either query.
  return school.organizationId;
}

/** Cache keys are per organization and per school; a plan change touches both. */
function invalidateFor(row: { organizationId: string | null; schoolId: string | null }): void {
  invalidateFeatureCache(row.organizationId, row.schoolId);
}

export async function createSubscription(
  context: ActorContext,
  input: CreateInput,
): Promise<SubscriptionDetail> {
  assertWritableTarget(context, input);

  const entry = planEntry(input.plan);
  if (entry.requiresEndDate && !input.endsAt) {
    // Blueprint 09: free or discounted access must have a defined duration.
    throw badRequest(`A ${entry.name} agreement must have an end date.`);
  }

  const organizationId = await resolveOrganizationId(input);

  if (input.schoolId) {
    const existing = await prisma.subscription.findFirst({
      where: { schoolId: input.schoolId, status: { in: OPEN_STATUSES } },
      select: { id: true, plan: true },
    });
    if (existing) {
      throw conflict(
        `This school already has an open ${existing.plan} subscription. Cancel or renew it instead of adding a second one.`,
      );
    }
  }

  const data: Prisma.SubscriptionUncheckedCreateInput = {
    organizationId,
    schoolId: input.schoolId ?? null,
    plan: input.plan,
    status: input.status ?? SubscriptionStatus.TRIALING,
    interval: input.interval ?? entry.defaultInterval,
    licensedStudentSeats: input.licensedStudentSeats ?? 0,
    licensedTeacherSeats: input.licensedTeacherSeats ?? 0,
    pricePerStudentMinor: input.pricePerStudentMinor ?? null,
    pricePerTeacherMinor: input.pricePerTeacherMinor ?? null,
    currency: input.currency ?? 'GBP',
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    trialEndsAt: input.trialEndsAt ?? null,
    renewsAt: input.renewsAt ?? null,
    autoRenew: input.autoRenew ?? true,
    purchaseOrderRef: input.purchaseOrderRef ?? null,
    invoiceEmail: input.invoiceEmail ?? null,
    notes: input.notes ?? null,
    createdById: context.actor.userId,
  };

  const row = await prisma.subscription.create({ data, select: SUBSCRIPTION_SELECT });
  invalidateFor(row);

  recordAudit(context, {
    action: 'subscription.create',
    targetType: 'Subscription',
    targetId: row.id,
    summary: `${row.plan} subscription created`,
    afterData: row,
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });

  return buildDetail(row);
}

export async function updateSubscription(
  context: ActorContext,
  id: string,
  input: UpdateInput,
): Promise<SubscriptionDetail> {
  const before = await prisma.subscription.findUnique({ where: { id }, select: SUBSCRIPTION_SELECT });
  if (!before) throw notFound('Subscription');
  assertWritableTarget(context, before);

  if (before.status === SubscriptionStatus.CANCELLED || before.status === SubscriptionStatus.EXPIRED) {
    throw preconditionFailed(
      'This agreement is closed. Create a new subscription rather than reopening a cancelled one, so the commercial history stays readable.',
    );
  }

  const plan = input.plan ?? before.plan;
  const endsAt = input.endsAt === undefined ? before.endsAt : input.endsAt;
  if (planEntry(plan).requiresEndDate && !endsAt) {
    throw badRequest(`A ${planEntry(plan).name} agreement must have an end date.`);
  }

  const startsAt = input.startsAt ?? before.startsAt;
  if (endsAt && endsAt <= startsAt) throw badRequest('The contract must end after it starts.');

  const data: Prisma.SubscriptionUncheckedUpdateInput = stripUndefined({
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    licensedStudentSeats: input.licensedStudentSeats,
    licensedTeacherSeats: input.licensedTeacherSeats,
    pricePerStudentMinor: input.pricePerStudentMinor,
    pricePerTeacherMinor: input.pricePerTeacherMinor,
    currency: input.currency,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    trialEndsAt: input.trialEndsAt,
    renewsAt: input.renewsAt,
    autoRenew: input.autoRenew,
    purchaseOrderRef: input.purchaseOrderRef,
    invoiceEmail: input.invoiceEmail,
    notes: input.notes,
  });

  const row = await prisma.subscription.update({ where: { id }, data, select: SUBSCRIPTION_SELECT });
  invalidateFor(row);

  const diff = diffRecords(before, row);
  recordAudit(context, {
    action: 'subscription.update',
    targetType: 'Subscription',
    targetId: row.id,
    summary: `${row.plan} subscription updated`,
    afterData: diff,
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });

  return buildDetail(row);
}

/**
 * Cancellation is deliberately two-speed. The default ends the agreement at the
 * term end, which is what a school expects after paying for a year. `immediate`
 * closes the plan gate now, and blueprint 09 wants a written reason either way.
 */
export async function cancelSubscription(
  context: ActorContext,
  id: string,
  input: CancelInput,
): Promise<SubscriptionDetail> {
  const before = await prisma.subscription.findUnique({ where: { id }, select: SUBSCRIPTION_SELECT });
  if (!before) throw notFound('Subscription');
  assertWritableTarget(context, before);

  if (before.status === SubscriptionStatus.CANCELLED) {
    throw conflict('This subscription is already cancelled.');
  }

  const now = new Date();
  const effectiveAt = input.immediate ? now : (input.effectiveAt ?? before.endsAt ?? now);

  const row = await prisma.subscription.update({
    where: { id },
    data: {
      status: input.immediate ? SubscriptionStatus.CANCELLED : before.status,
      cancelledAt: now,
      // Auto-renew must go, or a renewal job resurrects a cancelled agreement.
      autoRenew: false,
      endsAt: effectiveAt,
      notes: input.reason.slice(0, 2000),
    },
    select: SUBSCRIPTION_SELECT,
  });
  invalidateFor(row);

  recordAudit(context, {
    action: 'subscription.cancel',
    targetType: 'Subscription',
    targetId: row.id,
    summary: input.immediate
      ? `${row.plan} subscription cancelled immediately`
      : `${row.plan} subscription set to end on ${effectiveAt.toISOString().slice(0, 10)}`,
    reason: input.reason,
    afterData: diffRecords(before, row),
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });

  return buildDetail(row);
}

/** Extends the term in place. The commercial history stays on the audit trail. */
export async function renewSubscription(
  context: ActorContext,
  id: string,
  input: RenewInput,
): Promise<SubscriptionDetail> {
  const before = await prisma.subscription.findUnique({ where: { id }, select: SUBSCRIPTION_SELECT });
  if (!before) throw notFound('Subscription');
  assertWritableTarget(context, before);

  if (before.status === SubscriptionStatus.CANCELLED) {
    throw preconditionFailed(
      'A cancelled agreement cannot be renewed. Create a new subscription so the cancellation stays on record.',
    );
  }
  if (input.endsAt <= new Date()) {
    throw badRequest('A renewal must end in the future.');
  }

  const data: Prisma.SubscriptionUncheckedUpdateInput = stripUndefined({
    plan: input.plan,
    interval: input.interval,
    licensedStudentSeats: input.licensedStudentSeats,
    licensedTeacherSeats: input.licensedTeacherSeats,
    pricePerStudentMinor: input.pricePerStudentMinor,
    pricePerTeacherMinor: input.pricePerTeacherMinor,
    renewsAt: input.renewsAt,
  });

  const row = await prisma.subscription.update({
    where: { id },
    data: {
      ...data,
      endsAt: input.endsAt,
      // A renewal is the moment a trial becomes a paying customer.
      status: SubscriptionStatus.ACTIVE,
      cancelledAt: null,
      autoRenew: true,
    },
    select: SUBSCRIPTION_SELECT,
  });
  invalidateFor(row);

  recordAudit(context, {
    action: 'subscription.update',
    targetType: 'Subscription',
    targetId: row.id,
    summary: `${row.plan} subscription renewed to ${input.endsAt.toISOString().slice(0, 10)}`,
    reason: input.changeSummary ?? null,
    afterData: diffRecords(before, row),
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });

  return buildDetail(row);
}

// ── Scheduled maintenance ───────────────────────────────────────────────────

export interface StatusSweepResult {
  trialsEnded: number;
  termsExpired: number;
}

/**
 * Moves agreements whose dates have passed into the state they already are in
 * commercially. Run from the job scheduler; safe to run repeatedly.
 *
 * Note what it does *not* do: it never invents PAST_DUE, because whether an
 * invoice is unpaid is not something this system knows.
 */
export async function syncSubscriptionStatuses(now = new Date()): Promise<StatusSweepResult> {
  const [endedTrials, expiredTerms] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.TRIALING, trialEndsAt: { lte: now } },
      select: { id: true, organizationId: true, schoolId: true, endsAt: true },
    }),
    prisma.subscription.findMany({
      where: { status: { in: OPEN_STATUSES }, endsAt: { lte: now } },
      select: { id: true, organizationId: true, schoolId: true, autoRenew: true },
    }),
  ]);

  // A trial whose term is still open simply becomes active; one that has run out
  // of term is handled by the expiry pass below.
  const toActivate = endedTrials.filter((row) => !row.endsAt || row.endsAt > now);

  if (toActivate.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: toActivate.map((row) => row.id) } },
      data: { status: SubscriptionStatus.ACTIVE },
    });
  }

  if (expiredTerms.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: expiredTerms.map((row) => row.id) } },
      data: { status: SubscriptionStatus.EXPIRED },
    });
  }

  for (const row of [...toActivate, ...expiredTerms]) invalidateFor(row);

  if (toActivate.length > 0 || expiredTerms.length > 0) {
    log.info(
      { trialsEnded: toActivate.length, termsExpired: expiredTerms.length },
      'subscription status sweep',
    );
  }

  return { trialsEnded: toActivate.length, termsExpired: expiredTerms.length };
}

/** Prisma treats an explicit `undefined` as "no change", but only if absent. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  const output: Partial<T> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) output[key as keyof T] = item as T[keyof T];
  }
  return output;
}

