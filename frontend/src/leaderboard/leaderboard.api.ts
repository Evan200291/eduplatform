import { apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  BoardDetail,
  BoardSummary,
  LeaderboardConfigInput,
  LeaderboardScope,
  MyStandings,
} from './leaderboard.types';

/**
 * Leaderboards — off by default per school setting. Identity is always a
 * precomputed `label` string; no raw name ever comes back for another
 * student's row, regardless of identity mode.
 */

export function fetchMyStandings(studentId?: string): Promise<MyStandings> {
  return apiGet<MyStandings>('/leaderboards/mine', { params: { studentId } });
}

export interface LeaderboardListQuery {
  page?: number;
  pageSize?: number;
  scope?: LeaderboardScope;
  scopeId?: string;
  activeOnly?: boolean;
  includeArchived?: boolean;
}

/** School-admin view: every board a school has defined, including inactive/archived ones. */
export function fetchLeaderboards(query?: LeaderboardListQuery): Promise<Paginated<BoardSummary>> {
  return apiGetPaged<BoardSummary>('/leaderboards', query);
}

export function fetchLeaderboard(boardId: string): Promise<BoardDetail> {
  return apiGet<BoardDetail>(`/leaderboards/${encodeURIComponent(boardId)}`);
}

/** Student-only: hide or reveal your own row on a board. */
export function setLeaderboardOptOut(
  boardId: string,
  hidden: boolean,
): Promise<{ configId: string; studentId: string; optedOut: boolean; entriesUpdated: number }> {
  return apiPost(`/leaderboards/${encodeURIComponent(boardId)}/opt-out`, { hidden });
}

/** Requires `leaderboard.config`. A new board always arrives with `isActive: false`. */
export function createLeaderboard(input: LeaderboardConfigInput): Promise<BoardSummary> {
  return apiPost<BoardSummary>('/leaderboards', input);
}

/** Requires `leaderboard.config`. Also the switch that publishes a board (`isActive`). */
export function updateLeaderboard(
  boardId: string,
  input: Partial<LeaderboardConfigInput> & { isActive?: boolean },
): Promise<BoardSummary> {
  return apiPatch<BoardSummary>(`/leaderboards/${encodeURIComponent(boardId)}`, input);
}

export function recomputeLeaderboard(boardId: string): Promise<{ ranked: number }> {
  return apiPost(`/leaderboards/${encodeURIComponent(boardId)}/recompute`);
}
export function archiveLeaderboard(boardId: string): Promise<BoardSummary> {
  return apiPost<BoardSummary>(`/leaderboards/${encodeURIComponent(boardId)}/archive`);
}
