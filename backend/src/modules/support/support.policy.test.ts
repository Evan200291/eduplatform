import { describe, expect, it } from 'vitest';
import { SupportCategory, SupportPriority, SupportStatus } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  CATEGORY_POLICIES,
  FIRST_RESPONSE_HOURS,
  OPEN_STATUSES,
  PRIORITY_RANK,
  RESOLUTION_HOURS,
  breachState,
  canTransition,
  categoryPolicy,
  effectivePriority,
  responseTargets,
  supportPolicies,
} from './support.policy';

const ALL_CATEGORIES = Object.values(SupportCategory);
const ALL_STATUSES = Object.values(SupportStatus);
const ALL_PRIORITIES = Object.values(SupportPriority);
const HOUR = 3_600_000;

// ── The blueprint's five-part requirement, checked per category ──────────────

describe('category policies', () => {
  it('covers every category with all five required parts', () => {
    expect(supportPolicies()).toHaveLength(ALL_CATEGORIES.length);

    for (const category of ALL_CATEGORIES) {
      const policy = categoryPolicy(category);
      expect(policy.category, `${category} policy is filed under the wrong key`).toBe(category);
      expect(policy.label.length).toBeGreaterThan(3);
      expect(policy.ownerRole, `${category} has no owner`).toBeTruthy();
      expect(policy.defaultPriority, `${category} has no priority`).toBeTruthy();
      expect(policy.escalationRoute.length, `${category} has no escalation route`).toBeGreaterThan(10);
      expect(policy.closureCriteria.length, `${category} has no closure criteria`).toBeGreaterThan(10);
    }
  });

  it('never sets a default priority below the category floor', () => {
    for (const policy of supportPolicies()) {
      expect(
        PRIORITY_RANK[policy.defaultPriority],
        `${policy.category} defaults below its own minimum`,
      ).toBeGreaterThanOrEqual(PRIORITY_RANK[policy.minimumPriority]);
    }
  });

  it('gives every priority a response target that is tighter than its resolution target', () => {
    for (const priority of ALL_PRIORITIES) {
      expect(FIRST_RESPONSE_HOURS[priority]).toBeGreaterThan(0);
      expect(RESOLUTION_HOURS[priority]).toBeGreaterThan(FIRST_RESPONSE_HOURS[priority]);
    }
  });

  it('makes a higher priority strictly faster', () => {
    const ordered = [...ALL_PRIORITIES].sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b]);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(FIRST_RESPONSE_HOURS[ordered[i]]).toBeLessThan(FIRST_RESPONSE_HOURS[ordered[i - 1]]);
      expect(RESOLUTION_HOURS[ordered[i]]).toBeLessThan(RESOLUTION_HOURS[ordered[i - 1]]);
    }
  });
});

// ── Priority floors ─────────────────────────────────────────────────────────

describe('effectivePriority', () => {
  it('refuses to file a security or privacy concern as low priority', () => {
    expect(effectivePriority(SupportCategory.SECURITY_PRIVACY, SupportPriority.LOW)).toBe(
      SupportPriority.URGENT,
    );
  });

  it('refuses to file a content error below high priority', () => {
    // A wrong answer shown to children is not a housekeeping ticket.
    expect(effectivePriority(SupportCategory.CONTENT_ERROR, SupportPriority.LOW)).toBe(
      SupportPriority.HIGH,
    );
    expect(effectivePriority(SupportCategory.CONTENT_ERROR, SupportPriority.NORMAL)).toBe(
      SupportPriority.HIGH,
    );
  });

  it('lets a requester raise the priority above the floor', () => {
    expect(
      effectivePriority(SupportCategory.COMMERCIAL_SUBSCRIPTION, SupportPriority.URGENT),
    ).toBe(SupportPriority.URGENT);
  });

  it('falls back to the category default when nothing is suggested', () => {
    for (const category of ALL_CATEGORIES) {
      expect(effectivePriority(category, undefined)).toBe(categoryPolicy(category).defaultPriority);
      expect(effectivePriority(category, null)).toBe(categoryPolicy(category).defaultPriority);
    }
  });

  it('never returns anything below the floor for any input', () => {
    for (const category of ALL_CATEGORIES) {
      const floor = PRIORITY_RANK[categoryPolicy(category).minimumPriority];
      for (const priority of ALL_PRIORITIES) {
        expect(PRIORITY_RANK[effectivePriority(category, priority)]).toBeGreaterThanOrEqual(floor);
      }
    }
  });
});

describe('responseTargets', () => {
  const from = new Date('2026-03-02T09:00:00.000Z');

  it('sets both targets from the same moment', () => {
    const urgent = responseTargets(SupportPriority.URGENT, from);
    expect(urgent.firstResponseDueAt.getTime()).toBe(from.getTime() + HOUR);
    expect(urgent.resolutionDueAt.getTime()).toBe(from.getTime() + 8 * HOUR);
  });

  it('does not stop the clock overnight or at a weekend', () => {
    // Friday 16:00 plus a four-hour target is Friday 20:00, not Monday morning.
    const friday = new Date('2026-03-06T16:00:00.000Z');
    const high = responseTargets(SupportPriority.HIGH, friday);
    expect(high.firstResponseDueAt.toISOString()).toBe('2026-03-06T20:00:00.000Z');
  });
});

// ── Transitions ─────────────────────────────────────────────────────────────

