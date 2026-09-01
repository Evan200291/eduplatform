import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, DataTable, EmptyState, IconClass, PageHeader, type Column } from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { fetchGrades, fetchMyClasses } from '@/academic/academic.api';
import type { SchoolClass } from '@/academic/academic.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { useDocumentTitle } from '@/hooks/use-document-title';

/** Every class this teacher is assigned to, with a way into each roster. */
export function ClassesPage() {
  useDocumentTitle('Classes');
  const navigate = useNavigate();

  const classesQuery = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });
  const gradesQuery = useQuery({ queryKey: qk.grades.all, queryFn: fetchGrades });

  const gradeNameById = new Map((gradesQuery.data?.items ?? []).map((grade) => [grade.id, grade.name]));
  const rows = classesQuery.data?.items ?? [];

  const columns: Column<SchoolClass>[] = [
    {
      key: 'name',
      header: 'Class',
      render: (row) => <span className="font-medium text-ink">{row.name}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      className: 'hidden sm:table-cell text-ink-muted',
      render: (row) => row.code,
    },
    {
      key: 'grade',
      header: 'Grade',
      render: (row) => (row.gradeId ? (gradeNameById.get(row.gradeId) ?? '—') : '—'),
    },
    {
      key: 'roster',
      header: 'Students',
      isNumeric: true,
      render: (row) => row.studentCount ?? '—',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Classes" description="The classes you teach." />

      <QueryBoundary
        isLoading={classesQuery.isPending}
        error={classesQuery.error}
        onRetry={() => void classesQuery.refetch()}
        isEmpty={rows.length === 0}
        emptyState={
          <EmptyState
            icon={<IconClass className="h-8 w-8" />}
            title="No classes yet"
            description="You are not assigned to any classes."
          />
        }
      >
        <Card>
          <DataTable
            caption="Your classes"
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.teach.classDetail(row.id))}
          />
        </Card>
      </QueryBoundary>
    </div>
  );
}
