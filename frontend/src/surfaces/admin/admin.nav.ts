import {
  IconAnalytics,
  IconAssessment,
  IconBilling,
  IconBranding,
  IconCurriculum,
  IconFeatures,
  IconGamification,
  IconGrade,
  IconHome,
  IconOrganization,
  IconRoles,
  IconSafety,
  IconSchool,
  IconSettings,
  IconUsers,
} from '@/components/ui';
import type { NavSection } from '@/components/layout';
import { paths } from '@/routes/paths';

/**
 * The admin panel's menu (blueprint §05).
 *
 * One list serves both a school administrator and platform operations staff —
 * the difference is entirely in the permissions, so `useVisibleNav` collapses it
 * to the right shape per user and a school admin never sees an empty
 * "Platform" heading.
 *
 * Ordered by how often it is opened, not by how the database is arranged:
 * people, then teaching, then the settings you touch twice a year.
 */
export const ADMIN_NAV: readonly NavSection[] = [
  {
    items: [{ to: paths.admin.overview, label: 'Overview', icon: IconHome, isExact: true }],
  },
  {
    label: 'People',
    items: [
      { to: paths.admin.users, label: 'Users', icon: IconUsers, anyOf: ['user.read'] },
      { to: paths.admin.roles, label: 'Roles & access', icon: IconRoles, anyOf: ['role.assign'] },
    ],
  },
  {
    label: 'School',
    items: [
      {
        to: paths.admin.academic,
        label: 'Grades & classes',
        icon: IconGrade,
        anyOf: ['grade.read', 'class.read'],
      },
      {
        to: paths.admin.curriculum,
        label: 'Curriculum',
        icon: IconCurriculum,
        anyOf: ['curriculum.read'],
      },
      {
        to: paths.admin.assessment,
        label: 'Assessment',
        icon: IconAssessment,
        anyOf: ['assessment.read'],
      },
      {
        to: paths.admin.gamification,
        label: 'Rewards & buddy',
        icon: IconGamification,
        anyOf: ['gamification.read'],
      },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: paths.admin.branding, label: 'Branding', icon: IconBranding, anyOf: ['theme.read'] },
      {
        to: paths.admin.features,
        label: 'Features',
        icon: IconFeatures,
        anyOf: ['entitlement.read', 'platform.features.read'],
      },
      {
        to: paths.admin.settings,
        label: 'Settings',
        icon: IconSettings,
        anyOf: ['school.settings.read', 'platform.settings.read'],
      },
    ],
  },
  {
    label: 'Insight',
    items: [
      {
        to: paths.admin.analytics,
        label: 'Analytics',
        icon: IconAnalytics,
        anyOf: ['report.read.school', 'report.read.organization', 'report.read.platform'],
      },
      {
        to: paths.admin.billing,
        label: 'Subscription',
        icon: IconBilling,
        anyOf: ['subscription.read'],
      },
      {
        to: paths.admin.audit,
        label: 'Audit & safety',
        icon: IconSafety,
        anyOf: ['audit.read.school', 'audit.read.platform'],
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        to: paths.admin.organizations,
        label: 'Organizations',
        icon: IconOrganization,
        anyOf: ['organization.read'],
      },
      { to: paths.admin.schools, label: 'Schools', icon: IconSchool, anyOf: ['school.create'] },
    ],
  },
];
