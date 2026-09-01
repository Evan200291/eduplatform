import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Card,
  CardBody,
  DataTable,
  EmptyState,
  Field,
  IconUsers,
  Input,
  PageHeader,
  Select,
  type Column,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { fetchClassRoster, fetchMyClasses } from '@/academic/academic.api';
import type { ClassRosterEntry } from '@/academic/academic.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { useDocumentTitle } from '@/hooks/use-document-title';
import type { StudentNavState } from '../lib/nav-state';

/**
 * A searchable roster. The API has no cross-class "all my students" endpoint,
 * so this narrows to one class at a time — chosen from the teacher's own list —
 * and searches within it, per the class-filter approach the brief calls out.
 */
export function StudentsPage() {
  useDocumentTitle('Students');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [search, setSearch] = useState('');

  const classesQuery = useQuery({ queryKey: qk.classes.mine, queryFn: fetchMyClasses });
  const classes = classesQuery.data?.items ?? [];
  const activeClass = classes.find((c) => c.id === selectedClassId) ?? classes[0];
  const activeClassId = activeClass?.id ?? '';

  const rosterQuery = useQuery({
    queryKey: qk.classes.roster(activeClassId),
    queryFn: () => fetchClassRoster(activeClassId),
    enabled: Boolean(activeClassId),
  });

  const filtered = useMemo(() => {
    const roster = rosterQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return roster;
    return roster.filter(
      (student) =>
        student.user.displayName.toLowerCase().includes(term) ||
        (student.user.nickname ?? '').toLowerCase().includes(term),
    );
  }, [rosterQuery.data, search]);

  const columns: Column<ClassRosterEntry>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => {
        const state: StudentNavState = {
          displayName: row.user.displayName,
          classId: activeClassId,
          className: activeClass?.name,
        };
        return (
          <div className="flex items-center gap-3">
            <Avatar name={row.user.displayName} size="sm" />
            <Link to={paths.teach.studentDetail(row.user.id)} state={state} className="text-ink hover:underline">
              {row.user.displayName}
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Students" description="A searchable list of your students." />

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Class" className="w-56">
          <Select
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            value={activeClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            disabled={classes.length === 0}
          />
        </Field>
        <Field label="Search" className="w-64">
          <Input
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
      </div>

      <Card>
        <CardBody className="p-0">
          <QueryBoundary
            isLoading={classesQuery.isPending || rosterQuery.isPending}
            error={classesQuery.error ?? rosterQuery.error}
            onRetry={() => {
              void classesQuery.refetch();
              void rosterQuery.refetch();
            }}
            isEmpty={filtered.length === 0}
            emptyState={
              <EmptyState
                icon={<IconUsers className="h-8 w-8" />}
                title="No students found"
                description={
                  search ? 'Try a different search.' : 'This class has no students enrolled yet.'
                }
                className="border-none"
              />
            }
          >
            <DataTable caption="Students" rows={filtered} columns={columns} getRowKey={(row) => row.user.id} />
          </QueryBoundary>
        </CardBody>
      </Card>
    </div>
  );
}
