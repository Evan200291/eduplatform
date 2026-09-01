// ─────────────────────────────────────────────────────────────────────────────
// Plan packaging catalogue (blueprint 09)
// The blueprint says plainly: "Final plan names, prices, limits, and
// entitlements are TBD." So this file carries the four recommended packages and
// the shape of each — intended customer, illustrative scope, support level — and
// nothing that pretends to be a price list. Money lives on the Subscription row,
// agreed per contract, in minor units.
//
// What a plan *includes* is not written here twice: it is derived from
// `FEATURE_SPECS[].includedInPlans`, the same list `core/features` gates on. A
// feature therefore cannot appear on a sales page and be missing from the
// product, or be quietly sold on a plan the resolver refuses.
// ─────────────────────────────────────────────────────────────────────────────

import { BillingInterval, SubscriptionPlan } from '@prisma/client';
import { FEATURE_SPECS, type FeatureSpec } from '../../core/features/feature-keys';

/** Upgrade ordering. Used to answer "what would we gain by moving up?". */
export const PLAN_RANK: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.PILOT]: 10,
  [SubscriptionPlan.STARTER]: 20,
  [SubscriptionPlan.PROFESSIONAL]: 30,
  [SubscriptionPlan.ENTERPRISE]: 40,
};

export const PLAN_ORDER: readonly SubscriptionPlan[] = [
  SubscriptionPlan.PILOT,
  SubscriptionPlan.STARTER,
  SubscriptionPlan.PROFESSIONAL,
  SubscriptionPlan.ENTERPRISE,
];

export interface PlanEntry {
  plan: SubscriptionPlan;
  name: string;
  intendedCustomer: string;
  illustrativeScope: string;
  supportLevel: string;
  defaultInterval: BillingInterval;
  /** Blueprint 09: "Free or discounted access must have a defined duration." */
  requiresEndDate: boolean;
  /** Guidance for the sales conversation, not a limit this code enforces. */
  suggestedStudentSeats: number | null;
  /** Whether the package is sold across more than one school. */
  multiSchool: boolean;
  /** Whether a per-student component is the expected commercial shape. */
  perStudentPricing: boolean;
  notes: string;
}

const ENTRIES: Record<SubscriptionPlan, PlanEntry> = {
  [SubscriptionPlan.PILOT]: {
    plan: SubscriptionPlan.PILOT,
    name: 'Pilot',
    intendedCustomer: 'First validation partner',
    illustrativeScope: 'Limited students, one subject, guided support, fixed duration',
    supportLevel: 'Guided — named contact, scheduled check-ins',
    defaultInterval: BillingInterval.CUSTOM,
    requiresEndDate: true,
    suggestedStudentSeats: 120,
    multiSchool: false,
    perStudentPricing: false,
    notes:
      "A pilot ends on an agreed date. The end date is required so nobody discovers a free tenant running two years later.",
  },
  [SubscriptionPlan.STARTER]: {
    plan: SubscriptionPlan.STARTER,
    name: 'Starter',
    intendedCustomer: 'Small school or limited rollout',
    illustrativeScope: 'Core learning, teacher portal, basic branding, standard support',
    supportLevel: 'Standard — in-app requests, business hours',
    defaultInterval: BillingInterval.ANNUAL,
    requiresEndDate: false,
    suggestedStudentSeats: 400,
    multiSchool: false,
    perStudentPricing: true,
    notes:
      'Branding is included at the colour and logo level; token-level theme editing is not.',
  },
  [SubscriptionPlan.PROFESSIONAL]: {
    plan: SubscriptionPlan.PROFESSIONAL,
    name: 'Professional',
    intendedCustomer: 'Growing school',
    illustrativeScope: 'More students, richer reporting, configuration and content options',
    supportLevel: 'Priority — in-app requests with a response target',
    defaultInterval: BillingInterval.ANNUAL,
    requiresEndDate: false,
    suggestedStudentSeats: 1500,
    multiSchool: false,
    perStudentPricing: true,
    notes: 'The first plan where the school authors its own content and custom reports.',
  },
  [SubscriptionPlan.ENTERPRISE]: {
    plan: SubscriptionPlan.ENTERPRISE,
    name: 'Enterprise',
    intendedCustomer: 'School group or strategic partner',
    illustrativeScope: 'Multiple schools, advanced controls, integrations, service commitments',
    supportLevel: 'Contracted — service commitments agreed in writing',
    defaultInterval: BillingInterval.ANNUAL,
    requiresEndDate: false,
    suggestedStudentSeats: null,
    multiSchool: true,
    perStudentPricing: true,
    notes:
      'Sold at organization level so several schools share one agreement and one entitlement baseline.',
  },
};

export function planEntry(plan: SubscriptionPlan): PlanEntry {
  return ENTRIES[plan];
}

export interface PlanFeatureSummary {
  key: string;
  name: string;
  description: string;
  category: FeatureSpec['category'];
  /** Included in the plan is not the same as switched on for a school. */
  defaultEnabled: boolean;
}

export interface PlanPackaging extends PlanEntry {
  rank: number;
  /** Feature keys the plan gate allows. Ungated features are in every plan. */
  includedFeatures: PlanFeatureSummary[];
  /** Declared but unavailable on this plan — the upgrade conversation. */
  gatedFeatures: PlanFeatureSummary[];
}

function summarise(spec: FeatureSpec): PlanFeatureSummary {
  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    defaultEnabled: spec.defaultEnabled,
  };
}

/** Mirrors `planAllows` in core/features: no `includedInPlans` means every plan. */
export function planIncludes(plan: SubscriptionPlan, featureKey: string): boolean {
  const spec = FEATURE_SPECS.find((candidate) => candidate.key === featureKey);
  if (!spec) return false;
  if (!spec.includedInPlans || spec.includedInPlans.length === 0) return true;
  return spec.includedInPlans.includes(plan);
}

/** Keys whose availability depends on the plan at all. */
export const PLAN_GATED_FEATURE_KEYS: readonly string[] = FEATURE_SPECS.filter(
  (spec) => spec.includedInPlans && spec.includedInPlans.length > 0,
).map((spec) => spec.key);

export function planPackaging(plan: SubscriptionPlan): PlanPackaging {
  const included: PlanFeatureSummary[] = [];
  const gated: PlanFeatureSummary[] = [];

  for (const spec of FEATURE_SPECS) {
    (planIncludes(plan, spec.key) ? included : gated).push(summarise(spec));
  }

  return { ...planEntry(plan), rank: PLAN_RANK[plan], includedFeatures: included, gatedFeatures: gated };
}

export function planCatalogue(): PlanPackaging[] {
  return PLAN_ORDER.map(planPackaging);
}

/** Which plans would make this feature available. Powers the upgrade prompt. */
export function plansIncluding(featureKey: string): SubscriptionPlan[] {
  return PLAN_ORDER.filter((plan) => planIncludes(plan, featureKey));
}

/** What a move from one plan to another would unlock, in feature terms. */
export function featuresGainedByUpgrade(
  from: SubscriptionPlan,
  to: SubscriptionPlan,
): PlanFeatureSummary[] {
  return FEATURE_SPECS.filter(
    (spec) => !planIncludes(from, spec.key) && planIncludes(to, spec.key),
  ).map(summarise);
}

export function comparePlans(a: SubscriptionPlan, b: SubscriptionPlan): number {
  return PLAN_RANK[a] - PLAN_RANK[b];
}
