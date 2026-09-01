// ─────────────────────────────────────────────────────────────────────────────
// Feature entitlements (blueprint 06)
// The resolver in core/features answers "is this on?". This module is how a row
// gets written in the first place, and it exists because a toggle that silently
// does nothing is worse than no toggle at all.
//
// So every write here comes back with the decision it produced. If a school
// admin switches on custom reports and their plan does not include them, the
// response says PLAN_GATE and names the plans that would. If they try to loosen a
// platform safety rule, the response says SAFETY_RULE. The row is still stored —
// it becomes true the moment the plan changes — but nobody is told "saved" and
// left to wonder why the screen looks the same.
// ─────────────────────────────────────────────────────────────────────────────

import { EntitlementScopeType, Prisma } from '@prisma/client';
import type { ActorContext } from '../../core/context';
import { recordAudit } from '../../core/audit/audit.service';
import {
  FEATURE_SPECS,
  featureSpec,
  isKnownFeatureKey,
  type FeatureSpec,
} from '../../core/features/feature-keys';
import {
  invalidateFeatureCache,
  resolveFeatures,
  type FeatureDecision,
  type FeatureScope,
} from '../../core/features/feature.service';
import { badRequest, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { plansIncluding } from './subscription.plans';
import type {
  entitlementListQuery,
  explainFeaturesSchema,
  featureCatalogueQuery,
  setEntitlementSchema,
} from './subscription.validation';
import type { z } from 'zod';

type SetInput = z.infer<typeof setEntitlementSchema>;
type ListQuery = z.infer<typeof entitlementListQuery>;
type ExplainInput = z.infer<typeof explainFeaturesSchema>;
type CatalogueQuery = z.infer<typeof featureCatalogueQuery>;

export const ENTITLEMENT_SELECT = {
  id: true,
  featureKey: true,
  scopeType: true,
  enabled: true,
  value: true,
  organizationId: true,
  schoolId: true,
  subscriptionId: true,
  plan: true,
  roleKey: true,
  gradeId: true,
  classId: true,
  subjectId: true,
  userGroupId: true,
  precedence: true,
  reason: true,
  isSafetyRule: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
} satisfies Prisma.FeatureEntitlementSelect;

export type EntitlementRow = Prisma.FeatureEntitlementGetPayload<{
  select: typeof ENTITLEMENT_SELECT;
}>;

/** Scopes only the platform may write: they cross tenant boundaries. */
const PLATFORM_ONLY_SCOPES: EntitlementScopeType[] = [
  EntitlementScopeType.PLATFORM,
  EntitlementScopeType.PLAN,
  // A school admin setting an organization row would silently change sibling
  // schools they have no authority over.
  EntitlementScopeType.ORGANIZATION,
];

// ── Scope helpers ───────────────────────────────────────────────────────────

/** The evaluation scope a stored row applies to, used to explain the result. */
function scopeOf(row: EntitlementRow, organizationId: string | null): FeatureScope {
  return {
    organizationId: row.organizationId ?? organizationId,
    schoolId: row.schoolId,
    roleKey: row.roleKey,
    gradeId: row.gradeId,
    classId: row.classId,
    subjectId: row.subjectId,
    userGroupIds: row.userGroupId ? [row.userGroupId] : [],
  };
}

/** Every scope target must belong to the school the row is written against. */
async function assertTargetsBelongToSchool(input: SetInput, schoolId: string | null): Promise<void> {
  if (input.gradeId) {
    const grade = await prisma.grade.findFirst({
      where: { id: input.gradeId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    if (!grade) throw notFound('Grade');
  }
  if (input.classId) {
    const klass = await prisma.class.findFirst({
      where: { id: input.classId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    if (!klass) throw notFound('Class');
  }
  if (input.subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: input.subjectId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    if (!subject) throw notFound('Subject');
  }
  if (input.userGroupId) {
    const group = await prisma.userGroup.findFirst({
      where: { id: input.userGroupId, ...(schoolId ? { schoolId } : {}) },
      select: { id: true },
    });
    if (!group) throw notFound('User group');
  }
}

function assertScopeAllowed(spec: FeatureSpec, scopeType: EntitlementScopeType): void {
  if (spec.configurableScopes.includes(scopeType)) return;
  throw badRequest(
    `"${spec.name}" cannot be configured at ${scopeType} level. Allowed: ${spec.configurableScopes.join(', ')}.`,
  );
}

/** Decides which tenant a write lands on and refuses cross-tenant attempts. */
function resolveWriteTenant(
  context: ActorContext,
  input: SetInput,
): { organizationId: string | null; schoolId: string | null } {
  if (context.actor.isPlatformStaff) {
    return {
      organizationId: input.organizationId ?? null,
      schoolId: input.schoolId ?? null,
    };
  }

  if (PLATFORM_ONLY_SCOPES.includes(input.scopeType)) {
    throw forbidden(
      `${input.scopeType} entitlements are set by the platform, not by a tenant. They reach beyond one school.`,
    );
  }
  if (input.isSafetyRule) {
    throw forbidden('Safety rules are defined by the platform and cannot be created by a tenant.');
  }

  const schoolId = context.actor.schoolId;
  if (!schoolId) throw forbidden('A school context is required to set an entitlement.');
  if (input.schoolId && input.schoolId !== schoolId) {
    throw forbidden('You can only set entitlements for your own school.');
  }

  return { organizationId: null, schoolId };
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Rows a tenant is allowed to see: its own, plus the platform rows above it. */
function visibilityFilter(
  context: ActorContext,
  schoolId: string | null,
  includeInherited: boolean,
): Prisma.FeatureEntitlementWhereInput {
  if (context.actor.isPlatformStaff && !schoolId) return {};

  const own: Prisma.FeatureEntitlementWhereInput[] = [{ schoolId }];
  if (includeInherited) {
    own.push({ scopeType: EntitlementScopeType.PLATFORM }, { scopeType: EntitlementScopeType.PLAN });
    if (context.actor.organizationId) own.push({ organizationId: context.actor.organizationId });
  }
  return { OR: own };
}

export async function listEntitlements(
  context: ActorContext,
  schoolId: string | null,
  query: ListQuery,
): Promise<{ items: EntitlementRow[]; totalItems: number }> {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.FeatureEntitlementWhereInput = {
    ...visibilityFilter(context, schoolId, query.includeInherited),
    ...(query.featureKey ? { featureKey: query.featureKey } : {}),
    ...(query.scopeType ? { scopeType: query.scopeType } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.featureEntitlement.findMany({
      where,
      skip,
      take,
      orderBy: [{ featureKey: 'asc' }, { scopeType: 'asc' }, { createdAt: 'asc' }],
      select: ENTITLEMENT_SELECT,
    }),
    prisma.featureEntitlement.count({ where }),
  ]);

  return { items, totalItems };
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface EntitlementWriteResult {
  entitlement: EntitlementRow;
  /** What the resolver now returns for the scope this row targets. */
  decision: FeatureDecision;
  /** True when the stored row is the rule that actually decided the outcome. */
  isEffective: boolean;
  /** Plain-language notes when the row was stored but does not yet take effect. */
  warnings: string[];
}

function explainOutcome(
  spec: FeatureSpec,
  row: EntitlementRow,
  decision: FeatureDecision,
): { isEffective: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const isEffective = decision.decidedBy === row.scopeType && decision.enabled === row.enabled;

  if (decision.decidedBy === 'PLAN_GATE') {
    const plans = plansIncluding(spec.key);
    warnings.push(
      plans.length > 0
        ? `Saved, but "${spec.name}" is not included in the current plan. It becomes available on: ${plans.join(', ')}.`
        : `Saved, but "${spec.name}" is not included in any plan yet.`,
    );
  } else if (decision.decidedBy.startsWith('SAFETY_RULE')) {
    warnings.push(
      `Saved, but a platform safety rule keeps "${spec.name}" switched off. A safety rule can be tightened by a school, never loosened.`,
    );
  } else if (decision.decidedBy === 'DEPENDENCY') {
    warnings.push(`Saved, but ${decision.reason}`);
  } else if (!isEffective) {
    warnings.push(
      `Saved, but a more specific rule decides the outcome here (${decision.decidedBy}): ${decision.reason}`,
    );
  }

  if (row.effectiveFrom && row.effectiveFrom > new Date()) {
    warnings.push(`This rule starts on ${row.effectiveFrom.toISOString().slice(0, 10)}.`);
  }

  return { isEffective, warnings };
}

/**
 * Creates or replaces the row for one (feature, scope, target) triple. There is
 * no database unique constraint across nine nullable scope columns, so the match
 * is done here — and it must be exact, or a second call would stack duplicate
 * rows that the resolver then breaks ties between by creation order.
 */
export async function setEntitlement(
  context: ActorContext,
  input: SetInput,
): Promise<EntitlementWriteResult> {
  if (!isKnownFeatureKey(input.featureKey)) {
    throw badRequest(
      `Unknown feature key: ${input.featureKey}. Only keys in the platform feature registry can be entitled.`,
    );
  }
  const spec = featureSpec(input.featureKey);
  if (!spec) throw badRequest(`Unknown feature key: ${input.featureKey}`);

  assertScopeAllowed(spec, input.scopeType);

  const tenant = resolveWriteTenant(context, input);
  await assertTargetsBelongToSchool(input, tenant.schoolId);

  const identity: Prisma.FeatureEntitlementWhereInput = {
    featureKey: input.featureKey,
    scopeType: input.scopeType,
    organizationId: tenant.organizationId,
    schoolId: tenant.schoolId,
    plan: input.plan ?? null,
    roleKey: input.roleKey ?? null,
    gradeId: input.gradeId ?? null,
    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    userGroupId: input.userGroupId ?? null,
  };

  const existing = await prisma.featureEntitlement.findFirst({
    where: identity,
    select: { id: true, enabled: true, reason: true },
  });

  const payload = {
    enabled: input.enabled,
    // `undefined` would leave the old limit in place on a re-save, which is not
    // what "I did not send a value" means for a switch. Clearing is explicit.
    value: input.value === undefined || input.value === null
      ? Prisma.DbNull
      : (input.value as Prisma.InputJsonValue),
    subscriptionId: input.subscriptionId ?? null,
    precedence: input.precedence ?? 0,
    reason: input.reason ?? null,
    isSafetyRule: input.isSafetyRule ?? false,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
  };

  const row = existing
    ? await prisma.featureEntitlement.update({
        where: { id: existing.id },
        data: payload,
        select: ENTITLEMENT_SELECT,
      })
    : await prisma.featureEntitlement.create({
        data: {
          featureKey: input.featureKey,
          scopeType: input.scopeType,
          organizationId: tenant.organizationId,
          schoolId: tenant.schoolId,
          plan: input.plan ?? null,
          roleKey: input.roleKey ?? null,
          gradeId: input.gradeId ?? null,
          classId: input.classId ?? null,
          subjectId: input.subjectId ?? null,
          userGroupId: input.userGroupId ?? null,
          createdById: context.actor.userId,
          ...payload,
        },
        select: ENTITLEMENT_SELECT,
      });

  invalidateFeatureCache(row.organizationId, row.schoolId);

  const decisions = await resolveFeatures(
    [spec.key],
    scopeOf(row, context.actor.organizationId),
  );
  const decision = decisions[spec.key];
  const { isEffective, warnings } = explainOutcome(spec, row, decision);

  recordAudit(context, {
    action: 'entitlement.set',
    targetType: 'FeatureEntitlement',
    targetId: row.id,
    summary: `${spec.key} ${row.enabled ? 'enabled' : 'disabled'} at ${row.scopeType} scope`,
    reason: row.reason,
    beforeData: existing ? { enabled: existing.enabled, reason: existing.reason } : null,
    afterData: { enabled: row.enabled, decidedBy: decision.decidedBy },
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });

  return { entitlement: row, decision, isEffective, warnings };
}

export async function deleteEntitlement(context: ActorContext, id: string): Promise<void> {
  const row = await prisma.featureEntitlement.findUnique({ where: { id }, select: ENTITLEMENT_SELECT });
  if (!row) throw notFound('Entitlement');

  if (!context.actor.isPlatformStaff) {
    if (row.isSafetyRule || PLATFORM_ONLY_SCOPES.includes(row.scopeType)) {
      throw forbidden('That rule is set by the platform and cannot be removed by a tenant.');
    }
    if (row.schoolId !== context.actor.schoolId) throw notFound('Entitlement');
  }

  await prisma.featureEntitlement.delete({ where: { id } });
  invalidateFeatureCache(row.organizationId, row.schoolId);

  recordAudit(context, {
    action: 'entitlement.delete',
    targetType: 'FeatureEntitlement',
    targetId: row.id,
    summary: `${row.featureKey} rule removed at ${row.scopeType} scope; the platform default applies again`,
    beforeData: row,
    organizationId: row.organizationId,
    schoolId: row.schoolId,
  });
}

// ── Explain and catalogue ───────────────────────────────────────────────────

export interface FeatureExplanation {
  key: string;
  name: string;
  description: string;
  category: FeatureSpec['category'];
  enabled: boolean;
  value: unknown;
  decidedBy: string;
  reason: string;
  isSafetyRule: boolean;
  /** Populated only when the plan is what is standing in the way. */
  availableOnPlans: string[] | null;
  dependsOn: string[];
}

async function organizationOf(schoolId: string | null): Promise<string | null> {
  if (!schoolId) return null;
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { organizationId: true },
  });
  if (!school) throw notFound('School');
  return school.organizationId;
}

function explain(spec: FeatureSpec, decision: FeatureDecision): FeatureExplanation {
  return {
    key: spec.key,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    enabled: decision.enabled,
    value: decision.value,
    decidedBy: decision.decidedBy,
    reason: decision.reason,
    isSafetyRule: spec.isSafetyRule ?? false,
    availableOnPlans: decision.decidedBy === 'PLAN_GATE' ? plansIncluding(spec.key) : null,
    dependsOn: spec.dependsOn ?? [],
  };
}

/**
 * Answers the question an administrator actually has: what will this person, in
 * this class, on this plan, actually see — and which rule decided it. Blueprint
 * 06 requires every visibility decision to be explainable, and this is where the
 * admin panel gets that explanation from.
 */
export async function explainFeatures(
  context: ActorContext,
  schoolId: string | null,
  input: ExplainInput,
): Promise<FeatureExplanation[]> {
  if (schoolId && !context.actor.isPlatformStaff && schoolId !== context.actor.schoolId) {
    throw forbidden('You can only explain features for your own school.');
  }

  const keys = input.featureKeys ?? FEATURE_SPECS.map((spec) => spec.key);
  const scope: FeatureScope = {
    organizationId: await organizationOf(schoolId),
    schoolId,
    roleKey: input.roleKey ?? null,
    gradeId: input.gradeId ?? null,
    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    userGroupIds: input.userGroupIds ?? [],
  };

  // Unknown keys are rejected by the resolver, so a typo cannot come back as
  // "enabled: false" and be mistaken for a real answer.
  const decisions = await resolveFeatures(keys, scope);

  const output: FeatureExplanation[] = [];
  for (const key of keys) {
    const spec = featureSpec(key);
    const decision = decisions[key];
    if (spec && decision) output.push(explain(spec, decision));
  }
  return output;
}

export interface CatalogueEntry extends FeatureExplanation {
  configurableScopes: EntitlementScopeType[];
  defaultEnabled: boolean;
  /** The school's own row, when it has one. Null means "inheriting". */
  schoolRule: { id: string; enabled: boolean; reason: string | null } | null;
}

/**
 * The admin panel's feature screen: every declared feature, what it resolves to
 * for this school, and whether the school has set it itself or is inheriting.
 */
export async function featureCatalogue(
  context: ActorContext,
  schoolId: string | null,
  query: CatalogueQuery,
): Promise<CatalogueEntry[]> {
  if (schoolId && !context.actor.isPlatformStaff && schoolId !== context.actor.schoolId) {
    throw forbidden('You can only read the feature catalogue for your own school.');
  }

  const specs = FEATURE_SPECS.filter((spec) => {
    if (query.category && spec.category !== query.category) return false;
    if (query.configurableOnly && !spec.configurableScopes.includes(EntitlementScopeType.SCHOOL)) {
      return false;
    }
    return true;
  });

  const scope: FeatureScope = { organizationId: await organizationOf(schoolId), schoolId };

  const [decisions, schoolRows] = await Promise.all([
    resolveFeatures(
      specs.map((spec) => spec.key),
      scope,
    ),
    schoolId
      ? prisma.featureEntitlement.findMany({
          where: { schoolId, scopeType: EntitlementScopeType.SCHOOL },
          select: { id: true, featureKey: true, enabled: true, reason: true },
        })
      : Promise.resolve([]),
  ]);

  const byKey = new Map(schoolRows.map((row) => [row.featureKey, row]));

  return specs.map((spec) => {
    const decision = decisions[spec.key];
    const rule = byKey.get(spec.key);
    return {
      ...explain(spec, decision),
      configurableScopes: spec.configurableScopes,
      defaultEnabled: spec.defaultEnabled,
      schoolRule: rule ? { id: rule.id, enabled: rule.enabled, reason: rule.reason } : null,
    };
  });
}
