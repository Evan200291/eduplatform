import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import {
  addGroupMembers,
  createUserGroup,
  fetchInvitations,
  fetchUserGroup,
  fetchUserGroups,
  fetchUsers,
  removeGroupMembers,
  revokeInvitation,
  updateUser,
  updateUserGroup,
} from '@/users/users.api';
import type { InvitationRow, UserDetail, UserGroupSummary } from '@/users/users.types';
import { qk } from '@/query/keys';
import { formatDate } from '@/lib/format';

// ── Edit a person's details ─────────────────────────────────────────────────

const AGE_MODES = [
  { value: 'EARLY_YEARS', label: 'Early years' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'LOWER_SECONDARY', label: 'Lower secondary' },
  { value: 'UPPER_SECONDARY', label: 'Upper secondary' },
  { value: 'ADULT', label: 'Adult' },
];

/**
 * Correcting a person's record. Learners get the fields that shape their
 * experience — age mode, a guardian contact, a weekly target, support notes
 * and the accessibility settings blueprint 07 lets staff set on their behalf.
 * Fields left empty are not sent, so they are not cleared by accident.
 */
export function EditUserModal({ user, onClose, onDone }: { user: UserDetail; onClose: () => void; onDone: () => void }) {
  const isStudent = user.primaryRole === 'STUDENT';
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '');
  const [ageMode, setAgeMode] = useState(user.ageMode ?? '');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('');
  const [supportNotes, setSupportNotes] = useState('');
  const [dyslexiaFont, setDyslexiaFont] = useState<boolean | null>(null);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [highContrast, setHighContrast] = useState<boolean | null>(null);
  const [audioSupport, setAudioSupport] = useState<boolean | null>(null);
  const [captionsPreferred, setCaptionsPreferred] = useState<boolean | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const input: Record<string, unknown> = { firstName: firstName.trim(), lastName: lastName.trim() };
      if (nickname.trim() !== (user.nickname ?? '')) input.nickname = nickname.trim();
      if (email.trim() && email.trim() !== user.email) input.email = email.trim();
      if (username.trim() && username.trim() !== user.username) input.username = username.trim();
      if (dateOfBirth) input.dateOfBirth = new Date(dateOfBirth).toISOString();
      if (ageMode && ageMode !== user.ageMode) input.ageMode = ageMode;
      if (isStudent) {
        if (guardianEmail.trim()) input.guardianEmail = guardianEmail.trim();
        if (targetMinutes) input.targetMinutesPerWeek = Number(targetMinutes);
        if (supportNotes.trim()) input.supportNotes = supportNotes.trim();
        const prefs = { dyslexiaFont, reduceMotion, highContrast, audioSupport, captionsPreferred };
        for (const [key, value] of Object.entries(prefs)) if (value !== null) input[key] = value;
      }
      return updateUser(user.id, input);
    },
    onSuccess: onDone,
  });

  const targetValue = Number(targetMinutes);
  const blockedReason =
    !firstName.trim() || !lastName.trim()
      ? 'A first and last name are required.'
      : targetMinutes && (!Number.isInteger(targetValue) || targetValue < 0 || targetValue > 2000)
        ? 'The weekly target is 0 to 2000 minutes.'
        : null;

  const toggle = (label: string, value: boolean | null, set: (next: boolean) => void) => (
    <Checkbox label={label} checked={value ?? false} onChange={(event) => set(event.target.checked)} />
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Edit ${user.displayName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blockedReason !== null} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" isRequired>
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </Field>
          <Field label="Last name" isRequired>
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
          <Field label="Nickname" hint="Shown on leaderboards. Checked for language by the server.">
            <Input value={nickname} onChange={(event) => setNickname(event.target.value)} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Username" hint="Letters, numbers, dots, hyphens or underscores.">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} />
          </Field>
        </div>

        {isStudent ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Age mode" hint="Sets how the learner app looks and reads.">
                <Select value={ageMode} placeholder="Leave as it is" onChange={(event) => setAgeMode(event.target.value)} options={AGE_MODES} />
              </Field>
              <Field label="Weekly target (minutes)" hint="Leave empty to keep the current target.">
                <Input type="number" min={0} max={2000} value={targetMinutes} onChange={(event) => setTargetMinutes(event.target.value)} />
              </Field>
              <Field label="Guardian email" hint="Leave empty to keep the current one.">
                <Input type="email" value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} />
              </Field>
            </div>
            <Field label="Support notes" hint="Seen by staff only. Leave empty to keep the current notes.">
              <Textarea rows={3} value={supportNotes} onChange={(event) => setSupportNotes(event.target.value)} />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-ink">Accessibility — tick to switch on for this learner</legend>
              {toggle('Dyslexia-friendly text', dyslexiaFont, setDyslexiaFont)}
              {toggle('Reduce motion', reduceMotion, setReduceMotion)}
              {toggle('High contrast', highContrast, setHighContrast)}
              {toggle('Read-aloud support', audioSupport, setAudioSupport)}
              {toggle('Prefer captions', captionsPreferred, setCaptionsPreferred)}
            </fieldset>
          </>
        ) : null}
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

// ── Invitations ─────────────────────────────────────────────────────────────

const INVITE_TONE = { PENDING: 'warning', ACCEPTED: 'success', EXPIRED: 'neutral', REVOKED: 'neutral' } as const;

