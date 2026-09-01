import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Card,
  DataTable,
  Pagination,
  EmptyState,
  Field,
  IconLearningPath,
  PageHeader,
  ProgressBar,
  Select,
  type Column,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { fetchLearningPaths } from '@/learning/learning.api';
import { fetchSubjects } from '@/academic/academic.api';
import type { LearningPath } from '@/learning/learning.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize } from '../lib/humanize';

/** The learning paths behind the students you can see, filterable by subject. */
export function LearningPathsPage() {
  useDocumentTitle('Learning paths');
  const navigate = useNavigate();
  const [subjectId, setSubjectId] = useState('');
  const [page, setPage] = useState(1);

  const subjectsQuery = useQuery({ queryKey: qk.subjects.all, queryFn: fetchSubjects });
  const pathsQuery = useQuery({
    queryKey: qk.learningPaths.list({ subjectId: subjectId || undefined, page }),
    queryFn: () =>
      fetchLearningPaths({ ...(subjectId ? { subjectId } : {}), page, pageSize: 20 }),
  });

  const rows = pathsQuery.data?.items ?? [];

  const columns: Column<LearningPath>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => <span className="text-ink">{row.student.displayName}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      className: 'hidden sm:table-cell',
      render: (row) => row.subject.name,
    },
    {
      key: 'mode',
      header: 'Mode',
      className: 'hidden md:table-cell',
      render: (row) => humanize(row.mode),
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (
        <ProgressBar value={row.summary.completionPercent} label="Complete" className="min-w-[8rem]" />
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      render: (row) =>
        !row.requiresApproval ? (
          <Badge tone="neutral">Not required</Badge>
        ) : row.summary.isApproved ? (
          <Badge tone="success">Approved</Badge>
        ) : (
          <Badge tone="warning">Waiting</Badge>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Learning paths" description="What your classes work through." />

      <Card>
        <div className="border-b border-line p-4">
          <Field label="Subject" className="w-56">
            <Select
              placeholder="All subjects"
              options={(subjectsQuery.data?.items ?? []).map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                // Narrowing the filter almost always shortens the list, so
                // holding the old page number would land on an empty one.
                setPage(1);
              }}
            />
          </Field>
        </div>

        <QueryBoundary
          isLoading={pathsQuery.isPending}
          error={pathsQuery.error}
          onRetry={() => void pathsQuery.refetch()}
          isEmpty={rows.length === 0}
          emptyState={
            <EmptyState
              className="border-none"
              icon={<IconLearningPath className="h-8 w-8" />}
              title="No learning paths yet"
              description="Nothing has been generated for this subject yet."
            />
          }
        >
          <DataTable
            caption="Learning paths"
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(paths.teach.pathDetail(row.id))}
          />
          {pathsQuery.data ? (
            <Pagination meta={pathsQuery.data.meta} onPageChange={setPage} />
          ) : null}
        </QueryBoundary>
      </Card>
    </div>
  );
}
