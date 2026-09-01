// ─────────────────────────────────────────────────────────────────────────────
// Subscription lifecycle arithmetic (blueprint 09)
// Separated from `subscription.service.ts` on purpose: none of this touches the
// database, so it can be unit-tested directly, and the policy decisions live in
// one small readable place instead of being buried in query code.
//
// The policy that matters most: a PAST_DUE subscription still entitles features.
// Blueprint 09 treats collections as a commercial conversation, and a class of
// eleven-year-olds losing their lessons over an unpaid invoice is not one.
// ─────────────────────────────────────────────────────────────────────────────

import { SubscriptionStatus } from '@prisma/client';

export const DAY_MS = 86_400_000;

/** Statuses that keep the plan gate open. */
export const OPEN_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export function isOpenStatus(status: SubscriptionStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** The minimum a term needs for its state to be derived. */
export interface SubscriptionTerm {
  status: SubscriptionStatus;
  endsAt: Date | null;
  trialEndsAt: Date | null;
}

export interface SubscriptionState {
  /** True when the plan gate is open, past-due included. */
  entitlesFeatures: boolean;
  inTrial: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  hasExpired: boolean;
  /** Null when the agreement has no end date. */
  daysRemaining: number | null;
  trialDaysRemaining: number | null;
  /** A sentence for the admin panel when something needs a human decision. */
  needsAttention: string | null;
}

/** Whole days, rounded up, so "ends today" reads as 1 rather than 0. */
export function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

export function subscriptionState(term: SubscriptionTerm, now = new Date()): SubscriptionState {
  const termPassed = !!term.endsAt && term.endsAt <= now;
  const trialPassed = !!term.trialEndsAt && term.trialEndsAt <= now;
  const open = isOpenStatus(term.status);

  let needsAttention: string | null = null;
  if (termPassed && open) {
    needsAttention = 'The contract end date has passed but the subscription is still open.';
  } else if (term.status === SubscriptionStatus.TRIALING && trialPassed) {
    needsAttention = 'The trial period has ended. Convert, extend or close it.';
  } else if (term.status === SubscriptionStatus.PAST_DUE) {
    needsAttention = 'Payment is overdue. Learners still have access by policy.';
  }

  return {
    entitlesFeatures: open,
    inTrial: term.status === SubscriptionStatus.TRIALING && !trialPassed,
    isPastDue: term.status === SubscriptionStatus.PAST_DUE,
    isCancelled: term.status === SubscriptionStatus.CANCELLED,
    hasExpired: term.status === SubscriptionStatus.EXPIRED,
    daysRemaining: term.endsAt ? daysBetween(now, term.endsAt) : null,
    trialDaysRemaining: term.trialEndsAt ? daysBetween(now, term.trialEndsAt) : null,
    needsAttention,
  };
}

// ── Seats ───────────────────────────────────────────────────────────────────

export interface SeatCounts {
  licensedStudentSeats: number;
  studentsUsed: number;
  licensedTeacherSeats: number;
  teachersUsed: number;
}

export interface SeatUsage {
  studentsLicensed: number;
  studentsUsed: number;
  /** Null when the seat count is 0, which means "not metered". */
  studentsRemaining: number | null;
  teachersLicensed: number;
  teachersUsed: number;
  teachersRemaining: number | null;
  overStudentSeats: boolean;
  overTeacherSeats: boolean;
}

/**
 * Zero licensed seats means unmetered, not "nobody may sign in". An unmetered
 * pilot is a real arrangement and must never lock a school out of its own data.
 */
export function computeSeatUsage(counts: SeatCounts): SeatUsage {
  const metredStudents = counts.licensedStudentSeats > 0;
  const metredTeachers = counts.licensedTeacherSeats > 0;

  return {
    studentsLicensed: counts.licensedStudentSeats,
    studentsUsed: counts.studentsUsed,
    studentsRemaining: metredStudents ? counts.licensedStudentSeats - counts.studentsUsed : null,
    teachersLicensed: counts.licensedTeacherSeats,
    teachersUsed: counts.teachersUsed,
    teachersRemaining: metredTeachers ? counts.licensedTeacherSeats - counts.teachersUsed : null,
    overStudentSeats: metredStudents && counts.studentsUsed > counts.licensedStudentSeats,
    overTeacherSeats: metredTeachers && counts.teachersUsed > counts.licensedTeacherSeats,
  };
}

/** True when adding `additional` people would exceed a metered seat count. */
export function wouldExceedSeats(licensed: number, used: number, additional: number): boolean {
  if (licensed <= 0) return false;
  return used + additional > licensed;
}
