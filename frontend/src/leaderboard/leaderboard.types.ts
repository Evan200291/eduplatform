// Mirrors backend/prisma/schema/03-enums-engagement.prisma and
// backend/src/modules/leaderboard/leaderboard.validation.ts exactly.
export type LeaderboardScope = 'CLASS' | 'GRADE' | 'SUBJECT' | 'COHORT' | 'SCHOOL' | 'EVENT';
export type LeaderboardIdentityMode = 'REAL_NAME' | 'NICKNAME' | 'AVATAR_ONLY' | 'ANONYMOUS_RANK';
export type LeaderboardRankingMode =
  | 'POINTS'
  | 'MASTERY_GAIN'
  | 'ACTIVITY_COUNT'
  | 'PERSONAL_BEST'
  | 'COOPERATIVE_TEAM';

/** A scope of CLASS/GRADE/SUBJECT/COHORT needs a `scopeId`; SCHOOL and EVENT may go without one. */
export const LEADERBOARD_SCOPES_NEEDING_ID: LeaderboardScope[] = ['CLASS', 'GRADE', 'SUBJECT', 'COHORT'];

export interface BoardSummary {
  id: string;
  name: string;
  scope: LeaderboardScope;
  scopeId: string | null;
  identityMode: LeaderboardIdentityMode;
  rankingMode: LeaderboardRankingMode;
  isActive: boolean;
  periodDays: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  showTopN: number;
  minParticipants: number;
  allowOptOut?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  archivedAt?: string | null;
  participantCount?: number;
}

/** Shape accepted by `POST /leaderboards` and, partial, by `PATCH /leaderboards/:id`. */
export interface LeaderboardConfigInput {
  name: string;
  scope: LeaderboardScope;
  scopeId?: string | null;
  identityMode: LeaderboardIdentityMode;
  rankingMode: LeaderboardRankingMode;
  periodDays?: number | null;
  minParticipants?: number;
  showTopN?: number;
  allowOptOut?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface StandingRow {
  rank: number;
  previousRank: number | null;
  movement: number | null;
  score: number;
  label: string;
  isMe?: boolean;
  optedOut?: boolean;
}

export interface MyStandings {
  studentId: string;
  standings: { board: BoardSummary; rank: number; previousRank: number | null; movement: number | null; score: number; label: string; optedOut: boolean }[];
}

export interface BoardDetail {
  board: BoardSummary;
  standings: StandingRow[];
  mine: StandingRow | null;
  hiddenReason: 'TOO_FEW_PARTICIPANTS' | null;
}
