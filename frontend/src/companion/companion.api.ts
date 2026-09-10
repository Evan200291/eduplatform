import { apiGet, apiGetPaged, apiPatch, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CompanionEvent,
  CompanionRosterRow,
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

// ── Staff ─────────────────────────────────────────────────────────────────

/** Who has a buddy and who has gone quiet; a teacher sees only their classes. */
export function fetchCompanionRoster(query?: {
  classId?: string;
  quietOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<CompanionRosterRow>> {
  return apiGetPaged<CompanionRosterRow>('/companion/roster', query);
}

/**
 * Growth for learning that happened off-screen. Learners without a buddy are
 * skipped, never given one — choosing it is the child's moment.
 */
export function grantCompanionGrowth(input: {
  studentIds: string[];
  growthPoints: number;
  note: string;
}): Promise<{ granted: number; skipped: number; stageChanges: number }> {
  return apiPost('/companion/grant', input);
}
