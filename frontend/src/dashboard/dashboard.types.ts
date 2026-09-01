/** Mirrors `backend/src/modules/dashboard` — one aggregate call per surface home screen. */

export interface LearnerAction {
  kind: string;
  label: string;
  path: string;
  reason?: string;
}

export interface LearnerDashboard {
  generatedAt: string;
  studentId: string;
  isOwnDashboard: boolean;
  learner: { displayName: string; nickname: string | null; gradeId: string | null };
  onboarding: { onboardingCompletedAt: string | null; screeningCompletedAt: string | null };
  nextAction: LearnerAction | null;
  engagement: unknown;
  weeklyGoal: unknown;
  learning: {
    lessonsCompleted: number;
    activitiesInProgress: number;
    topicsMastered: number;
    topicsToPractise: number;
  };
  assignments: { open: number; overdue: number; dueSoon: number };
  missions: { active: number; completed: number; nearestGoal: { missionId: string; title: string; progressValue: number; goalTarget: number } | null } | null;
  rewards: { points: number; badges: number; unseenBadges: number } | null;
  streak: { kind: string; currentLength: number; longestLength: number } | null;
  companion: { name: string; speciesKey: string; stage: string; mood: string; level: number; growthPoints: number } | null;
  recentAchievement: { label: string; earnedAt: string } | null;
  notifications: { unread: number; highPriority: number };
}

/** `GET /dashboard/teacher` — blueprint §04, mirrors `dashboard.teacher.service.ts` `TeacherDashboard`. */
export interface StudentSignal {
  reason: string;
  kind: 'CONCERN' | 'CELEBRATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  label: string;
  count: number;
  interpretation: string;
  nextAction: string;
}

export interface AttentionEntry {
  studentId: string;
  displayName: string;
  engagementLabel: string;
  headline: StudentSignal | null;
  signals: StudentSignal[];
}

export interface TeacherDashboard {
  generatedAt: string;
  scope: { classId: string | null; className: string | null; studentCount: number };
  classes: { classId: string; name: string; code: string; gradeId: string; studentCount: number }[];
  engagement: { level: string; label: string; count: number }[];
  attention: { total: number; shown: number; students: AttentionEntry[] };
  celebrations: AttentionEntry[];
  assignments: {
    completion: { band: string; percent: number | null; label: string };
    published: number;
    overdueAttempts: number;
    dueThisWeek: number;
    awaitingMarking: number;
  };
  masteryGaps: { topicId: string; topicName: string; learners: number }[];
  recommendations: { pending: number; deferred: number; dueForAutoApproval: number; byOrigin: { origin: string; count: number }[] };
  followUps: { due: number; overdue: number };
  notifications: { unread: number };
}

/** `GET /dashboard/attention` — the full list behind the teacher dashboard's attention card. */
export interface AttentionListResult {
  items: AttentionEntry[];
  totalItems: number;
}

export interface DashboardDispatch {
  view: 'SCHOOL' | 'TEACHER' | 'LEARNER';
  path: string;
  availableViews: string[];
}

/** `GET /dashboard/school` — the admin panel's Overview screen. */
export interface SchoolDashboard {
  generatedAt: string;
  school: { id: string; name: string; code: string; status: string };
  scope: { gradeId: string | null; learnerCount: number };
  people: { students: number; teachers: number; staff: number; invited: number; suspended: number };
  structure: {
    grades: number;
    subjects: number;
    classes: number;
    activeTerm: { id: string; name: string; endsAt: string | null } | null;
    learnersWithoutClass: number;
  };
  engagement: {
    activeThisWeek: number;
    buckets: Array<{ level: string; label: string; count: number }>;
    needingAttention: number;
  };
  learning: {
    completion: { band: string; percent: number | null; label: string };
    masteryGaps: Array<{ topicId: string; topicName: string; learners: number }>;
    screeningOutstanding: number;
    onboardingOutstanding: number;
  };
  content: Array<{ status: string; topics: number; lessons: number; activities: number }>;
  waiting: {
    recommendations: unknown;
    pathsAwaitingApproval: number;
    submissionsAwaitingMarking: number;
    openSupportTickets: number;
  };
  features: Record<string, boolean>;
  subscription: {
    plan: string;
    status: string;
    endsAt: string | null;
    seats: {
      studentsLicensed: number;
      studentsUsed: number;
      studentsRemaining: number | null;
      teachersLicensed: number;
      teachersUsed: number;
      teachersRemaining: number | null;
      overStudentSeats: boolean;
      overTeacherSeats: boolean;
    } | null;
  } | null;
}
