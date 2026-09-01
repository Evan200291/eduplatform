import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CatalogueEntry,
  EntitlementListQuery,
  EntitlementRow,
  EntitlementWriteResult,
  FeatureCatalogueQuery,
  FeatureDefinition,
  FeatureDefinitionQuery,
  FeatureExplanation,
} from './entitlements.types';

/**
 * Platform feature registry + school entitlements.
 *
 * The registry (`/platform/features`) is a projection of code — only its
 * presentation fields are editable. `/entitlements` is where a school (or,
 * for platform-only scopes, the platform) actually turns a feature on or off.
 */

// ── Platform feature registry (requires `platform.features.*`) ─────────────

export function fetchFeatureRegistry(
  query?: FeatureDefinitionQuery,
): Promise<{ features: FeatureDefinition[] }> {
  return apiGet('/platform/features', { params: query });
}
export function fetchFeatureDefinition(key: string): Promise<FeatureDefinition> {
  return apiGet<FeatureDefinition>(`/platform/features/${encodeURIComponent(key)}`);
}
export function updateFeatureDefinition(
  key: string,
  input: Record<string, unknown>,
): Promise<FeatureDefinition> {
  return apiPatch<FeatureDefinition>(`/platform/features/${encodeURIComponent(key)}`, input);
}
/** Mirrors the code registry into the table. Idempotent. */
export function syncFeatureRegistry(): Promise<{ created: number; updated: number; retired: string[] }> {
  return apiPost('/platform/features/sync');
}

// ── School entitlements (requires `entitlement.*`) ──────────────────────────

/** Every declared feature and what it resolves to for a school — the Features screen. */
export function fetchFeatureCatalogue(query?: FeatureCatalogueQuery): Promise<{ features: CatalogueEntry[] }> {
  return apiGet('/entitlements/features', { params: query });
}

export function explainFeatures(input: Record<string, unknown>): Promise<{ features: FeatureExplanation[] }> {
  return apiPost('/entitlements/explain', input);
}

export function fetchEntitlements(query?: EntitlementListQuery): Promise<Paginated<EntitlementRow>> {
  return apiGetPaged<EntitlementRow>('/entitlements', query);
}

export function setEntitlement(input: Record<string, unknown>): Promise<EntitlementWriteResult> {
  return apiPut<EntitlementWriteResult>('/entitlements', input);
}

export function deleteEntitlement(id: string): Promise<void> {
  return apiDelete(`/entitlements/${encodeURIComponent(id)}`);
}
