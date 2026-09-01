import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/gamification` — points, badges, streaks, rewards. */

export type PointsReason = string;
export type BadgeTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'SPECIAL';
export type StreakKind = 'DAILY_LEARNING' | 'WEEKLY_LEARNING' | 'ASSIGNMENT_ON_TIME' | 'ACCURACY';
export type RewardKind =
  | 'COSMETIC_ITEM'
  | 'COMPANION_ACCESSORY'
  | 'AVATAR_ITEM'
  | 'THEME_UNLOCK'
  | 'CERTIFICATE'
  | 'TEACHER_RECOGNITION';

export interface PointsLedgerEntry {
  id: string;
  studentId: string;
  reason: PointsReason;
  points: number;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  reversedAt: string | null;
  awardedById: string | null;
  occurredAt: string;
  createdAt: string;
  student: { id: string; displayName: string; firstName: string; lastName: string };
}

export interface PointsSummary {
  studentId: string;
  balance: number;
  earnedThisWeek: number;
  byReason: { reason: string; points: number; entries: number }[];
  recent: PointsLedgerEntry[];
}

export interface BadgeCatalogueRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: BadgeTier;
  pointsValue: number;
  sortOrder: number;
  isActive: boolean;
  recognisesEffort: boolean;
  criteriaLabel: string | null;
  iconMediaId: string | null;
  iconKey: string | null;
  archivedAt: string | null;
  mine?: { earned: boolean; awardedAt: string | null; revokedAt: string | null; seenAt: string | null };
  _count?: { awards: number };
}

export interface StudentBadgeAward {
  id: string;
  studentId: string;
  badgeId: string;
  awardedAt: string;
  awardedById: string | null;
  reason: string | null;
  revokedAt: string | null;
  seenAt: string | null;
  badge: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    tier: BadgeTier;
    pointsValue: number;
    recognisesEffort: boolean;
    criteriaLabel: string | null;
    iconMediaId: string | null;
    iconKey: string | null;
  };
}

export interface BadgeProgress {
  studentId: string;
  earned: StudentBadgeAward[];
  unseen: number;
  available: BadgeCatalogueRow[];
}

export interface StreakReading {
  kind: StreakKind;
  currentLength: number;
  longestLength: number;
  lastQualifiedOn: string | null;
  startedOn: string | null;
  freezesRemaining: number;
  qualifiedThisPeriod: boolean;
  atRisk: boolean;
}

/** The three streak-behavior knobs a school may configure (`gamification.config`). */
export interface StreakConfig {
  defaultFreezes: number;
  weekendsCount: boolean;
  maxFreezes: number | null;
}

export interface RewardCatalogueRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: RewardKind;
  pointsCost: number;
  payload: unknown;
  sortOrder: number;
  isActive: boolean;
  ageMode: string | null;
  previewMediaId: string | null;
  mine?: { owned: boolean; isEquipped: boolean; unlockedAt: string | null; affordable: boolean };
}

export interface StudentRewardGrant {
  id: string;
  studentId: string;
  rewardId: string;
  unlockedAt: string;
  isEquipped: boolean;
  equippedAt: string | null;
  pointsSpent: number;
  reward: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    kind: RewardKind;
    pointsCost: number;
    payload: unknown;
    previewMediaId: string | null;
    ageMode: string | null;
  };
}

export interface GamificationProfile {
  studentId: string;
  points: {
    balance: number;
    earnedThisWeek: number;
    byReason: { reason: string; points: number; entries: number }[];
    recent: PointsLedgerEntry[];
  };
  badges: { earned: StudentBadgeAward[]; unseen: number; available: BadgeCatalogueRow[] };
  streaks: StreakReading[];
  equipped: StudentRewardGrant[];
}

export interface LedgerListQuery extends ListQuery {
  studentId?: string;
  reason?: string;
}
export interface BadgeListQuery extends ListQuery {
  withMine?: boolean;
}
export interface RewardListQuery extends ListQuery {
  affordableOnly?: boolean;
  withMine?: boolean;
}
