// ─────────────────────────────────────────────────────────────────────────────
// Packaging and lifecycle tests
// Neither file under test touches the database, so these run without MySQL and
// still cover the two claims most likely to be wrong later: that the sales
// catalogue is derived from the same list the resolver gates on, and that a
// past-due school keeps its lessons.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { FEATURE_SPECS } from '../../core/features/feature-keys';
import {
  PLAN_GATED_FEATURE_KEYS,
  PLAN_ORDER,
  comparePlans,
  featuresGainedByUpgrade,
  planCatalogue,
  planEntry,
  planIncludes,
  planPackaging,
  plansIncluding,
} from './subscription.plans';
import {
  computeSeatUsage,
  daysBetween,
  isOpenStatus,
  subscriptionState,
  wouldExceedSeats,
} from './subscription.lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-03-01T12:00:00.000Z');
const inDays = (days: number) => new Date(now.getTime() + days * DAY);

describe('plan catalogue', () => {
  it('lists the four blueprint packages in upgrade order', () => {
    const catalogue = planCatalogue();
    expect(catalogue.map((entry) => entry.plan)).toEqual([
      SubscriptionPlan.PILOT,
      SubscriptionPlan.STARTER,
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.ENTERPRISE,
    ]);
    expect(catalogue.map((entry) => entry.rank)).toEqual([...catalogue.map((e) => e.rank)].sort((a, b) => a - b));
  });

  it('requires an end date only for a pilot', () => {
    expect(planEntry(SubscriptionPlan.PILOT).requiresEndDate).toBe(true);
    for (const plan of PLAN_ORDER.filter((candidate) => candidate !== SubscriptionPlan.PILOT)) {
      expect(planEntry(plan).requiresEndDate).toBe(false);
    }
  });

  it('partitions every declared feature into included or gated', () => {
    for (const plan of PLAN_ORDER) {
      const packaging = planPackaging(plan);
      expect(packaging.includedFeatures.length + packaging.gatedFeatures.length).toBe(
        FEATURE_SPECS.length,
      );
      const keys = new Set([
        ...packaging.includedFeatures.map((feature) => feature.key),
        ...packaging.gatedFeatures.map((feature) => feature.key),
      ]);
      expect(keys.size).toBe(FEATURE_SPECS.length);
    }
  });

  it('treats an ungated feature as available on every plan', () => {
    const ungated = FEATURE_SPECS.filter(
      (spec) => !spec.includedInPlans || spec.includedInPlans.length === 0,
    );
    expect(ungated.length).toBeGreaterThan(0);
    for (const spec of ungated) {
      for (const plan of PLAN_ORDER) expect(planIncludes(plan, spec.key)).toBe(true);
    }
  });

  it('never gates a feature back off as the plan goes up', () => {
    // If Starter includes school reports, Professional and Enterprise must too,
    // or the upgrade prompt would be offering a downgrade.
    for (const key of PLAN_GATED_FEATURE_KEYS) {
      const plans = plansIncluding(key);
      const ranks = plans.map((plan) => PLAN_ORDER.indexOf(plan));
      const contiguousFromTop = ranks.every(
        (rank, index) => rank === PLAN_ORDER.length - plans.length + index,
      );
      expect(contiguousFromTop, `${key} is gated on a non-contiguous set of plans`).toBe(true);
    }
  });

  it('reports what an upgrade would unlock, and nothing for a downgrade', () => {
    const gained = featuresGainedByUpgrade(SubscriptionPlan.PILOT, SubscriptionPlan.ENTERPRISE);
    expect(gained.map((feature) => feature.key)).toContain('reporting.schoolReports');
    expect(featuresGainedByUpgrade(SubscriptionPlan.STARTER, SubscriptionPlan.STARTER)).toEqual([]);
    expect(featuresGainedByUpgrade(SubscriptionPlan.ENTERPRISE, SubscriptionPlan.PILOT)).toEqual([]);
  });

  it('names the plans that unlock a gated feature', () => {
    expect(plansIncluding('admin.customThemes')).toEqual([
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.ENTERPRISE,
    ]);
  });

  it('refuses a key that is not in the feature registry', () => {
    expect(planIncludes(SubscriptionPlan.ENTERPRISE, 'nonsense.key')).toBe(false);
    expect(plansIncluding('nonsense.key')).toEqual([]);
  });

  it('orders plans for comparison', () => {
    expect(comparePlans(SubscriptionPlan.PILOT, SubscriptionPlan.ENTERPRISE)).toBeLessThan(0);
    expect(comparePlans(SubscriptionPlan.ENTERPRISE, SubscriptionPlan.ENTERPRISE)).toBe(0);
  });
});

