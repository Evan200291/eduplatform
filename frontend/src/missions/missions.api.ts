import { apiGet, apiGetPaged, apiPost } from '@/api';
import type { ListQuery, Paginated } from '@/api/types';
import type {
  MissionDefinition,
  MissionProgressRow,
  MissionSummary,
  MyMissions,
} from './missions.types';

/** Missions — short-term goals layered on top of ordinary learning activity. */

export function fetchMyMissions(studentId?: string, includeCompleted = true): Promise<MyMissions> {
  return apiGet<MyMissions>('/missions/mine', { params: { studentId, includeCompleted } });
}

export function fetchMissionSummary(studentId?: string): Promise<MissionSummary> {
  return apiGet<MissionSummary>('/missions/summary', { params: { studentId } });
}

/** Re-measures mission progress right now, rather than waiting for the next scheduled pass. */
export function refreshMissionProgress(input?: {
  studentId?: string;
  missionId?: string;
  note?: string;
}): Promise<{ studentId: string; examined: number; changed: number; completed: string[] }> {
  return apiPost('/missions/refresh', input ?? {});
}

export function acknowledgeMissionProgress(studentId?: string): Promise<{ seen: number }> {
  return apiPost('/missions/progress/seen', { studentId });
}

export function fetchMissionProgress(query?: {
  missionId?: string;
  classId?: string;
  status?: string;
}): Promise<Paginated<MissionProgressRow>> {
  return apiGetPaged<MissionProgressRow>('/missions/progress', query);
}

export function fetchMissions(query?: ListQuery): Promise<Paginated<MissionDefinition>> {
  return apiGetPaged<MissionDefinition>('/missions', query);
}
export function fetchMission(missionId: string): Promise<MissionDefinition> {
  return apiGet<MissionDefinition>(`/missions/${encodeURIComponent(missionId)}`);
}
export function createMission(input: Record<string, unknown>): Promise<MissionDefinition> {
  return apiPost<MissionDefinition>('/missions', input);
}
export function archiveMission(missionId: string): Promise<MissionDefinition> {
  return apiPost<MissionDefinition>(`/missions/${encodeURIComponent(missionId)}/archive`);
}
export function enrolInMission(missionId: string, studentId: string): Promise<MissionProgressRow> {
  return apiPost<MissionProgressRow>(`/missions/${encodeURIComponent(missionId)}/enrol`, { studentId });
}
