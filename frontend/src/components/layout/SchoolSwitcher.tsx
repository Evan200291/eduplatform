import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import {
  focusRing,
  panel,
  text,
  transition,
  IconChevronDown,
  IconSchool,
  Input,
  Spinner,
} from '@/components/ui';
import { authActions, useProfile, useTenant } from '@/auth';
import { fetchCurrentSchool, fetchSchools } from '@/tenancy/tenancy.api';
import { qk } from '@/query/keys';
import { useDismiss } from '@/hooks/use-dismiss';

/**
 * Platform staff are not pinned to a school — every school-scoped screen needs
 * `X-Tenant-School` set explicitly (see `backend/src/core/middleware/tenant-context.ts`)
 * before it will render anything. This is how they set it.
 *
 * Renders nothing for a school-pinned user (a school admin, teacher or student):
 * their tenant is fixed server-side and there is nothing to switch.
 */
export function SchoolSwitcher() {
  const profile = useProfile();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);

  const query = useQuery({
    queryKey: qk.schools.list({ search: search || undefined, pageSize: 20 }),
    queryFn: () => fetchSchools({ search: search || undefined, pageSize: 20 }),
    enabled: isOpen,
  });

  // `meta.tenant` on `/auth/me` carries only the school id, not its name — look
  // the name up once the id is known rather than showing a raw id in the bar.
  const currentSchoolQuery = useQuery({
    queryKey: qk.schools.detail(tenant?.schoolId ?? 'none'),
    queryFn: fetchCurrentSchool,
    enabled: Boolean(tenant?.schoolId) && Boolean(profile?.isPlatformStaff),
    staleTime: 60_000,
  });

  if (!profile?.isPlatformStaff) return null;

  const currentLabel = tenant?.schoolId
    ? (currentSchoolQuery.data?.name ?? '…')
    : 'Choose a school';

  const choose = async (schoolId: string) => {
    if (schoolId === tenant?.schoolId) {
      close();
      return;
    }
    setIsSwitching(true);
    try {
      await authActions.setTenantSchool(schoolId);
      // Almost every query in the app is implicitly scoped to the active tenant
      // even though its key doesn't say so — a stale-but-not-erroring query
      // would otherwise keep showing the old school's data, and an
      // already-errored one (TENANT_CONTEXT_REQUIRED) would sit there until the
      // user manually hit "Try again". Invalidating everything forces every
      // mounted screen to refetch under the new `X-Tenant-School` header.
      await queryClient.invalidateQueries();
      close();
      setSearch('');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm min-h-touch',
          'text-ink hover:border-line-strong hover:bg-surface-sunken',
          isOpen && 'border-line-strong bg-surface-sunken',
          !tenant?.schoolId && 'border-warning bg-warning-soft text-warning-strong',
          focusRing,
          transition,
        )}
      >
        <IconSchool aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
        <span className="hidden max-w-[10rem] truncate font-medium sm:block">{currentLabel}</span>
        <IconChevronDown aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Switch school"
          className={cn(panel, 'absolute right-0 z-20 mt-2 w-72 overflow-hidden shadow-lg')}
        >
          <div className="border-b border-line p-2">
            <Input
              autoFocus
              placeholder="Search schools…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search schools"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
            {query.isPending ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : query.data && query.data.items.length > 0 ? (
              query.data.items.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  role="menuitem"
                  disabled={isSwitching}
                  onClick={() => void choose(school.id)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm min-h-touch',
                    'text-ink hover:bg-surface-sunken disabled:opacity-50',
                    tenant?.schoolId === school.id && 'bg-primary-soft text-primary-strong',
                    focusRing,
                    transition,
                  )}
                >
                  <span className="font-medium">{school.name}</span>
                  <span className={text.hint}>
                    {school.organization.name} · {school.slug}
                  </span>
                </button>
              ))
            ) : (
              <p className={cn(text.hint, 'px-3 py-4 text-center')}>No schools found.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
