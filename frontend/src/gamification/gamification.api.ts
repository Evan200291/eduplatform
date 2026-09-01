import { apiGet, apiGetPaged, apiPost, apiPut } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  BadgeCatalogueRow,
  BadgeListQuery,
  BadgeProgress,
  GamificationProfile,
  LedgerListQuery,
  PointsLedgerEntry,
  PointsSummary,
  RewardCatalogueRow,
  RewardListQuery,
  StreakConfig,
  StreakReading,
  StudentBadgeAward,
  StudentRewardGrant,
} from './gamification.types';

/** Points, badges, streaks, rewards. Reads are `*.read`; writes are staff-only. */

/** The whole achievements screen in one call. */
export function fetchGamificationProfile(studentId?: string): Promise<GamificationProfile> {
  return apiGet<GamificationProfile>('/gamification/profile', { params: { studentId } });
}

// ── Points ────────────────────────────────────────────────────────────────

export function fetchPointsLedger(query?: LedgerListQuery): Promise<Paginated<PointsLedgerEntry>> {
  return apiGetPaged<PointsLedgerEntry>('/gamification/points/ledger', query);
}
export function fetchPointsSummary(studentId?: string): Promise<PointsSummary> {
  return apiGet<PointsSummary>('/gamification/points/summary', { params: { studentId } });
}
export function fetchPointsBalance(studentId?: string): Promise<{ studentId: string; balance: number }> {
  return apiGet('/gamification/points/balance', { params: { studentId } });
}
export function awardPoints(input: {
  studentId: string;
  reason: string;
  points: number;
  note?: string;
}): Promise<PointsLedgerEntry> {
  return apiPost<PointsLedgerEntry>('/gamification/points/award', input);
}
export function adjustPoints(input: {
  studentId: string;
  points: number;
  note: string;
}): Promise<PointsLedgerEntry> {
  return apiPost<PointsLedgerEntry>('/gamification/points/adjust', input);
}
export function reversePointsEntry(entryId: string): Promise<PointsLedgerEntry> {
  return apiPost<PointsLedgerEntry>(`/gamification/points/ledger/${encodeURIComponent(entryId)}/reverse`);
}

// ── Badges ────────────────────────────────────────────────────────────────

export function fetchBadges(query?: BadgeListQuery): Promise<Paginated<BadgeCatalogueRow>> {
  return apiGetPaged<BadgeCatalogueRow>('/gamification/badges', query);
}
export function fetchBadge(badgeId: string): Promise<BadgeCatalogueRow> {
  return apiGet<BadgeCatalogueRow>(`/gamification/badges/${encodeURIComponent(badgeId)}`);
}
export function fetchMyBadgeAwards(studentId?: string): Promise<Paginated<StudentBadgeAward>> {
  return apiGetPaged<StudentBadgeAward>('/gamification/badges/awards', { studentId });
}
export function markBadgesSeen(studentId?: string): Promise<{ marked: number }> {
  return apiPost('/gamification/badges/awards/seen', { studentId });
}
export function fetchBadgeProgress(studentId?: string): Promise<BadgeProgress> {
  return apiGet<BadgeProgress>('/gamification/badges/progress', { params: { studentId } });
}
export function createBadge(input: Record<string, unknown>): Promise<BadgeCatalogueRow> {
  return apiPost<BadgeCatalogueRow>('/gamification/badges', input);
}
export function awardBadge(badgeId: string, studentId: string, reason?: string): Promise<StudentBadgeAward> {
  return apiPost<StudentBadgeAward>(`/gamification/badges/${encodeURIComponent(badgeId)}/award`, {
    studentId,
    reason,
  });
}
export function revokeBadge(badgeId: string, studentId: string): Promise<void> {
  return apiPost(`/gamification/badges/${encodeURIComponent(badgeId)}/revoke`, { studentId });
}
export function archiveBadge(badgeId: string): Promise<BadgeCatalogueRow> {
  return apiPost<BadgeCatalogueRow>(`/gamification/badges/${encodeURIComponent(badgeId)}/archive`);
}

// ── Streaks ───────────────────────────────────────────────────────────────

export function fetchMyStreaks(studentId?: string): Promise<{ studentId: string; asOf: string; streaks: StreakReading[] }> {
  return apiGet('/gamification/streaks/mine', { params: { studentId } });
}
export function freezeStreak(input: {
  studentId: string;
  kind: string;
  reason: string;
  freezes?: number;
}): Promise<StreakReading> {
  return apiPost<StreakReading>('/gamification/streaks/freeze', input);
}

/**
 * Behavior config: grace-period freezes, whether weekends count, the freeze cap.
 * `gamification.config` — the same grant that manages badges and rewards.
 */
export function fetchStreakConfig(): Promise<StreakConfig> {
  return apiGet<StreakConfig>('/gamification/streaks/config');
}
export function updateStreakConfig(input: StreakConfig): Promise<StreakConfig> {
  return apiPut<StreakConfig>('/gamification/streaks/config', input);
}

// ── Rewards ───────────────────────────────────────────────────────────────

export function fetchRewards(query?: RewardListQuery): Promise<Paginated<RewardCatalogueRow>> {
  return apiGetPaged<RewardCatalogueRow>('/gamification/rewards', query);
}
export function fetchMyRewards(studentId?: string): Promise<Paginated<StudentRewardGrant>> {
  return apiGetPaged<StudentRewardGrant>('/gamification/rewards/mine', { studentId });
}
export function redeemReward(
  rewardId: string,
  input?: { studentId?: string; equip?: boolean },
): Promise<{ grant: StudentRewardGrant; balance: number }> {
  return apiPost(`/gamification/rewards/${encodeURIComponent(rewardId)}/redeem`, input ?? {});
}
export function equipReward(
  rewardId: string,
  input?: { studentId?: string; equip?: boolean },
): Promise<StudentRewardGrant> {
  return apiPost<StudentRewardGrant>(`/gamification/rewards/${encodeURIComponent(rewardId)}/equip`, input ?? {});
}
export function createReward(input: Record<string, unknown>): Promise<RewardCatalogueRow> {
  return apiPost<RewardCatalogueRow>('/gamification/rewards', input);
}
export function grantReward(rewardId: string, studentId: string): Promise<StudentRewardGrant> {
  return apiPost<StudentRewardGrant>(`/gamification/rewards/${encodeURIComponent(rewardId)}/grant`, {
    studentId,
  });
}
export function archiveReward(rewardId: string): Promise<RewardCatalogueRow> {
  return apiPost<RewardCatalogueRow>(`/gamification/rewards/${encodeURIComponent(rewardId)}/archive`);
}

export function fetchGamificationConfig(): Promise<unknown> {
  return apiGet('/gamification/config');
}
