import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  CurriculumListQuery,
  CurriculumProgram,
  CurriculumTopic,
  CurriculumUnit,
  LearningObjective,
} from './curriculum.types';

/**
 * Curriculum endpoints — programs, units, topics, objectives.
 *
 * Read-only for students (`curriculum.read`); the write side backs the Admin
 * Curriculum screen. Every list follows the same shape, so one generic pair of
 * helpers covers all four resources instead of four near-identical functions.
 */

const RESOURCE = {
  programs: '/curriculum/programs',
  units: '/curriculum/units',
  topics: '/curriculum/topics',
  objectives: '/curriculum/objectives',
} as const;

export function fetchPrograms(query?: CurriculumListQuery): Promise<Paginated<CurriculumProgram>> {
  return apiGetPaged<CurriculumProgram>(RESOURCE.programs, query);
}
export function fetchProgram(id: string): Promise<CurriculumProgram> {
  return apiGet<CurriculumProgram>(`${RESOURCE.programs}/${encodeURIComponent(id)}`);
}
export function createProgram(input: Record<string, unknown>): Promise<CurriculumProgram> {
  return apiPost<CurriculumProgram>(RESOURCE.programs, input);
}
export function updateProgram(id: string, input: Record<string, unknown>): Promise<CurriculumProgram> {
  return apiPatch<CurriculumProgram>(`${RESOURCE.programs}/${encodeURIComponent(id)}`, input);
}
export function setProgramStatus(id: string, status: string, reason?: string): Promise<CurriculumProgram> {
  return apiPost<CurriculumProgram>(`${RESOURCE.programs}/${encodeURIComponent(id)}/status`, { status, reason });
}

export function fetchUnits(query?: CurriculumListQuery): Promise<Paginated<CurriculumUnit>> {
  return apiGetPaged<CurriculumUnit>(RESOURCE.units, query);
}
export function fetchUnit(id: string): Promise<CurriculumUnit> {
  return apiGet<CurriculumUnit>(`${RESOURCE.units}/${encodeURIComponent(id)}`);
}
export function createUnit(input: Record<string, unknown>): Promise<CurriculumUnit> {
  return apiPost<CurriculumUnit>(RESOURCE.units, input);
}
export function updateUnit(id: string, input: Record<string, unknown>): Promise<CurriculumUnit> {
  return apiPatch<CurriculumUnit>(`${RESOURCE.units}/${encodeURIComponent(id)}`, input);
}
export function setUnitStatus(id: string, status: string, reason?: string): Promise<CurriculumUnit> {
  return apiPost<CurriculumUnit>(`${RESOURCE.units}/${encodeURIComponent(id)}/status`, { status, reason });
}

export function fetchTopics(query?: CurriculumListQuery): Promise<Paginated<CurriculumTopic>> {
  return apiGetPaged<CurriculumTopic>(RESOURCE.topics, query);
}
export function fetchTopic(id: string): Promise<CurriculumTopic> {
  return apiGet<CurriculumTopic>(`${RESOURCE.topics}/${encodeURIComponent(id)}`);
}
export function createTopic(input: Record<string, unknown>): Promise<CurriculumTopic> {
  return apiPost<CurriculumTopic>(RESOURCE.topics, input);
}
export function updateTopic(id: string, input: Record<string, unknown>): Promise<CurriculumTopic> {
  return apiPatch<CurriculumTopic>(`${RESOURCE.topics}/${encodeURIComponent(id)}`, input);
}
export function setTopicStatus(id: string, status: string, reason?: string): Promise<CurriculumTopic> {
  return apiPost<CurriculumTopic>(`${RESOURCE.topics}/${encodeURIComponent(id)}/status`, { status, reason });
}

export function fetchObjectives(query?: CurriculumListQuery): Promise<Paginated<LearningObjective>> {
  return apiGetPaged<LearningObjective>(RESOURCE.objectives, query);
}
export function createObjective(input: Record<string, unknown>): Promise<LearningObjective> {
  return apiPost<LearningObjective>(RESOURCE.objectives, input);
}
export function updateObjective(id: string, input: Record<string, unknown>): Promise<LearningObjective> {
  return apiPatch<LearningObjective>(`${RESOURCE.objectives}/${encodeURIComponent(id)}`, input);
}
