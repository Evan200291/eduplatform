import {
  IconActivity,
  IconCompanion,
  IconHome,
  IconLeaderboard,
  IconMission,
  IconProgress,
} from '@/components/ui';
import type { NavSection } from '@/components/layout';
import { paths } from '@/routes/paths';

/**
 * The student platform's destinations (blueprint §03).
 *
 * Flat and short on purpose: the shell renders these as large tabs, and a learner
 * should be able to see every place they can go without scrolling or opening a
 * menu.
 *
 * Home is ungated so a parent — who reuses this surface read-only and holds none
 * of the participation permissions — still lands somewhere real.
 */
export const STUDENT_NAV: readonly NavSection[] = [
  {
    items: [
      { to: paths.learn.home, label: 'Home', icon: IconHome, isExact: true },
      {
        to: paths.learn.activities,
        label: 'Learn',
        icon: IconActivity,
        anyOf: ['activity.read'],
      },
      {
        to: paths.learn.missions,
        label: 'Missions',
        icon: IconMission,
        anyOf: ['mission.read'],
      },
      {
        to: paths.learn.companion,
        label: 'Buddy',
        icon: IconCompanion,
        anyOf: ['companion.read'],
      },
      {
        to: paths.learn.leaderboard,
        label: 'Top scores',
        icon: IconLeaderboard,
        anyOf: ['leaderboard.read'],
      },
      {
        to: paths.learn.progress,
        label: 'My progress',
        icon: IconProgress,
        anyOf: ['progress.read.own'],
      },
    ],
  },
];
