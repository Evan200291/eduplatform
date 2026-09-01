import { AppShell } from '@/components/layout';
import { paths } from '@/routes/paths';
import { TEACHER_NAV } from './teacher.nav';

/** Route element for everything under `/teach`. */
export function TeacherSurface() {
  return (
    <AppShell
      sections={TEACHER_NAV}
      homeTo={paths.teach.dashboard}
      notificationsTo={paths.teach.notifications}
    />
  );
}
