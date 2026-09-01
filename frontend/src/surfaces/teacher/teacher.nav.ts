import {
  IconAssignment,
  IconClass,
  IconHome,
  IconLearningPath,
  IconNotifications,
  IconReports,
  IconSuccess,
  IconUsers,
} from '@/components/ui';
import type { NavSection } from '@/components/layout';
import { paths } from '@/routes/paths';

/**
 * The teacher portal's menu (blueprint §04).
 *
 * Grouped the way the job is shaped: who you teach, what you set them, and what
 * came back. "Suggestions" is its own group because the system proposing and the
 * teacher deciding is the product's central rule — it should not be buried under
 * a list of classes.
 */
export const TEACHER_NAV: readonly NavSection[] = [
  {
    items: [{ to: paths.teach.dashboard, label: 'Dashboard', icon: IconHome, isExact: true }],
  },
  {
    label: 'My classes',
    items: [
      { to: paths.teach.classes, label: 'Classes', icon: IconClass, anyOf: ['class.read'] },
      { to: paths.teach.students, label: 'Students', icon: IconUsers, anyOf: ['user.read'] },
    ],
  },
  {
    label: 'Teaching',
    items: [
      {
        to: paths.teach.paths,
        label: 'Learning paths',
        icon: IconLearningPath,
        anyOf: ['learningpath.read'],
      },
      {
        to: paths.teach.assignments,
        label: 'Homework',
        icon: IconAssignment,
        anyOf: ['assignment.read'],
      },
    ],
  },
  {
    label: 'Suggestions',
    items: [
      {
        to: paths.teach.recommendations,
        label: 'To approve',
        icon: IconSuccess,
        anyOf: ['recommendation.read'],
      },
    ],
  },
  {
    label: 'Insight',
    items: [
      {
        to: paths.teach.reports,
        label: 'Reports',
        icon: IconReports,
        anyOf: ['report.read.scoped', 'report.read.school'],
      },
      {
        to: paths.teach.notifications,
        label: 'Messages',
        icon: IconNotifications,
        anyOf: ['notification.read'],
      },
    ],
  },
];
