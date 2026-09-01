import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  Field,
  IconBack,
  PageHeader,
  ProgressBar,
  Select,
  Textarea,
  type SelectOption,
} from '@/components/ui';
import { QueryBoundary, ErrorState } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchStudentMastery, fetchAttempts } from '@/assessment/assessment.api';
import { fetchProgressSummary, fetchStudentNotes, createStudentNote } from '@/progress/progress.api';
import { fetchGamificationProfile } from '@/gamification/gamification.api';
import { fetchAssignments } from '@/assignments/assignments.api';
import type { TeacherNote } from '@/progress/progress.types';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate, formatDateTime, formatDuration, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';
import type { StudentNavState } from '../lib/nav-state';

const MASTERY_TONE = {
  NOT_ASSESSED: 'neutral',
  EMERGING: 'warning',
  DEVELOPING: 'info',
  PROFICIENT: 'success',
  MASTERED: 'brand',
} as const;

const VISIBILITY_OPTIONS: SelectOption[] = [
  { value: 'PRIVATE_TEACHER', label: 'Only me' },
  { value: 'AUTHORIZED_STAFF', label: 'Authorized staff' },
  { value: 'SCHOOL_RECORD', label: 'School record' },
  { value: 'PARENT_VISIBLE', label: 'Visible to parent (when parent access is enabled)' },
];

/** One student: mastery, progress, evidence, class work, gamification and notes. */
export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  if (!studentId) return <Navigate to={paths.teach.students} replace />;
  return <StudentDetail studentId={studentId} />;
}

