import type { ListQuery } from '@/api/types';
import type { FeatureCategory } from '@/entitlements/entitlements.types';

/** Mirrors `backend/src/modules/subscription` — plans, subscriptions, seats. */

export type SubscriptionPlan = 'PILOT' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type BillingInterval = 'MONTHLY' | 'ANNUAL' | 'CUSTOM';

export interface PlanFeatureSummary {
  key: string;
  name: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
}

export interface PlanEntry {
  plan: SubscriptionPlan;
  name: string;
  intendedCustomer: string;
  illustrativeScope: string;
  supportLevel: string;
  defaultInterval: BillingInterval;
  requiresEndDate: boolean;
  suggestedStudentSeats: number | null;
  multiSchool: boolean;
  perStudentPricing: boolean;
  notes: string;
}

export interface PlanPackaging extends PlanEntry {
  rank: number;
  includedFeatures: PlanFeatureSummary[];
  gatedFeatures: PlanFeatureSummary[];
}

export interface SubscriptionRow {
  id: string;
  organizationId: string | null;
  schoolId: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  interval: BillingInterval;
  licensedStudentSeats: number;
  licensedTeacherSeats: number;
  pricePerStudentMinor: number | null;
  pricePerTeacherMinor: number | null;
  currency: string;
  startsAt: string;
  endsAt: string | null;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelledAt: string | null;
  autoRenew: boolean;
  purchaseOrderRef: string | null;
  invoiceEmail: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors `backend/src/modules/subscription/subscription.lifecycle.ts`
 * (`subscriptionState()`) — derived lifecycle flags, not a status string.
 */
export interface SubscriptionState {
  /** True when the plan gate is open — past-due included, by policy (blueprint 09). */
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

export interface SubscriptionDetail {
  subscription: SubscriptionRow;
  state: SubscriptionState;
  plan: PlanEntry;
  gatedFeatures: PlanFeatureSummary[];
  seats: SeatUsage | null;
}

/** `GET /subscriptions/current` — no subscription is a legitimate state. */
export interface CurrentSubscription {
  subscription: SubscriptionRow | null;
  state: SubscriptionState | null;
  plan: PlanEntry | null;
  gatedFeatures: PlanFeatureSummary[];
  seats: SeatUsage | null;
}

export interface SubscriptionListQuery extends ListQuery {
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  organizationId?: string;
  schoolId?: string;
  expiringWithinDays?: number;
}
