import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardBody,
  IconSchool,
  Input,
  Spinner,
  text,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { authActions, useProfile, useTenant } from '@/auth';
import { fetchSchools } from '@/tenancy/tenancy.api';
import { qk } from '@/query/keys';

/**
 * Gate for screens that only mean anything inside one school.
 *
 * Platform staff are not pinned to a tenant: until they choose one, every
 * school-scoped request fails with `TENANT_CONTEXT_REQUIRED`. Without this
 * guard each query on the page discovers that independently, so a screen with
 * four cards showed four identical red errors, each with its own raw request
 * id — a wall of failure that reads as broken software rather than as one
 * unmade choice.
 *
 * So the choice is asked for once, at the route, before anything tries to load.
 * And it is asked for *actionably* — the picker is here, rather than a message
 * pointing at a dropdown somewhere else on the screen.
 *
 * Deliberately not applied to the whole admin surface: Organizations and
 * Schools are platform-level, and gating those would hide the very pages a
 * platform owner uses to find the school they are about to pick.
 */
export function RequireSchoolContext() {
  const profile = useProfile();
  const tenant = useTenant();

  // A school admin, teacher or learner is pinned server-side and can never be
  // in this state; there is nothing to ask them.
  if (!profile?.isPlatformStaff) return <Outlet />;
  if (tenant?.schoolId) return <Outlet />;

  return <ChooseSchoolScreen />;
}

function ChooseSchoolScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.schools.list({ search: search || undefined, pageSize: 20 }),
    queryFn: () => fetchSchools({ search: search || undefined, pageSize: 20 }),
  });

  const choose = async (schoolId: string) => {
    setPendingId(schoolId);
    try {
      await authActions.setTenantSchool(schoolId);
      // Every school-scoped query cached under the old (empty) context is now
      // wrong, including the ones that already errored. Same reasoning as the
      // switcher in the top bar.
      await queryClient.invalidateQueries();
    } finally {
      setPendingId(null);
    }
  };

  const schools = query.data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-strong"
        >
          <IconSchool aria-hidden className="h-7 w-7" />
        </span>
        <h1 className={cn(text.heading, 'text-2xl')}>Choose a school</h1>
        <p className={cn(text.muted, 'max-w-prose')}>
          You have access across the platform, so this page needs to know which school you are
          working in before it can show anything.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <Input
            autoFocus
            aria-label="Search schools"
            placeholder="Search schools…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : query.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner label="Loading schools…" />
            </div>
          ) : schools.length === 0 ? (
            <p className={cn(text.hint, 'py-8 text-center')}>No schools match that search.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {schools.map((school) => (
                <li key={school.id}>
                  <Button
                    variant="ghost"
                    fullWidth
                    isLoading={pendingId === school.id}
                    disabled={pendingId !== null}
                    onClick={() => void choose(school.id)}
                    className="justify-start text-left"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-ink">{school.name}</span>
                      <span className={cn(text.hint, 'truncate')}>
                        {school.organization.name} · {school.slug}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
