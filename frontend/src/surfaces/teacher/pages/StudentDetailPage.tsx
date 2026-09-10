import { useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconBack,
  PageHeader,
  ProgressBar,
} from '@/components/ui';
import { QueryBoundary } from '@/components/feedback';
import { useCan } from '@/auth';
import { fetchStudentMastery, fetchAttempts } from '@/assessment/assessment.api';
import { fetchProgressSummary } from '@/progress/progress.api';
import { fetchGamificationProfile } from '@/gamification/gamification.api';
import { fetchAssignments } from '@/assignments/assignments.api';
import { qk } from '@/query/keys';
import { paths } from '@/routes/paths';
import { formatDate, formatDateTime, formatDuration, formatRelative } from '@/lib/format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { humanize, toneFor } from '../lib/humanize';
import type { StudentNavState } from '../lib/nav-state';
import { RecognitionActions, StudentMissionsCard } from './StudentRecognition';
import { ChangeMasteryButton, TeacherJudgmentsCard } from './StudentMasteryTools';
import { NotesCard } from './StudentNotes';
import { AttemptReviewModal } from './AttemptReview';
import type { AssessmentAttempt } from '@/assessment/assessment.types';

const MASTERY_TONE = {
  NOT_ASSESSED: 'neutral',
  EMERGING: 'warning',
  DEVELOPING: 'info',
  PROFICIENT: 'success',
  MASTERED: 'brand',
} as const;

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
  const [reviewing, setReviewing] = useState<AssessmentAttempt | null>(null);

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
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-ink">{record.topic.name}</span>
                          <div className="flex items-center gap-1">
                            {record.teacherOverride ? <Badge tone="info">Teacher judgement</Badge> : null}
                            <Badge tone={toneFor(MASTERY_TONE, record.level)}>{humanize(record.level)}</Badge>
                            <ChangeMasteryButton record={record} studentId={studentId} />
                          </div>
                        </div>
                        <ProgressBar value={record.scorePercent} label="Score" />
                        {record.teacherOverride && record.overrideNote ? (
                          <p className="text-xs text-ink-muted">&ldquo;{record.overrideNote}&rdquo;</p>
                        ) : null}
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
                      <Button size="sm" variant="ghost" onClick={() => setReviewing(attempt)}>
                        Review
                      </Button>
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
            <div className="mt-4">
              <RecognitionActions studentId={studentId} displayName={displayName} />
            </div>
          </CardBody>
        </Card>

        <TeacherJudgmentsCard
          studentId={studentId}
          topics={masteryQuery.data?.topics ?? []}
          className="lg:col-span-2"
        />

        <StudentMissionsCard studentId={studentId} className="lg:col-span-2" />

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

        {reviewing ? (
          <AttemptReviewModal attempt={reviewing} studentId={studentId} onClose={() => setReviewing(null)} />
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