describe('subscription state', () => {
  it('keeps a past-due school working', () => {
    const state = subscriptionState(
      { status: SubscriptionStatus.PAST_DUE, endsAt: inDays(90), trialEndsAt: null },
      now,
    );
    expect(state.entitlesFeatures).toBe(true);
    expect(state.isPastDue).toBe(true);
    expect(state.needsAttention).toContain('Learners still have access');
  });

  it('closes the gate once cancelled or expired', () => {
    for (const status of [SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED]) {
      const state = subscriptionState({ status, endsAt: inDays(-1), trialEndsAt: null }, now);
      expect(state.entitlesFeatures).toBe(false);
    }
    expect(isOpenStatus(SubscriptionStatus.CANCELLED)).toBe(false);
    expect(isOpenStatus(SubscriptionStatus.TRIALING)).toBe(true);
  });

  it('counts a live trial and flags one that has run out', () => {
    const live = subscriptionState(
      { status: SubscriptionStatus.TRIALING, endsAt: inDays(60), trialEndsAt: inDays(14) },
      now,
    );
    expect(live.inTrial).toBe(true);
    expect(live.trialDaysRemaining).toBe(14);
    expect(live.needsAttention).toBeNull();

    const lapsed = subscriptionState(
      { status: SubscriptionStatus.TRIALING, endsAt: inDays(60), trialEndsAt: inDays(-2) },
      now,
    );
    expect(lapsed.inTrial).toBe(false);
    expect(lapsed.needsAttention).toContain('trial period has ended');
  });

  it('flags an open agreement whose term has already passed', () => {
    const state = subscriptionState(
      { status: SubscriptionStatus.ACTIVE, endsAt: inDays(-3), trialEndsAt: null },
      now,
    );
    expect(state.entitlesFeatures).toBe(true);
    expect(state.daysRemaining).toBe(-3);
    expect(state.needsAttention).toContain('end date has passed');
  });

  it('reports no countdown when there is no end date', () => {
    const state = subscriptionState(
      { status: SubscriptionStatus.ACTIVE, endsAt: null, trialEndsAt: null },
      now,
    );
    expect(state.daysRemaining).toBeNull();
    expect(state.trialDaysRemaining).toBeNull();
    expect(state.needsAttention).toBeNull();
  });

  it('rounds a partial day up so "ends today" is not zero', () => {
    expect(daysBetween(now, new Date(now.getTime() + 1000))).toBe(1);
    expect(daysBetween(now, inDays(2))).toBe(2);
  });
});

describe('seat usage', () => {
  it('treats zero licensed seats as unmetered rather than locked', () => {
    const usage = computeSeatUsage({
      licensedStudentSeats: 0,
      studentsUsed: 240,
      licensedTeacherSeats: 0,
      teachersUsed: 18,
    });
    expect(usage.studentsRemaining).toBeNull();
    expect(usage.teachersRemaining).toBeNull();
    expect(usage.overStudentSeats).toBe(false);
    expect(usage.overTeacherSeats).toBe(false);
  });

  it('reports the overage rather than clamping it', () => {
    const usage = computeSeatUsage({
      licensedStudentSeats: 200,
      studentsUsed: 214,
      licensedTeacherSeats: 20,
      teachersUsed: 20,
    });
    expect(usage.studentsRemaining).toBe(-14);
    expect(usage.overStudentSeats).toBe(true);
    expect(usage.teachersRemaining).toBe(0);
    expect(usage.overTeacherSeats).toBe(false);
  });

  it('blocks the seat that would cross the licensed count', () => {
    expect(wouldExceedSeats(0, 5000, 1)).toBe(false);
    expect(wouldExceedSeats(200, 199, 1)).toBe(false);
    expect(wouldExceedSeats(200, 200, 1)).toBe(true);
    expect(wouldExceedSeats(200, 195, 10)).toBe(true);
  });
});
