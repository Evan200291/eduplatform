import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { assignRole, fetchUser, fetchUsers, revokeRole } from '@/users/users.api';
import type { UserSummary } from '@/users/users.types';
import { fetchRolePermissions } from '@/roles/roles.api';
import { ROLE_KEYS, type RoleKey } from '@/types/enums';

function roleLabel(role: string): string {
  return role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The sections mirror the comment-delimited groups in
 * `backend/src/core/rbac/permissions.ts` — hand-transcribed here since the
 * comments themselves do not survive to a runtime value the frontend can read.
 */
const PERMISSION_SECTIONS: { title: string; prefixes: string[] }[] = [
  { title: 'Platform administration', prefixes: ['platform'] },
  { title: 'Tenancy', prefixes: ['organization', 'school'] },
  { title: 'Commercial', prefixes: ['subscription', 'entitlement'] },
  { title: 'Branding', prefixes: ['theme'] },
  { title: 'Identity and access', prefixes: ['user', 'role', 'invitation', 'usergroup', 'session'] },
  { title: 'Academic structure', prefixes: ['grade', 'class', 'subject', 'term'] },
  { title: 'Curriculum and content', prefixes: ['curriculum', 'lesson', 'activity', 'content', 'media'] },
  { title: 'Assessment', prefixes: ['assessment'] },
  { title: 'Learning paths and recommendations', prefixes: ['learningpath', 'recommendation'] },
  {
    title: 'Progress, mastery and teacher judgment',
    prefixes: ['progress', 'mastery', 'teacherassessment', 'note'],
  },
  { title: 'Assignments and homework', prefixes: ['assignment'] },
  {
    title: 'Gamification',
    prefixes: ['gamification', 'points', 'badge', 'reward', 'mission', 'companion', 'leaderboard'],
  },
  { title: 'Notifications', prefixes: ['notification'] },
  { title: 'Reporting', prefixes: ['report'] },
  { title: 'Support', prefixes: ['support'] },
  { title: 'Audit, privacy and compliance', prefixes: ['audit', 'datarequest', 'consent', 'retention'] },
  { title: 'Learner self-service', prefixes: ['self'] },
];

function groupPermissions(permissions: string[]): { title: string; permissions: string[] }[] {
  const groups = PERMISSION_SECTIONS.map((section) => ({
    title: section.title,
    permissions: [] as string[],
  }));
  const other: string[] = [];

  for (const permission of permissions) {
    const prefix = permission.split('.')[0];
    const index = PERMISSION_SECTIONS.findIndex((section) => section.prefixes.includes(prefix));
    if (index === -1) other.push(permission);
    else groups[index].permissions.push(permission);
  }

  const result = groups.filter((group) => group.permissions.length > 0);
  if (other.length > 0) result.push({ title: 'Other', permissions: other });
  return result;
}

/** The roles this platform defines: who holds each one, and what each one actually grants. */
export function RolesPage() {
  useDocumentTitle('Roles & access');
  const [openRole, setOpenRole] = useState<RoleKey | null>(null);

  const usersQuery = useQuery({
    queryKey: qk.users.list({ pageSize: 200 }),
    queryFn: () => fetchUsers({ pageSize: 200 }),
  });

  const permissionsQuery = useQuery({
    queryKey: qk.roles.permissions,
    queryFn: () => fetchRolePermissions(),
  });

  const counts = new Map<string, number>();
  for (const user of usersQuery.data?.items ?? []) {
    counts.set(user.primaryRole, (counts.get(user.primaryRole) ?? 0) + 1);
  }

  const permissionsByRole = new Map<string, string[]>();
  for (const row of permissionsQuery.data ?? []) {
    permissionsByRole.set(row.role, row.permissions);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roles & access"
        description="Who can do what, and how many people at your school hold each role. Open a role to see its members and permissions."
      />

      <QueryBoundary
        isLoading={usersQuery.isPending}
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_KEYS.map((role) => (
            <Card
              key={role}
              role="button"
              tabIndex={0}
              onClick={() => setOpenRole(role)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setOpenRole(role);
                }
              }}
              className="cursor-pointer text-left transition hover:border-primary-muted hover:shadow-md"
            >
              <CardHeader
                title={roleLabel(role)}
                actions={<Badge tone="brand">{counts.get(role) ?? 0}</Badge>}
              />
              <CardBody>
                <p className="text-sm text-ink-muted">
                  {permissionsByRole.get(role)?.length ?? '…'} permissions granted. Click to view
                  members and details.
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </QueryBoundary>

      {openRole ? (
        <RoleDetailModal
          role={openRole}
          permissions={permissionsByRole.get(openRole) ?? []}
          permissionsLoading={permissionsQuery.isPending}
          permissionsError={permissionsQuery.error}
          onClose={() => setOpenRole(null)}
        />
      ) : null}
    </div>
  );
}

function RoleDetailModal({
  role,
  permissions,
  permissionsLoading,
  permissionsError,
  onClose,
}: {
  role: RoleKey;
  permissions: string[];
  permissionsLoading: boolean;
  permissionsError: unknown;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const canAssign = useCan('role.assign');
  const canRevoke = useCan('role.revoke');
  const [grantSearch, setGrantSearch] = useState('');

  const membersQuery = useQuery({
    queryKey: qk.users.list({ role, pageSize: 50 }),
    queryFn: () => fetchUsers({ role, pageSize: 50 }),
  });

  const candidatesQuery = useQuery({
    queryKey: qk.users.list({ search: grantSearch, grantCandidatesFor: role, pageSize: 10 }),
    queryFn: () => fetchUsers({ search: grantSearch || undefined, pageSize: 10 }),
    enabled: canAssign && grantSearch.trim().length > 1,
  });

  const invalidateMembers = () => {
    void queryClient.invalidateQueries({ queryKey: qk.users.all });
  };

  const grant = useMutation({
    mutationFn: (userId: string) =>
      assignRole(userId, {
        roleKey: role,
        scopeType: 'SCHOOL',
        reason: `Granted from Roles & access (${roleLabel(role)}).`,
      }),
    onSuccess: () => {
      invalidateMembers();
      setGrantSearch('');
    },
  });

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const detail = await fetchUser(userId);
      const assignment = detail.roleAssignments.find(
        (row) => row.roleKey === role && row.scopeType === 'SCHOOL',
      );
      if (!assignment) {
        throw new Error(
          'No school-level grant of this role was found for that user — it may only be their primary role from account creation, or scoped to a grade, class or subject.',
        );
      }
      return revokeRole(assignment.id, `Revoked from Roles & access (${roleLabel(role)}).`);
    },
    onSuccess: invalidateMembers,
  });

  const members = membersQuery.data?.items ?? [];
  const grouped = groupPermissions(permissions);
  const candidates = (candidatesQuery.data?.items ?? []).filter(
    (candidate) => !members.some((member) => member.id === candidate.id),
  );

  return (
    <Modal isOpen onClose={onClose} title={roleLabel(role)} size="lg">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">
            Members ({membersQuery.data?.meta.totalItems ?? '…'})
          </h3>
          {revoke.error ? <ErrorState error={revoke.error} className="mb-2" /> : null}
          <QueryBoundary
            isLoading={membersQuery.isPending}
            error={membersQuery.error}
            onRetry={() => void membersQuery.refetch()}
          >
            {members.length === 0 ? (
              <EmptyState title="Nobody holds this role" description="No users have this as their primary role yet." />
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {members.map((member: UserSummary) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{member.displayName}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {member.email ?? member.username ?? member.studentCode ?? '—'}
                      </p>
                    </div>
                    {canRevoke ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={revoke.isPending && revoke.variables === member.id}
                        onClick={() => revoke.mutate(member.id)}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </section>

        {canAssign ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Grant or revoke this role</h3>
            <p className="mb-2 text-xs text-ink-muted">
              Search for anyone at the school — including someone whose primary role differs but who
              was separately granted this role.
            </p>
            {grant.error ? <ErrorState error={grant.error} className="mb-2" /> : null}
            <Field label="Search users" hint="Type at least two characters.">
              <Input
                value={grantSearch}
                onChange={(event) => setGrantSearch(event.target.value)}
                placeholder="Search by name, email or username"
              />
            </Field>
            {grantSearch.trim().length > 1 ? (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {candidatesQuery.isPending ? (
                  <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>
                ) : candidates.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-ink-muted">No matching users.</li>
                ) : (
                  candidates.map((candidate) => (
                    <li key={candidate.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{candidate.displayName}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {roleLabel(candidate.primaryRole)} ·{' '}
                          {candidate.email ?? candidate.username ?? candidate.studentCode ?? '—'}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={grant.isPending && grant.variables === candidate.id}
                          onClick={() => grant.mutate(candidate.id)}
                        >
                          Grant
                        </Button>
                        {canRevoke ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={revoke.isPending && revoke.variables === candidate.id}
                            onClick={() => revoke.mutate(candidate.id)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Permissions</h3>
          {permissionsError ? (
            <ErrorState error={permissionsError} />
          ) : permissionsLoading ? (
            <p className="text-sm text-ink-muted">Loading permissions…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-ink-muted">This role has no permissions.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map((group) => (
                <div key={group.title}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {group.title}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full border border-line bg-surface-sunken px-2 py-0.5 font-mono text-xs text-ink"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
