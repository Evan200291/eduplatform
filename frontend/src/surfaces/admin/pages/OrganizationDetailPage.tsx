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
  IconOrganization,
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
import { fetchOrganization, setOrganizationStatus, updateOrganization } from '@/tenancy/tenancy.api';
import type { TenantStatus } from '@/tenancy/tenancy.types';

const STATUS_TONE: Record<TenantStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'info',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

/** One organization: its schools, its subscriptions, and its status. */
export function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canUpdate = useCan('organization.update');
  const canArchive = useCan('organization.archive');

  const [isEditOpen, setEditOpen] = useState(false);
  const [isStatusOpen, setStatusOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.organizations.detail(orgId ?? ''),
    queryFn: () => fetchOrganization(orgId ?? ''),
    enabled: Boolean(orgId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.organizations.detail(orgId ?? '') });
    void queryClient.invalidateQueries({ queryKey: qk.organizations.all });
  };

  useDocumentTitle(query.data?.name ?? 'Organization');

  const org = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={org?.name ?? 'Organization'}
        description={org?.slug}
        above={
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
            onClick={() => navigate(paths.admin.organizations)}
          >
            Back to organizations
          </Button>
        }
        actions={
          org ? (
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
        {org ? (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                title="Overview"
                actions={<Badge tone={STATUS_TONE[org.status]}>{org.status}</Badge>}
              />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Country">{org.country ?? '—'}</Detail>
                <Detail label="Timezone">{org.timezone}</Detail>
                <Detail label="Locale">{org.locale}</Detail>
                <Detail label="Contact">{org.contactName ?? '—'}</Detail>
                <Detail label="Contact email">{org.contactEmail ?? '—'}</Detail>
                <Detail label="Contact phone">{org.contactPhone ?? '—'}</Detail>
                <Detail label="Created">{formatDate(org.createdAt)}</Detail>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Schools" description={`${org.schools.length} school(s) in this organization.`} />
              <CardBody className="p-0">
                {org.schools.length === 0 ? (
                  <p className="p-4 text-sm text-ink-muted">No schools yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {org.schools.map((school) => (
                      <li key={school.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <IconOrganization aria-hidden className="h-4 w-4 text-ink-muted" />
                          <div>
                            <p className="text-ink">{school.name}</p>
                            <p className="text-xs text-ink-muted">{school.slug} · {school.code}</p>
                          </div>
                        </div>
                        <Badge tone={STATUS_TONE[school.status]}>{school.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Subscriptions" />
              <CardBody className="p-0">
                {org.subscriptions.length === 0 ? (
                  <p className="p-4 text-sm text-ink-muted">No subscriptions on record.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {org.subscriptions.map((sub) => (
                      <li key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="text-ink">{sub.plan}</span>
                        <span className="text-ink-muted">
                          {formatDate(sub.startsAt)} – {sub.endsAt ? formatDate(sub.endsAt) : 'ongoing'}
                        </span>
                        <Badge>{sub.status}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </QueryBoundary>

      {org && isEditOpen ? (
        <EditModal
          orgId={org.id}
          defaults={{ name: org.name, contactName: org.contactName ?? '', contactEmail: org.contactEmail ?? '' }}
          onClose={() => setEditOpen(false)}
          onDone={() => {
            setEditOpen(false);
            invalidate();
          }}
        />
      ) : null}
      {org && isStatusOpen ? (
        <StatusModal
          orgId={org.id}
          currentStatus={org.status}
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

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-ink">{children}</p>
    </div>
  );
}

function EditModal({
  orgId,
  defaults,
  onClose,
  onDone,
}: {
  orgId: string;
  defaults: { name: string; contactName: string; contactEmail: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [contactName, setContactName] = useState(defaults.contactName);
  const [contactEmail, setContactEmail] = useState(defaults.contactEmail);

  const mutation = useMutation({
    mutationFn: () => updateOrganization(orgId, { name, contactName, contactEmail }),
    onSuccess: onDone,
  });

  return (
    <Modal isOpen onClose={onClose} title="Edit organization">
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
  orgId,
  currentStatus,
  onClose,
  onDone,
}: {
  orgId: string;
  currentStatus: TenantStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<TenantStatus>(currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => setOrganizationStatus(orgId, status, reason),
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
