export type GoalType =
  | 'ACTIVITIES_COMPLETED'
  | 'MINUTES_LEARNED'
  | 'TOPICS_MASTERED'
  | 'ASSIGNMENTS_ON_TIME'
  | 'ACCURACY_PERCENT'
  | 'STREAK_DAYS';
export type MissionStatus = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';

export interface MissionDefinition {
  id: string;
  key: string;
  title: string;
  description: string | null;
  goalType: GoalType;
  goalLabel: string;
  goalTarget: number;
  pointsReward: number;
  rewardBadgeId: string | null;
  topicId: string | null;
  classId: string | null;
  isRecurring: boolean;
  isActive: boolean;
}

export interface MissionProgressRow {
  id: string;
  missionId: string;
  studentId: string;
  status: MissionStatus;
  progressValue: number;
  goalTarget: number;
  percent: number;
  periodStart: string | null;
  periodEnd: string | null;
  expiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  pointsAwarded: number | null;
  badgeAwarded: boolean;
  seenAt: string | null;
  student: { id: string; displayName: string };
  mission: {
    id: string;
    key: string;
    title: string;
    description: string | null;
    goalType: GoalType;
    goalLabel: string;
    pointsReward: number;
    rewardBadgeId: string | null;
    topicId: string | null;
    classId: string | null;
    isRecurring: boolean;
  };
}

export interface MyMissions {
  studentId: string;
  items: MissionProgressRow[];
  counts: { active: number; notStarted: number; completed: number; unseen: number };
}

export interface MissionSummary {
  studentId: string;
  active: number;
  notStarted: number;
  completed: number;
  unseen: number;
  expired: number;
}
