import type { ListQuery } from '@/api/types';

/**
 * Mirrors `backend/src/modules/platform` (feature registry) and
 * `backend/src/modules/subscription` (entitlements) — the two halves of
 * blueprint 06's "nothing can be toggled that is not first declared".
 */

export type FeatureCategory =
  | 'learning'
  | 'assessment'
  | 'gamification'
  | 'communication'
  | 'reporting'
  | 'administration'
  | 'safety'
  | 'commercial';

export type EntitlementScopeType =
  | 'PLATFORM'
  | 'PLAN'
  | 'ORGANIZATION'
  | 'SCHOOL'
  | 'ROLE'
  | 'GRADE'
  | 'CLASS'
  | 'SUBJECT'
  | 'USER_GROUP';

// ── Platform feature registry ───────────────────────────────────────────────

export interface FeatureDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
  isSafetyRule: boolean;
  configurableScopes: EntitlementScopeType[];
  includedInPlans: string[] | null;
  dependsOn: string[] | null;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** False when the table holds a key that code no longer declares. */
  declaredInCode: boolean;
}

export interface FeatureDefinitionQuery {
  category?: FeatureCategory;
  plan?: string;
  scope?: EntitlementScopeType;
  includeHidden?: boolean;
}

// ── School entitlements ─────────────────────────────────────────────────────

export interface EntitlementRow {
  id: string;
  featureKey: string;
  scopeType: EntitlementScopeType;
  enabled: boolean;
  value: unknown;
  organizationId: string | null;
  schoolId: string | null;
  subscriptionId: string | null;
  plan: string | null;
  roleKey: string | null;
  gradeId: string | null;
  classId: string | null;
  subjectId: string | null;
  userGroupId: string | null;
  precedence: number;
  reason: string | null;
  isSafetyRule: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementListQuery extends ListQuery {
  featureKey?: string;
  scopeType?: EntitlementScopeType;
  includeInherited?: boolean;
}

/** What the resolver returns for a scope — which rule decided, and why. */
export interface FeatureDecision {
  enabled: boolean;
  value: unknown;
  decidedBy: string;
  reason: string;
}

export interface FeatureExplanation {
  key: string;
  name: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean;
  value: unknown;
  decidedBy: string;
  reason: string;
  isSafetyRule: boolean;
  availableOnPlans: string[] | null;
  dependsOn: string[];
}

/** The Features screen: every declared feature and what this school resolves to. */
export interface CatalogueEntry extends FeatureExplanation {
  configurableScopes: EntitlementScopeType[];
  defaultEnabled: boolean;
  /** The school's own row, when it has one. Null means "inheriting". */
  schoolRule: { id: string; enabled: boolean; reason: string | null } | null;
}

export interface FeatureCatalogueQuery {
  category?: FeatureCategory;
  configurableOnly?: boolean;
}

export interface EntitlementWriteResult {
  entitlement: EntitlementRow;
  decision: FeatureDecision;
  isEffective: boolean;
  warnings: string[];
}
