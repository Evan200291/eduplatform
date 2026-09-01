// ─────────────────────────────────────────────────────────────────────────────
// Support policy (blueprint 13)
// The blueprint's requirement is precise: "Each category needs owner, priority,
// target response, escalation route, and closure criteria." That is five things
// per category, and they belong in a table rather than scattered through the
// service — so this file is that table, and the service does the work.
//
// The hour targets are platform defaults. An Enterprise agreement with written
// service commitments overrides them commercially; nothing here claims to be a
// contract. What the code does guarantee is that a target exists on every
// request, so a breach is measurable instead of a matter of opinion.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey, SupportCategory, SupportPriority, SupportStatus } from '@prisma/client';

const HOUR_MS = 3_600_000;

/** Priority ordering, so a minimum can be enforced without a switch statement. */
export const PRIORITY_RANK: Record<SupportPriority, number> = {
  [SupportPriority.LOW]: 10,
  [SupportPriority.NORMAL]: 20,
  [SupportPriority.HIGH]: 30,
  [SupportPriority.URGENT]: 40,
};

/**
 * Elapsed-hour targets, deliberately not business hours. A school reporting a
 * privacy problem at 16:00 on a Friday should not have the clock stop.
 */
export const FIRST_RESPONSE_HOURS: Record<SupportPriority, number> = {
  [SupportPriority.LOW]: 24,
  [SupportPriority.NORMAL]: 8,
  [SupportPriority.HIGH]: 4,
  [SupportPriority.URGENT]: 1,
};

export const RESOLUTION_HOURS: Record<SupportPriority, number> = {
  [SupportPriority.LOW]: 240,
  [SupportPriority.NORMAL]: 72,
  [SupportPriority.HIGH]: 24,
  [SupportPriority.URGENT]: 8,
};

export interface CategoryPolicy {
  category: SupportCategory;
  label: string;
  /** The role that owns the category. Shown to the requester as "handled by". */
  ownerRole: RoleKey;
  defaultPriority: SupportPriority;
  /** A category floor: a security report cannot be filed as low priority. */
  minimumPriority: SupportPriority;
  escalationRoute: string;
  closureCriteria: string;
  /** True where the requester must be told the outcome, not just "fixed". */
  requiresWrittenOutcome: boolean;
}

export const CATEGORY_POLICIES: Record<SupportCategory, CategoryPolicy> = {
  [SupportCategory.ACCESS_ACCOUNT]: {
    category: SupportCategory.ACCESS_ACCOUNT,
    label: 'Access and account issues',
    ownerRole: RoleKey.SUPPORT_AGENT,
    defaultPriority: SupportPriority.HIGH,
    minimumPriority: SupportPriority.NORMAL,
    escalationRoute: 'Support agent, then platform operations if the account cannot be restored.',
    closureCriteria: 'The named user has signed in successfully and confirmed access.',
    requiresWrittenOutcome: false,
  },
  [SupportCategory.USABILITY]: {
    category: SupportCategory.USABILITY,
    label: 'Teacher and student usability',
    ownerRole: RoleKey.SUPPORT_AGENT,
    defaultPriority: SupportPriority.NORMAL,
    minimumPriority: SupportPriority.LOW,
    escalationRoute: 'Support agent, then product review if the pattern repeats across schools.',
    closureCriteria: 'The requester can complete the task, or the limitation is documented.',
    requiresWrittenOutcome: false,
  },
  [SupportCategory.CONTENT_ERROR]: {
    category: SupportCategory.CONTENT_ERROR,
    label: 'Content errors',
    ownerRole: RoleKey.CONTENT_REVIEWER,
    defaultPriority: SupportPriority.HIGH,
    // A wrong answer shown to children is never a low-priority ticket.
    minimumPriority: SupportPriority.HIGH,
    escalationRoute: 'Content reviewer, then curriculum manager for a published revision.',
    closureCriteria: 'The content is corrected and republished, or the report is explained.',
    requiresWrittenOutcome: true,
  },
  [SupportCategory.CONFIGURATION_REQUEST]: {
    category: SupportCategory.CONFIGURATION_REQUEST,
    label: 'Configuration requests',
    ownerRole: RoleKey.PLATFORM_OPS_ADMIN,
    defaultPriority: SupportPriority.NORMAL,
    minimumPriority: SupportPriority.LOW,
    escalationRoute: 'Platform operations, then platform owner where an entitlement changes.',
    closureCriteria: 'The change is applied with an audit record and verified by the requester.',
    requiresWrittenOutcome: true,
  },
  [SupportCategory.DATA_REPORTING]: {
    category: SupportCategory.DATA_REPORTING,
    label: 'Data and report questions',
    ownerRole: RoleKey.PLATFORM_OPS_ADMIN,
    defaultPriority: SupportPriority.NORMAL,
    minimumPriority: SupportPriority.LOW,
    escalationRoute: 'Platform operations, then reporting owner for a definition change.',
    closureCriteria: 'The figure is explained or corrected, naming the rule version used.',
    requiresWrittenOutcome: true,
  },
  [SupportCategory.PLATFORM_DEFECT]: {
    category: SupportCategory.PLATFORM_DEFECT,
    label: 'Platform defects',
    ownerRole: RoleKey.PLATFORM_OPS_ADMIN,
    defaultPriority: SupportPriority.HIGH,
    minimumPriority: SupportPriority.NORMAL,
    escalationRoute: 'Platform operations, then engineering with a defect reference.',
    closureCriteria: 'A fix is released and referenced, or a workaround is agreed in writing.',
    requiresWrittenOutcome: true,
  },
  [SupportCategory.SECURITY_PRIVACY]: {
    category: SupportCategory.SECURITY_PRIVACY,
    label: 'Security or privacy concerns',
    ownerRole: RoleKey.PLATFORM_OWNER,
    defaultPriority: SupportPriority.URGENT,
    // Blueprint 11 runs the incident procedure off this signal. It cannot idle.
    minimumPriority: SupportPriority.URGENT,
    escalationRoute: 'Platform owner immediately; incident management SOP if data is affected.',
    closureCriteria:
      'Containment, notification of authorized parties, and a recorded root-cause review.',
    requiresWrittenOutcome: true,
  },
  [SupportCategory.COMMERCIAL_SUBSCRIPTION]: {
    category: SupportCategory.COMMERCIAL_SUBSCRIPTION,
    label: 'Commercial and subscription questions',
    ownerRole: RoleKey.BILLING_ADMIN,
    defaultPriority: SupportPriority.LOW,
    minimumPriority: SupportPriority.LOW,
    escalationRoute: 'Billing administrator, then platform owner for a contract change.',
    closureCriteria: 'The commercial question is answered in writing by an authorized owner.',
    requiresWrittenOutcome: true,
  },
};

