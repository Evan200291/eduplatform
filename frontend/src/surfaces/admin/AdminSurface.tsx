import { AppShell } from '@/components/layout';
import { paths } from '@/routes/paths';
import { ADMIN_NAV } from './admin.nav';

/** Route element for everything under `/admin`. */
export function AdminSurface() {
  return <AppShell sections={ADMIN_NAV} homeTo={paths.admin.overview} />;
}