export function InvitationsCard() {
  const queryClient = useQueryClient();
  const canRevoke = useCan('invitation.revoke');
  const [status, setStatus] = useState<InvitationRow['status'] | ''>('PENDING');
  const [page, setPage] = useState(1);
  const params = { page, pageSize: 20, ...(status ? { status } : {}) };
  const query = useQuery({ queryKey: qk.users.invitations(params), queryFn: () => fetchInvitations(params) });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.users.all }),
  });
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Invitations"
        description="Staff invited by email who have not joined yet."
        actions={
          <div className="w-40">
            <Select
              aria-label="Show"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as InvitationRow['status'] | '');
                setPage(1);
              }}
              options={[
                { value: 'PENDING', label: 'Waiting' },
                { value: 'ACCEPTED', label: 'Accepted' },
                { value: 'EXPIRED', label: 'Expired' },
                { value: 'REVOKED', label: 'Withdrawn' },
                { value: '', label: 'All' },
              ]}
            />
          </div>
        }
      />
      <CardBody className="p-0">
        {revoke.error ? <ErrorState error={revoke.error} /> : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No invitations" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">{row.email}</p>
                  <p className="text-xs text-ink-muted">
                    {row.roleKey.toLowerCase().replace(/_/g, ' ')} · sent {formatDate(row.createdAt)}
                    {row.invitedBy ? ` by ${row.invitedBy.displayName}` : ''} · expires {formatDate(row.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={INVITE_TONE[row.status]}>{row.status.charAt(0) + row.status.slice(1).toLowerCase()}</Badge>
                  {canRevoke && row.status === 'PENDING' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={revoke.isPending && revoke.variables === row.id}
                      onClick={() => revoke.mutate(row.id)}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {query.data ? <Pagination meta={query.data.meta} onPageChange={setPage} /> : null}
        </QueryBoundary>
      </CardBody>
    </Card>
  );
}

// ── Groups ──────────────────────────────────────────────────────────────────

/**
 * Named sets of people that cut across classes — an intervention group, a
 * reading club. Features can be switched on for a group, and assignments and
 * reports can target one.
 */
export function GroupsCard() {
  const canWrite = useCan('usergroup.write');
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.users.groups(), queryFn: () => fetchUserGroups() });
  const [editing, setEditing] = useState<UserGroupSummary | 'new' | null>(null);
  const [openGroup, setOpenGroup] = useState<UserGroupSummary | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.users.all });
  const rows = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Groups"
        description="People grouped across classes."
        actions={
          canWrite ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              New group
            </Button>
          ) : undefined
        }
      />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={<EmptyState title="No groups yet" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink">
                    {row.name} {row.isSystem ? <Badge tone="neutral">Built in</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {row._count.members} member{row._count.members === 1 ? '' : 's'}
                    {row.description ? ` · ${row.description}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setOpenGroup(row)}>
                    Members
                  </Button>
                  {canWrite && !row.isSystem ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {editing ? (
        <GroupModal
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {openGroup ? (
        <GroupMembersModal group={openGroup} canWrite={canWrite && !openGroup.isSystem} onClose={() => setOpenGroup(null)} onChanged={refresh} />
      ) : null}
    </Card>
  );
}

function GroupModal({ existing, onClose, onDone }: { existing: UserGroupSummary | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const mutation = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) };
      return existing ? updateUserGroup(existing.id, input) : createUserGroup(input);
    },
    onSuccess: onDone,
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existing ? 'Edit group' : 'New group'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={name.trim().length < 2} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Year 4 reading club" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function GroupMembersModal({
  group,
  canWrite,
  onClose,
  onChanged,
}: {
  group: UserGroupSummary;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const detail = useQuery({ queryKey: qk.users.group(group.id), queryFn: () => fetchUserGroup(group.id) });
  const [search, setSearch] = useState('');
  const people = useQuery({
    queryKey: qk.users.list({ search: search.trim(), pageSize: 20 }),
    queryFn: () => fetchUsers({ search: search.trim(), pageSize: 20 }),
    enabled: canWrite && search.trim().length >= 2,
  });
  const after = () => {
    void detail.refetch();
    onChanged();
  };
  const add = useMutation({ mutationFn: (userId: string) => addGroupMembers(group.id, [userId]), onSuccess: after });
  const remove = useMutation({ mutationFn: (userId: string) => removeGroupMembers(group.id, [userId]), onSuccess: after });

  const members = detail.data?.members ?? [];
  const memberIds = new Set(members.map((member) => member.user.id));

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={group.name}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {add.error ? <ErrorState error={add.error} /> : null}
        {remove.error ? <ErrorState error={remove.error} /> : null}
        {canWrite ? (
          <div className="flex flex-col gap-2">
            <Field label="Add someone" hint="Search by name, at least two letters.">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
            </Field>
            {search.trim().length >= 2 ? (
              <ul className="flex max-h-40 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {(people.data?.items ?? []).filter((person) => !memberIds.has(person.id)).map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-ink">{person.displayName}</span>
                    <Button size="sm" variant="ghost" isLoading={add.isPending && add.variables === person.id} onClick={() => add.mutate(person.id)}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <QueryBoundary
          isLoading={detail.isPending}
          error={detail.error}
          onRetry={() => void detail.refetch()}
          isEmpty={members.length === 0}
          emptyState={<EmptyState title="Nobody in this group yet" />}
        >
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {members.map((member) => (
              <li key={member.user.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-ink">
                  {member.user.displayName}{' '}
                  <span className="text-xs text-ink-muted">{member.user.primaryRole.toLowerCase().replace(/_/g, ' ')}</span>
                </span>
                {canWrite ? (
                  <Button size="sm" variant="ghost" isLoading={remove.isPending && remove.variables === member.user.id} onClick={() => remove.mutate(member.user.id)}>
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </div>
    </Modal>
  );
}
