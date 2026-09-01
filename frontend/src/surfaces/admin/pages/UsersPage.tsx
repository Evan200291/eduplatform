import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconInvite,
  IconUsers,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Textarea,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { bulkCreateStudents, createInvitation, createUser, fetchUsers } from '@/users/users.api';
import type { BulkStudentResult, UserSummary } from '@/users/users.types';
import { ROLE_KEYS } from '@/types/enums';

const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  INVITED: 'info',
  SUSPENDED: 'warning',
  EXPIRED: 'neutral',
  ARCHIVED: 'danger',
};

const STAFF_ROLES = ROLE_KEYS.filter((role) => role !== 'STUDENT');

function roleLabel(role: string): string {
  return role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Everyone with an account: search, filter, invite staff, add or bulk-import
 * learners, and jump into one account's detail.
 */
export function UsersPage() {
  useDocumentTitle('Users');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [isInviteOpen, setInviteOpen] = useState(false);
  const [isAddOpen, setAddOpen] = useState(false);
  const [isBulkOpen, setBulkOpen] = useState(false);

  const canCreate = useCan('user.create');
  const canInvite = useCan('invitation.create');

  const query = useQuery({
    queryKey: qk.users.list({ page, search, role, status }),
    queryFn: () =>
      fetchUsers({
        page,
        pageSize: 20,
        search: search || undefined,
        role: role || undefined,
        status: status || undefined,
      }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.users.all });

  const columns: Column<UserSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.displayName}</p>
          <p className="truncate text-xs text-ink-muted">
            {row.email ?? row.username ?? row.studentCode ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Badge tone="brand">{roleLabel(row.primaryRole)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'lastLogin',
      header: 'Last sign-in',
      className: 'hidden sm:table-cell',
      render: (row) => (row.lastLoginAt ? formatRelative(row.lastLoginAt) : 'Never'),
    },
    {
      key: 'created',
      header: 'Created',
      className: 'hidden lg:table-cell',
      render: (row) => formatDateTime(row.createdAt),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Everyone with an account at your school."
        actions={
          <>
            {canInvite ? (
              <Button
                variant="outline"
                leadingIcon={<IconInvite aria-hidden className="h-4 w-4" />}
                onClick={() => setInviteOpen(true)}
              >
                Invite staff
              </Button>
            ) : null}
            {canCreate ? (
              <>
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  Bulk import students
                </Button>
                <Button
                  leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
                  onClick={() => setAddOpen(true)}
                >
                  New user
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {/*
       * Filters live inside the table's own card rather than floating above it,
       * so the controls and the rows they act on read as one object.
       */}
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input
            placeholder="Search by name, email, username or code"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="max-w-sm"
            aria-label="Search users"
          />
          <Select
            aria-label="Filter by role"
            className="max-w-[12rem]"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            options={ROLE_KEYS.map((r) => ({ value: r, label: roleLabel(r) }))}
            placeholder="All roles"
          />
          <Select
            aria-label="Filter by status"
            className="max-w-[10rem]"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={['ACTIVE', 'INVITED', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'].map((s) => ({
              value: s,
              label: s,
            }))}
            placeholder="All statuses"
          />
        </div>

        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          <DataTable
            caption="Users at this school"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.admin.userDetail(row.id))}
            emptyState={
              <EmptyState
                icon={<IconUsers className="h-8 w-8" aria-hidden />}
                title="No users match those filters"
                description="Try clearing the search or filters."
                className="border-none"
              />
            }
          />
          {query.data ? (
            <Pagination
              meta={query.data.meta}
              onPageChange={setPage}
              className="border-t border-line"
            />
          ) : null}
        </QueryBoundary>
      </Card>

      {isInviteOpen ? (
        <InviteModal onClose={() => setInviteOpen(false)} onDone={invalidate} />
      ) : null}
      {isAddOpen ? (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onDone={() => {
            invalidate();
            setAddOpen(false);
          }}
        />
      ) : null}
      {isBulkOpen ? (
        <BulkImportModal
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState<string>('TEACHER');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => createInvitation({ email, roleKey, message: message || undefined }),
    onSuccess: (result) => {
      setLink(result.invitationUrl);
      onDone();
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="Invite a staff member">
      {link ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Invitation created">
            There is no email delivery yet — copy this link and send it yourself.
          </Alert>
          <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          {invite.error ? <ErrorState error={invite.error} /> : null}
          <Field label="Email address" isRequired>
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Role" isRequired>
            <Select
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value)}
              options={STAFF_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
            />
          </Field>
          <Field label="Message" hint="Optional note included with the invitation.">
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={invite.isPending}>
              Send invitation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AddUserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [primaryRole, setPrimaryRole] = useState('TEACHER');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [credentials, setCredentials] = useState<{
    temporaryPassword?: string;
    studentCode?: string;
    pin?: string;
  } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createUser({
        firstName,
        lastName,
        primaryRole,
        email: primaryRole === 'STUDENT' ? undefined : email || undefined,
        username: primaryRole === 'STUDENT' ? undefined : username || undefined,
      }),
    onSuccess: (result) => {
      setCredentials(result.credentials);
      onDone();
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="New user">
      {credentials ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Account created">
            These credentials are shown once — write them down now.
          </Alert>
          {credentials.temporaryPassword ? (
            <p>
              Temporary password: <span className="font-mono">{credentials.temporaryPassword}</span>
            </p>
          ) : null}
          {credentials.studentCode ? (
            <p>
              Student code: <span className="font-mono">{credentials.studentCode}</span>
            </p>
          ) : null}
          {credentials.pin ? (
            <p>
              PIN: <span className="font-mono">{credentials.pin}</span>
            </p>
          ) : null}
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {create.error ? <ErrorState error={create.error} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" isRequired>
              <Input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </Field>
            <Field label="Last name" isRequired>
              <Input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
          </div>
          <Field label="Role" isRequired>
            <Select
              value={primaryRole}
              onChange={(event) => setPrimaryRole(event.target.value)}
              options={ROLE_KEYS.map((r) => ({ value: r, label: roleLabel(r) }))}
            />
          </Field>
          {primaryRole === 'STUDENT' ? (
            <p className="text-sm text-ink-muted">
              A student code and PIN are generated automatically.
            </p>
          ) : (
            <>
              <Field label="Email" hint="Either an email or a username is required.">
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              <Field label="Username">
                <Input value={username} onChange={(event) => setUsername(event.target.value)} />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={create.isPending}>
              Create account
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function BulkImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [raw, setRaw] = useState('');
  const [results, setResults] = useState<BulkStudentResult[] | null>(null);

  const bulk = useMutation({
    mutationFn: () => {
      const students = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.includes(',') ? line.split(',') : line.split(/\s+/);
          const [firstName, ...rest] = parts.map((part) => part.trim()).filter(Boolean);
          return { firstName: firstName ?? line, lastName: rest.join(' ') };
        });
      return bulkCreateStudents({ students });
    },
    onSuccess: (result) => {
      setResults(result);
      onDone();
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="Bulk import students" size="lg">
      {results ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title={`${results.length} account(s) created`}>
            Codes and PINs are shown once — export or write these down now.
          </Alert>
          <DataTable
            caption="Newly created student accounts"
            rows={results}
            getRowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.displayName },
              { key: 'code', header: 'Student code', render: (row) => row.studentCode },
              { key: 'pin', header: 'PIN', render: (row) => row.pin ?? '—' },
            ]}
          />
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            bulk.mutate();
          }}
        >
          {bulk.error ? <ErrorState error={bulk.error} /> : null}
          <Field
            label="Students"
            hint="One per line: First name Last name"
            isRequired
          >
            <Textarea
              required
              rows={8}
              placeholder={'Amara Chen\nJoseph Diallo'}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={bulk.isPending}>
              Create accounts
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