export function categoryPolicy(category: SupportCategory): CategoryPolicy {
  return CATEGORY_POLICIES[category];
}

export function supportPolicies(): CategoryPolicy[] {
  return Object.values(CATEGORY_POLICIES);
}

/** A requester may raise the priority but never below the category floor. */
export function effectivePriority(
  category: SupportCategory,
  requested?: SupportPriority | null,
): SupportPriority {
  const policy = categoryPolicy(category);
  const candidate = requested ?? policy.defaultPriority;
  return PRIORITY_RANK[candidate] >= PRIORITY_RANK[policy.minimumPriority]
    ? candidate
    : policy.minimumPriority;
}

export interface ResponseTargets {
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
}

export function responseTargets(priority: SupportPriority, from = new Date()): ResponseTargets {
  return {
    firstResponseDueAt: new Date(from.getTime() + FIRST_RESPONSE_HOURS[priority] * HOUR_MS),
    resolutionDueAt: new Date(from.getTime() + RESOLUTION_HOURS[priority] * HOUR_MS),
  };
}

// ── Status transitions ──────────────────────────────────────────────────────
// "Nothing is closed silently": the allowed moves are declared, so a request
// cannot jump from NEW to CLOSED and skip both the response and the outcome.

export const ALLOWED_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  [SupportStatus.NEW]: [SupportStatus.TRIAGED, SupportStatus.IN_PROGRESS, SupportStatus.ESCALATED],
  [SupportStatus.TRIAGED]: [
    SupportStatus.IN_PROGRESS,
    SupportStatus.WAITING_ON_CUSTOMER,
    SupportStatus.ESCALATED,
  ],
  [SupportStatus.IN_PROGRESS]: [
    SupportStatus.WAITING_ON_CUSTOMER,
    SupportStatus.ESCALATED,
    SupportStatus.RESOLVED,
  ],
  [SupportStatus.WAITING_ON_CUSTOMER]: [
    SupportStatus.IN_PROGRESS,
    SupportStatus.ESCALATED,
    SupportStatus.RESOLVED,
  ],
  [SupportStatus.ESCALATED]: [SupportStatus.IN_PROGRESS, SupportStatus.RESOLVED],
  [SupportStatus.RESOLVED]: [SupportStatus.CLOSED, SupportStatus.IN_PROGRESS],
  [SupportStatus.CLOSED]: [],
};

export function canTransition(from: SupportStatus, to: SupportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Statuses where the clock is still the platform's problem. */
export const OPEN_STATUSES: SupportStatus[] = [
  SupportStatus.NEW,
  SupportStatus.TRIAGED,
  SupportStatus.IN_PROGRESS,
  SupportStatus.ESCALATED,
];

export interface BreachState {
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
}

/**
 * A target is breached only while the platform owes something. Time spent
 * WAITING_ON_CUSTOMER is not counted against resolution, because the school is
 * the one holding the ticket.
 */
export function breachState(
  request: {
    status: SupportStatus;
    firstResponseDueAt: Date | null;
    resolutionDueAt: Date | null;
    firstRespondedAt: Date | null;
    resolvedAt: Date | null;
  },
  now = new Date(),
): BreachState {
  const firstResponseBreached =
    !!request.firstResponseDueAt &&
    (request.firstRespondedAt
      ? request.firstRespondedAt > request.firstResponseDueAt
      : now > request.firstResponseDueAt);

  const resolutionBreached =
    !!request.resolutionDueAt &&
    (request.resolvedAt
      ? request.resolvedAt > request.resolutionDueAt
      : OPEN_STATUSES.includes(request.status) && now > request.resolutionDueAt);

  return { firstResponseBreached, resolutionBreached };
}
