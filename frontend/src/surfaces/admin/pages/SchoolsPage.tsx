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
  IconSchool,
  Input,
  Modal,
  PageHeader,
  Pagination,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan, useProfile } from '@/auth';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { createSchool, fetchSchools } from '@/tenancy/tenancy.api';
import type { SchoolSummary, TenantStatus } from '@/tenancy/tenancy.types';

const STATUS_TONE: Record<TenantStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'info',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

/** Every school (tenant) on the platform: its slug, status, and headline usage. */
export function SchoolsPage() {
  useDocumentTitle('Schools');
  const navigate = useNavigate();
  const canCreate = useCan('school.create');
  const profile = useProfile();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.schools.list({ page, search }),
    queryFn: () => fetchSchools({ page, pageSize: 20, search: search || undefined }),
  });

  const columns: Column<SchoolSummary>[] = [
    {
      key: 'name',
      header: 'School',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.slug} · {row.code}</p>
        </div>
      ),
    },
    { key: 'organization', header: 'Organization', render: (row) => row.organization.name },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> },
    { key: 'users', header: 'Users', isNumeric: true, render: (row) => row._count.users },
    { key: 'classes', header: 'Classes', isNumeric: true, className: 'hidden sm:table-cell', render: (row) => row._count.classes },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schools"
        description="Tenants on the platform."
        actions={
          canCreate ? (
            <Button leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New school
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="border-b border-line p-4">
          <Input
            placeholder="Search by name, slug or code"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="max-w-sm"
            aria-label="Search schools"
          />
        </div>

        <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
          <DataTable
            caption="Schools"
            rows={query.data?.items ?? []}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.admin.schoolDetail(row.id))}
            emptyState={
              <EmptyState
                icon={<IconSchool className="h-8 w-8" aria-hidden />}
                title="No schools found"
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
        <CreateSchoolModal
          defaultOrganizationId={profile?.organization?.id}
          onClose={() => setCreateOpen(false)}
          onDone={(school) => {
            setCreateOpen(false);
            navigate(paths.admin.schoolDetail(school.id));
          }}
        />
      ) : null}
    </div>
  );
}

function CreateSchoolModal({
  defaultOrganizationId,
  onClose,
  onDone,
}: {
  defaultOrganizationId?: string;
  onClose: () => void;
  onDone: (school: SchoolSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [code, setCode] = useState('');
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId ?? '');

  const create = useMutation({
    mutationFn: () => createSchool({ name, slug, code, organizationId }),
    onSuccess: (school) => {
      void queryClient.invalidateQueries({ queryKey: qk.schools.all });
      onDone(school);
    },
  });

  return (
    <Modal isOpen onClose={onClose} title="New school">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug" isRequired>
            <Input required value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          <Field label="Code" isRequired>
            <Input required value={code} onChange={(event) => setCode(event.target.value)} />
          </Field>
        </div>
        <Field label="Organization id" isRequired hint="The organization this school belongs to.">
          <Input required value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} />
        </Field>
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