describe('status transitions', () => {
  it('declares a move list for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status], `${status} has no transition list`).toBeDefined();
    }
  });

  it('never lets a request jump straight to closed', () => {
    for (const status of ALL_STATUSES) {
      if (status === SupportStatus.RESOLVED) continue;
      expect(
        canTransition(status, SupportStatus.CLOSED),
        `${status} can be closed without a resolution`,
      ).toBe(false);
    }
    expect(canTransition(SupportStatus.RESOLVED, SupportStatus.CLOSED)).toBe(true);
  });

  it('treats closed as terminal', () => {
    expect(ALLOWED_TRANSITIONS[SupportStatus.CLOSED]).toEqual([]);
    for (const status of ALL_STATUSES) {
      expect(canTransition(SupportStatus.CLOSED, status)).toBe(false);
    }
  });

  it('allows escalation from every status the platform still owes work on', () => {
    for (const status of OPEN_STATUSES) {
      if (status === SupportStatus.ESCALATED) continue;
      expect(canTransition(status, SupportStatus.ESCALATED), `${status} cannot escalate`).toBe(true);
    }
  });

  it('lets a resolved request be reopened rather than duplicated', () => {
    expect(canTransition(SupportStatus.RESOLVED, SupportStatus.IN_PROGRESS)).toBe(true);
  });

  it('only ever names real statuses as destinations', () => {
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const target of targets) expect(ALL_STATUSES).toContain(target);
    }
  });

  it('counts resolved and closed as work no longer owed', () => {
    expect(OPEN_STATUSES).not.toContain(SupportStatus.RESOLVED);
    expect(OPEN_STATUSES).not.toContain(SupportStatus.CLOSED);
  });
});

// ── Breach measurement ──────────────────────────────────────────────────────

describe('breachState', () => {
  const now = new Date('2026-03-02T12:00:00.000Z');
  const base = {
    status: SupportStatus.IN_PROGRESS,
    firstResponseDueAt: new Date('2026-03-02T13:00:00.000Z'),
    resolutionDueAt: new Date('2026-03-03T09:00:00.000Z'),
    firstRespondedAt: null as Date | null,
    resolvedAt: null as Date | null,
  };

  it('reports nothing while both targets are still ahead', () => {
    expect(breachState(base, now)).toEqual({
      firstResponseBreached: false,
      resolutionBreached: false,
    });
  });

  it('reports an unanswered request once the response target passes', () => {
    const state = breachState({ ...base, firstResponseDueAt: new Date('2026-03-02T11:00:00.000Z') }, now);
    expect(state.firstResponseBreached).toBe(true);
    expect(state.resolutionBreached).toBe(false);
  });

  it('keeps reporting a late first reply after the fact', () => {
    // The target was 13:00 and the reply landed at 14:00: still a breach a week later.
    const state = breachState(
      {
        ...base,
        firstRespondedAt: new Date('2026-03-02T14:00:00.000Z'),
        status: SupportStatus.RESOLVED,
        resolvedAt: new Date('2026-03-02T15:00:00.000Z'),
      },
      new Date('2026-03-09T00:00:00.000Z'),
    );
    expect(state.firstResponseBreached).toBe(true);
    expect(state.resolutionBreached).toBe(false);
  });

  it('does not count resolution time against the platform while the school holds the ticket', () => {
    const state = breachState(
      {
        ...base,
        status: SupportStatus.WAITING_ON_CUSTOMER,
        firstRespondedAt: new Date('2026-03-02T09:30:00.000Z'),
        resolutionDueAt: new Date('2026-03-01T09:00:00.000Z'),
      },
      now,
    );
    expect(state.resolutionBreached).toBe(false);
  });

  it('counts a resolution delivered after its target', () => {
    const state = breachState(
      {
        ...base,
        status: SupportStatus.RESOLVED,
        firstRespondedAt: new Date('2026-03-02T09:30:00.000Z'),
        resolvedAt: new Date('2026-03-04T09:00:00.000Z'),
      },
      now,
    );
    expect(state.resolutionBreached).toBe(true);
  });

  it('reports nothing when no target was ever set', () => {
    expect(
      breachState({ ...base, firstResponseDueAt: null, resolutionDueAt: null }, now),
    ).toEqual({ firstResponseBreached: false, resolutionBreached: false });
  });

  it('treats a request sitting open past its resolution target as breached', () => {
    const state = breachState(
      {
        ...base,
        status: SupportStatus.ESCALATED,
        firstRespondedAt: new Date('2026-03-02T09:30:00.000Z'),
        resolutionDueAt: new Date('2026-03-02T10:00:00.000Z'),
      },
      now,
    );
    expect(state.firstResponseBreached).toBe(false);
    expect(state.resolutionBreached).toBe(true);
  });
});

describe('CATEGORY_POLICIES table', () => {
  it('is keyed by the enum, so a new category cannot be added without a policy', () => {
    expect(Object.keys(CATEGORY_POLICIES).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('demands a written outcome wherever closure depends on someone agreeing', () => {
    expect(CATEGORY_POLICIES[SupportCategory.SECURITY_PRIVACY].requiresWrittenOutcome).toBe(true);
    expect(CATEGORY_POLICIES[SupportCategory.CONTENT_ERROR].requiresWrittenOutcome).toBe(true);
    expect(CATEGORY_POLICIES[SupportCategory.ACCESS_ACCOUNT].requiresWrittenOutcome).toBe(false);
  });
});
