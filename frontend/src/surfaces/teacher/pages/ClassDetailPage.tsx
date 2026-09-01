import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  IconBack,
  IconEdit,
  IconUsers,
  Input,
  Modal,
  PageHeader,
  type Column,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchClass, fetchClassRoster, updateClass } from '@/academic/academic.api';
import type { ClassRosterEntry, SchoolClass } from '@/academic/academic.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { useDocumentTitle } from '@/hooks/use-document-title';
import type { StudentNavState } from '../lib/nav-state';

/** One class: its details, and the roster a teacher jumps into a student from. */
export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  if (!classId) return <Navigate to={paths.teach.classes} replace />;
  return <ClassDetail classId={classId} />;
}

function ClassDetail({ classId }: { classId: string }) {
  const canWrite = useCan('class.write');
  const [isEditing, setEditing] = useState(false);
  const classQuery = useQuery({ queryKey: qk.classes.detail(classId), queryFn: () => fetchClass(classId) });
  const rosterQuery = useQuery({
    queryKey: qk.classes.roster(classId),
    queryFn: () => fetchClassRoster(classId),
  });

  useDocumentTitle(classQuery.data?.name ?? 'Class');

  const columns: Column<ClassRosterEntry>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => {
        const state: StudentNavState = {
          displayName: row.user.displayName,
          classId,
          className: classQuery.data?.name,
        };
        return (
          <div className="flex items-center gap-3">
            <Avatar name={row.user.displayName} size="sm" />
            <div className="min-w-0">
              <Link to={paths.teach.studentDetail(row.user.id)} state={state} className="text-ink hover:underline">
                {row.user.displayName}
              </Link>
              {row.user.nickname ? (
                <p className="text-xs text-ink-muted">&ldquo;{row.user.nickname}&rdquo;</p>
              ) : null}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <ButtonLink
            to={paths.teach.classes}
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
          >
            All classes
          </ButtonLink>
        }
        title={classQuery.data?.name ?? 'Class'}
        description={classQuery.data ? `Class code ${classQuery.data.code}` : undefined}
        actions={
          canWrite && classQuery.data ? (
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<IconEdit aria-hidden className="h-4 w-4" />}
              onClick={() => setEditing(true)}
            >
              Edit class
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader
          title="Roster"
          description={rosterQuery.data ? `${rosterQuery.data.length} student(s)` : undefined}
        />
        <CardBody className="p-0">
          <QueryBoundary
            isLoading={rosterQuery.isPending || classQuery.isPending}
            error={rosterQuery.error ?? classQuery.error}
            onRetry={() => {
              void rosterQuery.refetch();
              void classQuery.refetch();
            }}
            isEmpty={(rosterQuery.data ?? []).length === 0}
            emptyState={
              <EmptyState
                icon={<IconUsers className="h-8 w-8" />}
                title="No students yet"
                description="Nobody is enrolled in this class."
                className="border-none"
              />
            }
          >
            <DataTable
              caption="Students in this class"
              rows={rosterQuery.data ?? []}
              columns={columns}
              getRowKey={(row) => row.id}
            />
          </QueryBoundary>
        </CardBody>
      </Card>

      {isEditing && classQuery.data ? (
        <EditClassModal schoolClass={classQuery.data} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

function EditClassModal({ schoolClass, onClose }: { schoolClass: SchoolClass; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(schoolClass.name);
  const [code, setCode] = useState(schoolClass.code);

  const mutation = useMutation({
    mutationFn: () => updateClass(schoolClass.id, { name: name.trim(), code: code.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.classes.detail(schoolClass.id) });
      void queryClient.invalidateQueries({ queryKey: qk.classes.mine });
      void queryClient.invalidateQueries({ queryKey: qk.classes.all });
      onClose();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit class"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={name.trim().length < 2}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Code" hint="Letters, numbers or hyphens.">
          <Input value={code} onChange={(event) => setCode(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
