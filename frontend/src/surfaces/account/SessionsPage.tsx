import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, DataTable, PageHeader, type Column } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { authApi, type ActiveSession } from '@/auth';
import { qk } from '@/query/keys';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * Every device currently signed in as you, and a way to cut one off.
 *
 * Genuinely useful in a school: a pupil who left themselves logged in on a
 * library machine, or a teacher who lost a tablet, can end that session without
 * an admin. The current session is labelled and cannot be revoked from here —
 * that is what signing out is for.
 */
export function SessionsPage() {
  useDocumentTitle('Signed-in devices');
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.auth.sessions,
    queryFn: authApi.listSessions,
  });

  const revoke = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.auth.sessions }),
  });

  const columns: Column<ActiveSession>[] = [
    {
      key: 'device',
      header: 'Device',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{describeDevice(row.userAgent)}</p>
          {row.ipAddress ? (
            <p className="truncate text-xs text-ink-muted">{row.ipAddress}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Last used',
      className: 'hidden sm:table-cell',
      render: (row) => formatRelative(row.lastUsedAt ?? row.createdAt),
    },
    {
      key: 'signedIn',
      header: 'Signed in',
      className: 'hidden lg:table-cell',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isCurrent ? (
          <Badge tone="success">This device</Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            isLoading={revoke.isPending && revoke.variables === row.id}
            onClick={() => revoke.mutate(row.id)}
          >
            Sign out
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Signed-in devices"
        description="If you do not recognise something here, sign it out and change your password."
      />

      {revoke.error ? <ErrorState error={revoke.error} /> : null}

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <DataTable
          caption="Devices currently signed in to your account"
          rows={query.data ?? []}
          columns={columns}
          getRowKey={(row) => row.id}
        />
      </QueryBoundary>
    </div>
  );
}

/**
 * A user agent string is unreadable; a family name is enough to recognise your
 * own device. Deliberately coarse — this is for recognition, not forensics.
 */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : 'Browser';

  const platform =
    /iPhone|iPad/.test(userAgent) ? 'iPad or iPhone'
    : /Android/.test(userAgent) ? 'Android'
    : /Macintosh/.test(userAgent) ? 'Mac'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'device';

  return `${browser} on ${platform}`;
}
