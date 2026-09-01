import { apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CompanionEvent,
  CompanionResult,
  CompanionSummary,
  GrowthConfig,
  InteractResult,
  SpeciesKey,
} from './companion.types';

/**
 * The learner's companion. There is deliberately no delete/reset endpoint —
 * growth never regresses, by design (blueprint §03: no punishment mechanics).
 */

export function fetchSpecies(): Promise<{ species: SpeciesKey[] }> {
  return apiGet('/companion/species');
}

export function fetchMyCompanion(studentId?: string): Promise<CompanionResult> {
  return apiGet<CompanionResult>('/companion', { params: { studentId } });
}

export function fetchCompanionSummary(studentId?: string): Promise<CompanionSummary> {
  return apiGet<CompanionSummary>('/companion/summary', { params: { studentId } });
}

export function adoptCompanion(input: {
  studentId?: string;
  speciesKey: SpeciesKey;
  name: string;
}): Promise<CompanionResult> {
  return apiPost<CompanionResult>('/companion', input);
}

export function updateCompanion(input: {
  studentId?: string;
  name?: string;
  appearance?: unknown;
  accessories?: unknown;
}): Promise<CompanionResult> {
  return apiPatch<CompanionResult>('/companion', input);
}

export function interactWithCompanion(
  kind: 'GREET' | 'PLAY' | 'PRAISE' = 'GREET',
  studentId?: string,
): Promise<InteractResult> {
  return apiPost<InteractResult>('/companion/interact', { kind, studentId });
}

export function fetchCompanionEvents(studentId?: string): Promise<Paginated<CompanionEvent>> {
  return apiGetPaged<CompanionEvent>('/companion/events', { studentId });
}

export function acknowledgeCompanionEvents(studentId?: string): Promise<{ seen: number }> {
  return apiPost('/companion/events/seen', { studentId });
}

/**
 * The stage-growth thresholds this school currently uses (`companion.config`).
 * Existing companions are unaffected by a change; only future stage checks see it.
 */
export function fetchGrowthConfig(): Promise<GrowthConfig> {
  return apiGet<GrowthConfig>('/companion/growth-config');
}
export function updateGrowthConfig(
  thresholds: { stage: string; growthPoints: number }[],
): Promise<GrowthConfig> {
  return apiPut<GrowthConfig>('/companion/growth-config', { thresholds });
}
