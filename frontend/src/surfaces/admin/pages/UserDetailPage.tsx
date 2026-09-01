import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Field,
  IconBack,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { assignRole, fetchUser, resetUserCredentials, revokeRole, setUserStatus } from '@/users/users.api';
import type { RoleAssignmentRow } from '@/users/users.types';
import { ROLE_KEYS, ROLE_SCOPE_TYPES } from '@/types/enums';
import { adjustPoints, fetchMyStreaks, fetchPointsBalance, freezeStreak } from '@/gamification/gamification.api';

const STREAK_KIND_OPTIONS = [
  { value: 'DAILY_LEARNING', label: 'Daily learning' },
  { value: 'WEEKLY_LEARNING', label: 'Weekly learning' },
  { value: 'ASSIGNMENT_ON_TIME', label: 'Assignment on time' },
  { value: 'ACCURACY', label: 'Accuracy' },
];

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'warning',
  EXPIRED: 'neutral',
  ARCHIVED: 'danger',
};

function roleLabel(role: string): string {
  return role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One account: profile, roles, classes and the actions an administrator can take. */
export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canUpdateStatus = useCan('user.suspend');
  const canResetCredentials = useCan('user.credentials.reset');
  const canAssignRole = useCan('role.assign');
  const canRevokeRole = useCan('role.revoke');

  const [isStatusOpen, setStatusOpen] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);
  const [isRoleOpen, setRoleOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.users.detail(userId ?? ''),
    queryFn: () => fetchUser(userId ?? ''),
    enabled: Boolean(userId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.users.detail(userId ?? '') });
    void queryClient.invalidateQueries({ queryKey: qk.users.all });
  };

  const revoke = useMutation({
    mutationFn: (assignmentId: string) => revokeRole(assignmentId, 'Revoked from the admin panel'),
    onSuccess: invalidate,
  });

  useDocumentTitle(query.data?.displayName ?? 'User');

  const user = query.data;
  const isActive = user?.status === 'ACTIVE';

  const roleColumns: Column<RoleAssignmentRow>[] = [
    { key: 'role', header: 'Role', render: (row) => <Badge tone="brand">{roleLabel(row.roleKey)}</Badge> },
    { key: 'scope', header: 'Scope', render: (row) => row.scopeType },
    {
      key: 'granted',
      header: 'Granted',
      render: (row) => formatDate(row.grantedAt),
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (row) => (row.expiresAt ? formatDate(row.expiresAt) : 'Never'),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        canRevokeRole ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={revoke.isPending && revoke.variables === row.id}
            onClick={() => revoke.mutate(row.id)}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={user?.displayName ?? 'User'}
        description={user ? roleLabel(user.primaryRole) : undefined}
        above={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
            onClick={() => navigate(paths.admin.users)}
          >
            Back to users
          </Button>
        }
        actions={
          user ? (
            <>
              {canResetCredentials ? (
                <Button variant="outline" onClick={() => setResetOpen(true)}>
                  Reset credentials
                </Button>
              ) : null}
              {canUpdateStatus ? (
                <Button variant={isActive ? 'danger' : 'primary'} onClick={() => setStatusOpen(true)}>
                  {isActive ? 'Suspend' : 'Reactivate'}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      <QueryBoundary
        isLoading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {user ? (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader title="Profile" />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Status">
                  <Badge tone={STATUS_TONE[user.status] ?? 'neutral'}>{user.status}</Badge>
                </Detail>
                <Detail label="Email">{user.email ?? '—'}</Detail>
                <Detail label="Username">{user.username ?? '—'}</Detail>
                <Detail label="Student code">{user.studentCode ?? '—'}</Detail>
                <Detail label="Last sign-in">
                  {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'}
                </Detail>
                <Detail label="Created">{formatDateTime(user.createdAt)}</Detail>
                {user.studentProfile?.currentGrade ? (
                  <Detail label="Grade">{user.studentProfile.currentGrade.name}</Detail>
                ) : null}
              </CardBody>
            </Card>

            {user.classMemberships && user.classMemberships.length > 0 ? (
              <Card>
                <CardHeader title="Classes" />
                <CardBody className="flex flex-wrap gap-2">
                  {user.classMemberships.map((membership) => (
                    <Badge key={membership.class.id}>{membership.class.name}</Badge>
                  ))}
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader
                title="Roles"
                actions={
                  canAssignRole ? (
                    <Button size="sm" onClick={() => setRoleOpen(true)}>
                      Grant role
                    </Button>
                  ) : undefined
                }
              />
              <CardBody className="p-0">
                {revoke.error ? <ErrorState error={revoke.error} className="m-4" /> : null}
                <DataTable
                  caption={`Role assignments for ${user.displayName}`}
                  rows={user.roleAssignments}
                  columns={roleColumns}
                  getRowKey={(row) => row.id}
                />
              </CardBody>
            </Card>

            {user.primaryRole === 'STUDENT' ? <GamificationCard studentId={user.id} /> : null}
          </div>
        ) : null}
      </QueryBoundary>

      {user && isStatusOpen ? (
        <StatusModal
          userId={user.id}
          isActive={isActive}
          onClose={() => setStatusOpen(false)}
          onDone={() => {
            setStatusOpen(false);
            invalidate();
          }}
        />
      ) : null}
      {user && isResetOpen ? (
        <ResetCredentialsModal
          userId={user.id}
          isStudent={user.primaryRole === 'STUDENT'}
          onClose={() => setResetOpen(false)}
        />
      ) : null}
      {user && isRoleOpen ? (
        <GrantRoleModal
          userId={user.id}
          onClose={() => setRoleOpen(false)}
          onDone={() => {
            setRoleOpen(false);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

/** Manual points adjustment and streak-freeze grants — school-admin-only levers. */
function GamificationCard({ studentId }: { studentId: string }) {
  const canAdjustPoints = useCan('points.adjust');
  const canConfigGamification = useCan('gamification.config');
  const [isAdjustOpen, setAdjustOpen] = useState(false);
  const [isFreezeOpen, setFreezeOpen] = useState(false);

  const balanceQuery = useQuery({
    queryKey: qk.points.balance(studentId),
    queryFn: () => fetchPointsBalance(studentId),
  });
  const streaksQuery = useQuery({
    queryKey: qk.streaks.mine(studentId),
    queryFn: () => fetchMyStreaks(studentId),
  });

  if (!canAdjustPoints && !canConfigGamification) return null;

  return (
    <Card>
      <CardHeader
        title="Gamification"
        actions={
          <div className="flex gap-2">
            {canAdjustPoints ? (
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                Adjust points
              </Button>
            ) : null}
            {canConfigGamification ? (
              <Button size="sm" variant="outline" onClick={() => setFreezeOpen(true)}>
                Grant streak freeze
              </Button>
            ) : null}
          </div>
        }
      />
      <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Points balance">
          {balanceQuery.data ? balanceQuery.data.balance : '—'}
        </Detail>
        <Detail label="Streaks">
          {streaksQuery.data && streaksQuery.data.streaks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {streaksQuery.data.streaks.map((streak) => (
                <Badge key={streak.kind} tone={streak.atRisk ? 'warning' : 'neutral'}>
                  {streak.kind.replaceAll('_', ' ').toLowerCase()}: {streak.currentLength}d
                  {streak.atRisk ? ' (at risk)' : ''}
                </Badge>
              ))}
            </div>
          ) : (
            '—'
          )}
        </Detail>
      </CardBody>
      {isAdjustOpen ? (
        <AdjustPointsModal
          studentId={studentId}
          onClose={() => setAdjustOpen(false)}
          onDone={() => {
            setAdjustOpen(false);
            void balanceQuery.refetch();
          }}
        />
      ) : null}
      {isFreezeOpen ? (
        <FreezeStreakModal
          studentId={studentId}
          onClose={() => setFreezeOpen(false)}
          onDone={() => {
            setFreezeOpen(false);
            void streaksQuery.refetch();
          }}
        />
      ) : null}
    </Card>
  );
}

function AdjustPointsModal({
  studentId,
  onClose,
  onDone,
}: {
  studentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [points, setPoints] = useState('0');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => adjustPoints({ studentId, points: Number(points), note }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Adjust points">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Points" isRequired hint="Positive to add, negative to remove.">
          <Input
            type="number"
            required
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
        </Field>
        <Field label="Note" isRequired hint="Recorded on the audit trail.">
          <Textarea required value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending} disabled={Number(points) === 0}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FreezeStreakModal({
  studentId,
  onClose,
  onDone,
}: {
  studentId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState('DAILY_LEARNING');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => freezeStreak({ studentId, kind, reason }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Grant a streak freeze">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Restores grace after an authorised absence, so a missed day does not break the streak.
        </p>
        <Field label="Streak" isRequired>
          <Select value={kind} onChange={(event) => setKind(event.target.value)} options={STREAK_KIND_OPTIONS} />
        </Field>
        <Field label="Reason" isRequired hint="Recorded on the audit trail.">
          <Textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Grant
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-ink">{children}</p>
    </div>
  );
}

function StatusModal({
  userId,
  isActive,
  onClose,
  onDone,
}: {
  userId: string;
  isActive: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => setUserStatus(userId, isActive ? 'SUSPENDED' : 'ACTIVE', reason),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title={isActive ? 'Suspend account' : 'Reactivate account'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Reason" isRequired hint="Recorded on the audit trail.">
          <Textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={isActive ? 'danger' : 'primary'} type="submit" isLoading={mutation.isPending}>
            {isActive ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetCredentialsModal({
  userId,
  isStudent,
  onClose,
}: {
  userId: string;
  isStudent: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ temporaryPassword?: string; pin?: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      resetUserCredentials(userId, {
        kind: isStudent ? 'pin' : 'password',
        reason,
      }),
    onSuccess: setResult,
  });

  return (
    <Modal isOpen onClose={onClose} title="Reset credentials">
      {result ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Credentials reset">
            This value is shown once — write it down now.
          </Alert>
          <p className="font-mono text-lg">{result.temporaryPassword ?? result.pin}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mutation.error ? <ErrorState error={mutation.error} /> : null}
          <p className="text-sm text-ink-muted">
            Generates a new {isStudent ? 'PIN' : 'temporary password'} and signs the account out
            everywhere.
          </p>
          <Field label="Reason" isRequired hint="Recorded on the audit trail.">
            <Textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={mutation.isPending}>
              Reset
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function GrantRoleModal({
  userId,
  onClose,
  onDone,
}: {
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [roleKey, setRoleKey] = useState<string>('TEACHER');
  const [scopeType, setScopeType] = useState<string>('SCHOOL');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => assignRole(userId, { roleKey, scopeType, reason: reason || undefined }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Grant a role">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Role" isRequired>
          <Select
            value={roleKey}
            onChange={(event) => setRoleKey(event.target.value)}
            options={ROLE_KEYS.map((r) => ({ value: r, label: roleLabel(r) }))}
          />
        </Field>
        <Field label="Scope" isRequired hint="Grade, class and subject scopes need that item selected elsewhere first; school-wide is the common case.">
          <Select
            value={scopeType}
            onChange={(event) => setScopeType(event.target.value)}
            options={ROLE_SCOPE_TYPES.filter((s) => s !== 'PLATFORM').map((s) => ({ value: s, label: s }))}
          />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Grant
          </Button>
        </div>
      </form>
    </Modal>
  );
}
