import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  IconBack,
  IconBranding,
  IconGrade,
  IconSchool,
  IconUsers,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate } from '@/lib/format';
import { paths } from '@/routes/paths';
import { fetchSchool, setSchoolStatus, updateSchool } from '@/tenancy/tenancy.api';
import type { TenantStatus } from '@/tenancy/tenancy.types';

const STATUS_TONE: Record<TenantStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'info',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

/** One school: its settings, theme, entitlements at a glance, and its staff counts. */
export function SchoolDetailPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canUpdate = useCan('school.update');
  const canArchive = useCan('school.archive');

  const [isEditOpen, setEditOpen] = useState(false);
  const [isStatusOpen, setStatusOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.schools.detail(schoolId ?? ''),
    queryFn: () => fetchSchool(schoolId ?? ''),
    enabled: Boolean(schoolId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.schools.detail(schoolId ?? '') });
    void queryClient.invalidateQueries({ queryKey: qk.schools.all });
  };

  useDocumentTitle(query.data?.name ?? 'School');

  const school = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={school?.name ?? 'School'}
        description={school ? `${school.slug} · ${school.organization.name}` : undefined}
        above={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
            onClick={() => navigate(paths.admin.schools)}
          >
            Back to schools
          </Button>
        }
        actions={
          school ? (
            <>
              {canUpdate ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
              ) : null}
              {canArchive ? (
                <Button variant="danger" onClick={() => setStatusOpen(true)}>
                  Change status
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {school ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat icon={IconUsers} label="Users" value={school._count.users} />
              <Stat icon={IconGrade} label="Grades" value={school._count.grades} />
              <Stat icon={IconSchool} label="Classes" value={school._count.classes} />
              <Stat icon={IconBranding} label="Subjects" value={school._count.subjects} />
            </div>

            <Card>
              <CardHeader title="Overview" actions={<Badge tone={STATUS_TONE[school.status]}>{school.status}</Badge>} />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Code">{school.code}</Detail>
                <Detail label="City">{school.city ?? '—'}</Detail>
                <Detail label="Country">{school.country ?? '—'}</Detail>
                <Detail label="Timezone">{school.timezone}</Detail>
                <Detail label="Default age mode">{school.defaultAgeMode}</Detail>
                <Detail label="Contact">{school.contactName ?? '—'}</Detail>
                <Detail label="Contact email">{school.contactEmail ?? '—'}</Detail>
                <Detail label="Launched">{school.launchedAt ? formatDate(school.launchedAt) : 'Not yet'}</Detail>
                <Detail label="Created">{formatDate(school.createdAt)}</Detail>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Theme" />
              <CardBody className="flex items-center gap-3">
                <IconBranding aria-hidden className="h-5 w-5 text-ink-muted" />
                {school.activeTheme ? (
                  <div>
                    <p className="text-ink">{school.activeTheme.name}</p>
                    <p className="text-xs text-ink-muted">{school.activeTheme.status}</p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">Using the platform default theme.</p>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </QueryBoundary>

      {school && isEditOpen ? (
        <EditModal
          schoolId={school.id}
          defaults={{
            name: school.name,
            contactName: school.contactName ?? '',
            contactEmail: school.contactEmail ?? '',
            welcomeMessage: school.welcomeMessage ?? '',
          }}
          onClose={() => setEditOpen(false)}
          onDone={() => {
            setEditOpen(false);
            invalidate();
          }}
        />
      ) : null}
      {school && isStatusOpen ? (
        <StatusModal
          schoolId={school.id}
          currentStatus={school.status}
          onClose={() => setStatusOpen(false)}
          onDone={() => {
            setStatusOpen(false);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof IconUsers; label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold text-ink tabular-nums">{value}</p>
          <p className="text-xs text-ink-muted">{label}</p>
        </div>
      </CardBody>
    </Card>
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

function EditModal({
  schoolId,
  defaults,
  onClose,
  onDone,
}: {
  schoolId: string;
  defaults: { name: string; contactName: string; contactEmail: string; welcomeMessage: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [contactName, setContactName] = useState(defaults.contactName);
  const [contactEmail, setContactEmail] = useState(defaults.contactEmail);
  const [welcomeMessage, setWelcomeMessage] = useState(defaults.welcomeMessage);

  const mutation = useMutation({
    mutationFn: () => updateSchool(schoolId, { name, contactName, contactEmail, welcomeMessage }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Edit school">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name" isRequired>
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Contact name">
          <Input value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
        </Field>
        <Field label="Welcome message">
          <Textarea value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StatusModal({
  schoolId,
  currentStatus,
  onClose,
  onDone,
}: {
  schoolId: string;
  currentStatus: TenantStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<TenantStatus>(currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => setSchoolStatus(schoolId, status, reason),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Change status">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="New status" isRequired>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as TenantStatus)}
            options={(['ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING'] as TenantStatus[]).map((s) => ({
              value: s,
              label: s,
            }))}
          />
        </Field>
        <Field label="Reason" isRequired hint="Recorded on the audit trail.">
          <Textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={mutation.isPending}>
            Confirm
          </Button>
        </div>
      </form>
    </Modal>
  );
}
