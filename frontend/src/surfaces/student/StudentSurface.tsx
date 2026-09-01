import { LearnerShell } from '@/components/layout';
import { paths } from '@/routes/paths';
import { STUDENT_NAV } from './student.nav';

/** Route element for everything under `/learn`. */
export function StudentSurface() {
  return (
    <LearnerShell
      sections={STUDENT_NAV}
      homeTo={paths.learn.home}
      notificationsTo={paths.learn.notifications}
    />
  );
}
