// ─────────────────────────────────────────────────────────────────────────────
// Platform overview (blueprint 05)
// One screen for the platform owner: how much of the platform is in use, what
// is commercially live, and what is currently going wrong. Every number here is
// a count — no personal data crosses this boundary, because the audience for
// this page is running a business, not looking at children's work.
//
// The queries are deliberately independent and run together. Nothing here is
// worth a join, and a slow aggregate on one table should not delay the rest.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey, SubscriptionStatus, SupportStatus, TenantStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { OPEN_INCIDENT_STATUSES } from './platform.constants';
import { jobHealthReport } from './platform.operations.service';

const DAY_MS = 86_400_000;

export interface PlatformOverview {
  generatedAt: Date;
  tenancy: {
    organizations: number;
    schools: number;
    activeSchools: number;
    classes: number;
  };
  people: {
    total: number;
    byStatus: { status: UserStatus; count: number }[];
    activeStudents: number;
    activeTeachers: number;
  };
  commercial: {
    byPlan: { plan: string; count: number }[];
    byStatus: { status: SubscriptionStatus; count: number }[];
    expiringWithin30Days: number;
    pastDue: number;
  };
  content: {
    lessons: number;
    publishedLessons: number;
    activities: number;
    questions: number;
  };
  engagement: {
    activeLast7Days: number;
    lessonCompletionsLast7Days: number;
    assignmentsOpen: number;
  };
  operations: {
    openIncidents: number;
    dataAffectedIncidents: number;
    openSupportRequests: number;
    unhealthyJobs: number;
  };
}

/**
 * Blueprint 05 asks the platform owner to see adoption, commercial state and
 * operational health in one place. Each block below answers one of those.
 */
export async function platformOverview(now = new Date()): Promise<PlatformOverview> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);

  const [
    organizations,
    schools,
    activeSchools,
    classes,
    usersTotal,
    usersByStatus,
    activeStudents,
    activeTeachers,
    subsByPlan,
    subsByStatus,
    expiringSoon,
    pastDue,
    lessons,
    publishedLessons,
    activities,
    questions,
    activeUsers,
    completions,
    assignmentsOpen,
    openIncidents,
    dataAffected,
    openSupport,
    jobs,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.school.count(),
    prisma.school.count({ where: { status: TenantStatus.ACTIVE } }),
    prisma.class.count(),
    prisma.user.count(),
    prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.userRoleAssignment.count({
      where: { roleKey: RoleKey.STUDENT, user: { status: UserStatus.ACTIVE } },
    }),
    prisma.userRoleAssignment.count({
      where: { roleKey: RoleKey.TEACHER, user: { status: UserStatus.ACTIVE } },
    }),
    prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.subscription.count({
      where: {
        status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE] },
        endsAt: { gte: now, lte: in30Days },
      },
    }),
    prisma.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
    prisma.lesson.count(),
    prisma.lesson.count({ where: { publishedAt: { not: null } } }),
    prisma.activity.count(),
    prisma.question.count(),
    prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
    prisma.progressRecord.count({ where: { completedAt: { gte: weekAgo } } }),
    prisma.assignment.count({ where: { isPublished: true, dueAt: { gte: now } } }),
    prisma.incidentRecord.count({ where: { status: { in: [...OPEN_INCIDENT_STATUSES] } } }),
    prisma.incidentRecord.count({
      where: { dataAffected: true, status: { in: [...OPEN_INCIDENT_STATUSES] } },
    }),
    prisma.supportRequest.count({
      where: { status: { notIn: [SupportStatus.RESOLVED, SupportStatus.CLOSED] } },
    }),
    jobHealthReport(now),
  ]);

  return {
    generatedAt: now,
    tenancy: { organizations, schools, activeSchools, classes },
    people: {
      total: usersTotal,
      byStatus: usersByStatus.map((entry) => ({ status: entry.status, count: entry._count._all })),
      activeStudents,
      activeTeachers,
    },
    commercial: {
      byPlan: subsByPlan.map((entry) => ({ plan: entry.plan, count: entry._count._all })),
      byStatus: subsByStatus.map((entry) => ({ status: entry.status, count: entry._count._all })),
      expiringWithin30Days: expiringSoon,
      pastDue,
    },
    content: { lessons, publishedLessons, activities, questions },
    engagement: {
      activeLast7Days: activeUsers,
      lessonCompletionsLast7Days: completions,
      assignmentsOpen,
    },
    operations: {
      openIncidents,
      dataAffectedIncidents: dataAffected,
      openSupportRequests: openSupport,
      unhealthyJobs: jobs.filter((job) => !job.isHealthy).length,
    },
  };
}
