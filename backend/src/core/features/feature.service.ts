// ─────────────────────────────────────────────────────────────────────────────
// Feature resolution — the configuration precedence engine
// Blueprint 06 defines the order in which a configuration decision is made:
//
//   1. Platform safety rule          (cannot be loosened by a tenant)
//   2. Subscription entitlement      (is it in the plan at all?)
//   3. Organization setting
//   4. School setting
//   5. Grade / class / subject setting
//   6. Teacher assignment            (role scope)
//   7. Student-specific state        (user group)
//
// Steps 3–7 run "most specific wins". Step 2 is a gate: a feature outside the
// plan is off regardless of what a tenant row says. Step 1 is applied last and
// can only tighten the result, never loosen it.
//
// Every decision carries a `reason` and the scope that produced it, because
// blueprint 06 requires visibility decisions to be explainable to an administrator.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EntitlementScopeType,
  SubscriptionStatus,
  type FeatureEntitlement,
  type RoleKey,
  type SubscriptionPlan,
} from '@prisma/client';
import { badRequest, featureDisabled } from '../http/errors';
import { logger } from '../logger';
import { prisma } from '../prisma';
import { featureSpec, isKnownFeatureKey, type FeatureSpec } from './feature-keys';

const log = logger.child({ module: 'features' });

/** Where the request is happening, as far as feature visibility is concerned. */
export interface FeatureScope {
  organizationId?: string | null;
  schoolId?: string | null;
  roleKey?: RoleKey | null;
  gradeId?: string | null;
  classId?: string | null;
  subjectId?: string | null;
  userGroupIds?: string[];
}

export interface FeatureDecision {
  key: string;
  enabled: boolean;
  /** Structured limit or variant attached to the winning row. */
  value: unknown;
  /** Which scope decided it, or `DEFAULT` / `PLAN_GATE` / `DEPENDENCY`. */
  decidedBy: string;
  reason: string;
}

/** Specificity ranking for steps 3–7. Higher wins. */
const SCOPE_RANK: Record<EntitlementScopeType, number> = {
  [EntitlementScopeType.PLATFORM]: 10,
  [EntitlementScopeType.PLAN]: 20,
  [EntitlementScopeType.ORGANIZATION]: 30,
  [EntitlementScopeType.SCHOOL]: 40,
  [EntitlementScopeType.ROLE]: 50,
  [EntitlementScopeType.GRADE]: 60,
  [EntitlementScopeType.SUBJECT]: 70,
  [EntitlementScopeType.CLASS]: 80,
  [EntitlementScopeType.USER_GROUP]: 90,
};

// ── Entitlement cache ───────────────────────────────────────────────────────
// A per-request feature check must not cost a query. Entitlements change rarely
// and always through this module, so a short TTL plus explicit invalidation is
// both correct and cheap. `null` school id keys the platform-level bucket.

