import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  IconAdd,
  IconOrganization,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { createOrganization, fetchOrganizations } from '@/tenancy/tenancy.api';
import type { OrganizationSummary, TenantStatus } from '@/tenancy/tenancy.types';

const STATUS_TONE: Record<TenantStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'info',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

/** Customers on the platform: every organization, its schools, and its status. */
export function OrganizationsPage() {
  useDocumentTitle('Organizations');
  const navigate = useNavigate();
  const canCreate = useCan('organization.create');

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.organizations.list({ page, search }),
    queryFn: () => fetchOrganizations({ page, pageSize: 20, search: search || undefined }),
  });

  const columns: Column<OrganizationSummary>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.slug}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> },
    { key: 'schools', header: 'Schools', isNumeric: true, render: (row) => row._count.schools },
    { key: 'users', header: 'Users', isNumeric: true, render: (row) => row._count.users },
    { key: 'country', header: 'Country', className: 'hidden sm:table-cell', render: (row) => row.country ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organizations"
        description="Customers on the platform."
        actions={
          canCreate ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New organization
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="border-b border-line p-4">
          <Input
            placeholder="Search by name or slug"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="max-w-sm"
            aria-label="Search organizations"
          />
        </div>

        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          <DataTable
            caption="Organizations"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.admin.organizationDetail(row.id))}
            emptyState={
              <EmptyState
                icon={<IconOrganization className="h-8 w-8" aria-hidden />}
                title="No organizations found"
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

      {isCreateOpen ? (
        <CreateOrganizationModal
          onClose={() => setCreateOpen(false)}
          onDone={(org) => {
            setCreateOpen(false);
            navigate(paths.admin.organizationDetail(org.id));
          }}
        />
      ) : null}
    </div>
  );
}

function CreateOrganizationModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (org: OrganizationSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en');

  const create = useMutation({
    mutationFn: () => createOrganization({ name, slug, timezone, locale }),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: qk.organizations.all });
      onDone(org);
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="New organization">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        {create.error ? <ErrorState error={create.error} /> : null}
        <Field label="Name" isRequired>
          <Input required value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Slug" isRequired hint="Used in URLs and school lookup.">
          <Input required value={slug} onChange={(event) => setSlug(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Timezone">
            <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </Field>
          <Field label="Locale">
            <Select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              options={[
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'French' },
                { value: 'es', label: 'Spanish' },
              ]}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