function StudentDetail({ studentId }: { studentId: string }) {
  const location = useLocation();
  const navState = (location.state ?? {}) as StudentNavState;
  const displayName = navState.displayName ?? 'Student';

  useDocumentTitle(navState.displayName ?? 'Student');

  const canReadNotes = useCan('note.read');
  const canWriteNotes = useCan('note.write');

  const masteryQuery = useQuery({
    queryKey: qk.assessment.mastery(studentId),
    queryFn: () => fetchStudentMastery(studentId),
  });
  const progressQuery = useQuery({
    queryKey: qk.progress.summary({ studentId }),
    queryFn: () => fetchProgressSummary({ studentId }),
  });
  const attemptsQuery = useQuery({
    queryKey: qk.assessment.attempts({ studentId, pageSize: 8 }),
    queryFn: () => fetchAttempts({ studentId, pageSize: 8 }),
  });
  const gamificationQuery = useQuery({
    queryKey: qk.gamification.profile(studentId),
    queryFn: () => fetchGamificationProfile(studentId),
  });
  const assignmentsQuery = useQuery({
    queryKey: qk.assignments.list({ classId: navState.classId }),
    queryFn: () => fetchAssignments({ classId: navState.classId, pageSize: 10 }),
    enabled: Boolean(navState.classId),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        above={
          <ButtonLink
            to={paths.teach.students}
            variant="ghost"
            size="sm"
            leadingIcon={<IconBack aria-hidden className="h-4 w-4" />}
          >
            All students
          </ButtonLink>
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={displayName} />
            {displayName}
          </span>
        }
        description={navState.className ? `In ${navState.className}` : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mastery" description="What the evidence shows, by topic." />
          <CardBody>
            <QueryBoundary
              isLoading={masteryQuery.isPending}
              error={masteryQuery.error}
              onRetry={() => void masteryQuery.refetch()}
              isEmpty={(masteryQuery.data?.topics.length ?? 0) === 0}
              emptyState={<EmptyState title="No mastery evidence yet" className="border-none py-6" />}
            >
              {masteryQuery.data ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-4 text-sm text-ink-muted">
                    <span>
                      Average <span className="font-medium text-ink">{masteryQuery.data.summary.averagePercent}%</span>
                    </span>
                    <span>
                      Tracked <span className="font-medium text-ink">{masteryQuery.data.summary.totalTracked}</span>
                    </span>
                    <span>
                      Due for review{' '}
                      <span className="font-medium text-ink">{masteryQuery.data.summary.dueForReview}</span>
                    </span>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {masteryQuery.data.topics.map((record) => (
                      <li key={record.id} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-ink">{record.topic.name}</span>
                          <Badge tone={toneFor(MASTERY_TONE, record.level)}>{humanize(record.level)}</Badge>
                        </div>
                        <ProgressBar value={record.scorePercent} label="Score" />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </QueryBoundary>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Progress" description="Engagement across activities and lessons." />
          <CardBody>
            <QueryBoundary
              isLoading={progressQuery.isPending}
              error={progressQuery.error}
              onRetry={() => void progressQuery.refetch()}
            >
              {progressQuery.data ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <Stat label="Completed" value={progressQuery.data.totals.activitiesCompleted} />
                    <Stat label="Touched" value={progressQuery.data.totals.activitiesTouched} />
                    <Stat label="Attempts" value={progressQuery.data.totals.attempts} />
                    <Stat label="Time" value={formatDuration(progressQuery.data.totals.timeSpentSeconds)} />
                    <Stat label="Hints used" value={progressQuery.data.totals.hintsUsed} />
                    <Stat label="Last active" value={formatRelative(progressQuery.data.totals.lastActivityAt)} />
                  </div>
                  {progressQuery.data.groups.length > 0 ? (
                    <ul className="flex flex-col gap-2 border-t border-line pt-3">
                      {progressQuery.data.groups.slice(0, 6).map((group) => (
                        <li key={group.key} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-ink">{group.label}</span>
                          <span className="text-ink-muted">
                            {group.completed}/{group.activities} complete
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </QueryBoundary>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent assessment evidence" description="The learner's most recent attempts." />
          <CardBody className="p-0">
            <QueryBoundary
              isLoading={attemptsQuery.isPending}
              error={attemptsQuery.error}
              onRetry={() => void attemptsQuery.refetch()}
              isEmpty={(attemptsQuery.data?.items.length ?? 0) === 0}
              emptyState={<EmptyState title="No attempts yet" className="border-none py-6" />}
            >
              <ul className="divide-y divide-line">
                {(attemptsQuery.data?.items ?? []).map((attempt) => (
                  <li key={attempt.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-ink">{attempt.assessment.title}</p>
                      <p className="text-xs text-ink-muted">{formatDateTime(attempt.startedAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {attempt.scorePercent !== null ? (
                        <span className="text-ink-muted">{attempt.scorePercent}%</span>
                      ) : null}
                      <Badge tone={attempt.status === 'COMPLETED' ? 'success' : 'neutral'}>
                        {humanize(attempt.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </QueryBoundary>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Gamification" description="Points, streaks and badges." />
          <CardBody>
            <QueryBoundary
              isLoading={gamificationQuery.isPending}
              error={gamificationQuery.error}
              onRetry={() => void gamificationQuery.refetch()}
            >
              {gamificationQuery.data ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <Stat label="Points" value={gamificationQuery.data.points.balance} />
                    <Stat label="This week" value={gamificationQuery.data.points.earnedThisWeek} />
                    <Stat label="Badges earned" value={gamificationQuery.data.badges.earned.length} />
                  </div>
                  {gamificationQuery.data.streaks.length > 0 ? (
                    <ul className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
                      {gamificationQuery.data.streaks.map((streak) => (
                        <li key={streak.kind} className="flex items-center justify-between gap-2">
                          <span className="text-ink">{humanize(streak.kind)}</span>
                          <span className="text-ink-muted">
                            {streak.currentLength} day{streak.currentLength === 1 ? '' : 's'}
                            {streak.atRisk ? ' · at risk' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </QueryBoundary>
          </CardBody>
        </Card>

        {navState.classId ? (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Class assignments"
              description={navState.className ? `Set for ${navState.className}` : 'Set for this student’s class'}
            />
            <CardBody className="p-0">
              <QueryBoundary
                isLoading={assignmentsQuery.isPending}
                error={assignmentsQuery.error}
                onRetry={() => void assignmentsQuery.refetch()}
                isEmpty={(assignmentsQuery.data?.items.length ?? 0) === 0}
                emptyState={<EmptyState title="Nothing set for this class yet" className="border-none py-6" />}
              >
                <ul className="divide-y divide-line">
                  {(assignmentsQuery.data?.items ?? []).map((assignment) => (
                    <li key={assignment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="text-ink">{assignment.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-muted">{assignment.dueAt ? formatDate(assignment.dueAt) : 'No due date'}</span>
                        <Badge tone={assignment.isPublished ? 'success' : 'neutral'}>
                          {assignment.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </QueryBoundary>
            </CardBody>
          </Card>
        ) : null}

        {canReadNotes ? (
          <NotesCard studentId={studentId} canWrite={canWriteNotes} className="lg:col-span-2" />
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function NotesCard({
  studentId,
  canWrite,
  className,
}: {
  studentId: string;
  canWrite: boolean;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<TeacherNote['visibility']>('PRIVATE_TEACHER');

  const notesQuery = useQuery({
    queryKey: qk.progress.notes(studentId),
    queryFn: () => fetchStudentNotes(studentId),
  });

  const createNote = useMutation({
    mutationFn: () => createStudentNote({ studentId, body: body.trim(), visibility }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: qk.progress.notes(studentId) });
    },
  });

  return (
    <Card className={className}>
      <CardHeader title="Notes" description="Your record of what you have observed." />
      <CardBody className="p-0">
        <QueryBoundary
          isLoading={notesQuery.isPending}
          error={notesQuery.error}
          onRetry={() => void notesQuery.refetch()}
          isEmpty={(notesQuery.data?.items.length ?? 0) === 0}
          emptyState={<EmptyState title="No notes yet" className="border-none py-6" />}
        >
          <ul className="divide-y divide-line">
            {(notesQuery.data?.items ?? []).map((note) => (
              <li key={note.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <p className="text-ink">{note.body}</p>
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <span>{note.author.displayName}</span>
                  <span>&middot;</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                  <Badge tone="neutral">{humanize(note.visibility)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </QueryBoundary>
      </CardBody>
      {canWrite ? (
        <CardFooter className="flex-col items-stretch gap-3">
          {createNote.error ? <ErrorState error={createNote.error} /> : null}
          <Field label="Add a note" isLabelHidden>
            <Textarea
              placeholder="What did you observe?"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Field label="Visibility" isLabelHidden className="w-48">
              <Select
                options={VISIBILITY_OPTIONS}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as TeacherNote['visibility'])}
              />
            </Field>
            <Button
              onClick={() => createNote.mutate()}
              isLoading={createNote.isPending}
              disabled={body.trim().length === 0}
            >
              Save note
            </Button>
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}