interface CacheEntry {
  rows: FeatureEntitlement[];
  plan: SubscriptionPlan | null;
  planActive: boolean;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(organizationId: string | null, schoolId: string | null): string {
  return `${organizationId ?? '-'}::${schoolId ?? '-'}`;
}

export function invalidateFeatureCache(organizationId?: string | null, schoolId?: string | null): void {
  if (organizationId === undefined && schoolId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(organizationId ?? null, schoolId ?? null));
  // An organization-level change affects every school under it, and the school
  // buckets are keyed separately, so clear anything sharing the organization.
  if (organizationId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${organizationId}::`)) cache.delete(key);
    }
  }
}

async function loadEntitlements(
  organizationId: string | null,
  schoolId: string | null,
): Promise<CacheEntry> {
  const key = cacheKey(organizationId, schoolId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const now = new Date();

  const [rows, subscription] = await Promise.all([
    prisma.featureEntitlement.findMany({
      where: {
        OR: [
          { scopeType: EntitlementScopeType.PLATFORM },
          { scopeType: EntitlementScopeType.PLAN },
          ...(organizationId ? [{ organizationId }] : []),
          ...(schoolId ? [{ schoolId }] : []),
        ],
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
        ],
      },
    }),
    prisma.subscription.findFirst({
      where: {
        OR: [...(schoolId ? [{ schoolId }] : []), ...(organizationId ? [{ organizationId }] : [])],
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE] },
      },
      orderBy: [{ schoolId: 'desc' }, { startsAt: 'desc' }],
      select: { plan: true, status: true },
    }),
  ]);

  const entry: CacheEntry = {
    rows,
    plan: subscription?.plan ?? null,
    // A past-due subscription keeps working; blueprint 09 treats collections as
    // a commercial conversation, not an instant lockout of learners.
    planActive: subscription
      ? subscription.status !== SubscriptionStatus.CANCELLED &&
        subscription.status !== SubscriptionStatus.EXPIRED
      : false,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  cache.set(key, entry);
  return entry;
}

/** True when an entitlement row applies to the scope being evaluated. */
function rowMatchesScope(row: FeatureEntitlement, scope: FeatureScope, plan: SubscriptionPlan | null): boolean {
  switch (row.scopeType) {
    case EntitlementScopeType.PLATFORM:
      return true;
    case EntitlementScopeType.PLAN:
      return row.plan !== null && row.plan === plan;
    case EntitlementScopeType.ORGANIZATION:
      return !!scope.organizationId && row.organizationId === scope.organizationId;
    case EntitlementScopeType.SCHOOL:
      return !!scope.schoolId && row.schoolId === scope.schoolId;
    case EntitlementScopeType.ROLE:
      return !!scope.roleKey && row.roleKey === scope.roleKey;
    case EntitlementScopeType.GRADE:
      return !!scope.gradeId && row.gradeId === scope.gradeId;
    case EntitlementScopeType.CLASS:
      return !!scope.classId && row.classId === scope.classId;
    case EntitlementScopeType.SUBJECT:
      return !!scope.subjectId && row.subjectId === scope.subjectId;
    case EntitlementScopeType.USER_GROUP:
      return !!row.userGroupId && (scope.userGroupIds ?? []).includes(row.userGroupId);
    default:
      return false;
  }
}

function planAllows(spec: FeatureSpec, plan: SubscriptionPlan | null, planActive: boolean): boolean {
  if (!spec.includedInPlans || spec.includedInPlans.length === 0) return true;
  if (!plan || !planActive) return false;
  return spec.includedInPlans.includes(plan);
}

/**
 * Resolves one feature key. `resolveFeatures` is preferable when a screen needs
 * several keys, because it reuses a single entitlement load.
 */
export async function resolveFeature(key: string, scope: FeatureScope): Promise<FeatureDecision> {
  const decisions = await resolveFeatures([key], scope);
  const decision = decisions[key];
  if (!decision) throw badRequest(`Unknown feature key: ${key}`);
  return decision;
}

/** Resolves many keys against one entitlement load. */
export async function resolveFeatures(
  keys: readonly string[],
  scope: FeatureScope,
): Promise<Record<string, FeatureDecision>> {
  const unknown = keys.filter((key) => !isKnownFeatureKey(key));
  if (unknown.length > 0) {
    // A typo in a feature key must not silently resolve to "enabled".
    throw badRequest(`Unknown feature key(s): ${unknown.join(', ')}`);
  }

  const organizationId = scope.organizationId ?? null;
  const schoolId = scope.schoolId ?? null;
  const { rows, plan, planActive } = await loadEntitlements(organizationId, schoolId);

  const output: Record<string, FeatureDecision> = {};
  for (const key of keys) {
    output[key] = decide(key, rows, scope, plan, planActive);
  }

  // Dependencies are applied after the first pass so a dependency declared in
  // the same batch is evaluated on its own merits first.
  for (const key of keys) {
    const spec = featureSpec(key);
    if (!spec?.dependsOn || !output[key]?.enabled) continue;
    for (const dependencyKey of spec.dependsOn) {
      const dependency = output[dependencyKey] ?? decide(dependencyKey, rows, scope, plan, planActive);
      if (!dependency.enabled) {
        output[key] = {
          key,
          enabled: false,
          value: null,
          decidedBy: 'DEPENDENCY',
          reason: `Requires "${dependencyKey}", which is not enabled here.`,
        };
        break;
      }
    }
  }

  return output;
}

function decide(
  key: string,
  rows: FeatureEntitlement[],
  scope: FeatureScope,
  plan: SubscriptionPlan | null,
  planActive: boolean,
): FeatureDecision {
  const spec = featureSpec(key);
  if (!spec) {
    return {
      key,
      enabled: false,
      value: null,
      decidedBy: 'UNKNOWN',
      reason: 'This feature key is not declared in the platform registry.',
    };
  }

  // ── Step 2: the plan gate ─────────────────────────────────────────────────
  if (!planAllows(spec, plan, planActive)) {
    return {
      key,
      enabled: false,
      value: null,
      decidedBy: 'PLAN_GATE',
      reason: plan
        ? `Not included in the ${plan} plan.`
        : 'No active subscription includes this feature.',
    };
  }

  const candidates = rows
    .filter((row) => row.featureKey === key && rowMatchesScope(row, scope, plan))
    .sort((a, b) => {
      const rankDelta = SCOPE_RANK[a.scopeType] - SCOPE_RANK[b.scopeType];
      if (rankDelta !== 0) return rankDelta;
      if (a.precedence !== b.precedence) return a.precedence - b.precedence;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  // ── Steps 3–7: most specific wins ─────────────────────────────────────────
  const nonSafety = candidates.filter((row) => !row.isSafetyRule);
  const winner = nonSafety.at(-1);

  let decision: FeatureDecision = winner
    ? {
        key,
        enabled: winner.enabled,
        value: winner.value ?? null,
        decidedBy: winner.scopeType,
        reason: winner.reason ?? `Set at ${winner.scopeType.toLowerCase()} level.`,
      }
    : {
        key,
        enabled: spec.defaultEnabled,
        value: null,
        decidedBy: 'DEFAULT',
        reason: 'Platform default.',
      };

  // ── Step 1: platform safety rules, applied last and only to tighten ───────
  const safetyRules = candidates.filter((row) => row.isSafetyRule);
  for (const rule of safetyRules) {
    if (!rule.enabled && decision.enabled) {
      decision = {
        key,
        enabled: false,
        value: null,
        decidedBy: `SAFETY_RULE:${rule.scopeType}`,
        reason: rule.reason ?? 'Blocked by a platform safety rule.',
      };
    }
  }

  return decision;
}

/** Throws a 403 unless the feature is enabled for this scope. */
export async function assertFeatureEnabled(key: string, scope: FeatureScope): Promise<void> {
  const decision = await resolveFeature(key, scope);
  if (!decision.enabled) {
    log.debug({ key, decidedBy: decision.decidedBy }, 'feature blocked');
    throw featureDisabled(key, decision.reason);
  }
}

export async function isFeatureEnabled(key: string, scope: FeatureScope): Promise<boolean> {
  const decision = await resolveFeature(key, scope);
  return decision.enabled;
}
