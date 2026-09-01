import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, IconStart, IconSuccess, PageHeader, text } from '@/components/ui';
import { QueryBoundary, ErrorState } from '@/components/feedback';
import { cn } from '@/lib/cn';
import { fetchAssessments } from '@/assessment/assessment.api';
import { qk } from '@/query/keys';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { paths } from '@/routes/paths';
import { AssessmentPlayer } from '../components/AssessmentPlayer';

/**
 * The screening check: a short, ungraded-feeling assessment that finds where
 * a new learner should start. Blueprint §03: "not a test, not scored" in the
 * way it's presented — `AssessmentPlayer` already withholds band/placement
 * language, so this screen just needs to keep its own copy in that register.
 *
 * The visual register matters as much as the copy here: a warm tinted panel
 * with a big friendly start button reads as an invitation, where a bare white
 * card with a small button reads as an exam sheet. The "not scored" badge stays
 * the first thing on the card for the same reason.
 */
export function ScreeningPage() {
  useDocumentTitle('Getting started');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  const query = useQuery({
    queryKey: qk.assessment.definitions({ kind: 'SCREENING' }),
    queryFn: () => fetchAssessments(),
  });

  const screening = query.data?.items.find((a) => a.kind === 'SCREENING');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Getting started" description="A short check so we know where to begin." />

      <QueryBoundary isLoading={query.isPending} error={query.error}>
        {!screening ? (
          <Card>
            <CardBody className="p-8 text-center text-ink-muted">
              There isn&apos;t a starting check for your subject yet — ask your teacher.
            </CardBody>
          </Card>
        ) : finished ? (
          <Card className="border-2 border-success-muted bg-success-soft">
            <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
              <span
                aria-hidden
                className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-contrast shadow-md"
              >
                <IconSuccess className="h-8 w-8" />
              </span>
              <p className={cn(text.heading, 'text-2xl')}>All done — thank you!</p>
              <p className="max-w-prose leading-body text-ink">
                Your teacher will look this over and set up your learning path.
              </p>
              <Button size="lg" onClick={() => navigate(paths.learn.home)}>
                Go to my learning
              </Button>
            </CardBody>
          </Card>
        ) : started ? (
          <AssessmentPlayer
            assessmentId={screening.id}
            onComplete={() => {
              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              setFinished(true);
            }}
          />
        ) : (
          <Card className="border-2 border-play-6-soft bg-play-6-soft">
            <CardBody className="flex flex-col items-center gap-4 p-8 text-center">
              <Badge tone="info" variant="solid">
                Not scored
              </Badge>
              <p className={cn(text.heading, 'text-2xl')}>There&apos;s no pass or fail here</p>
              <p className="max-w-prose leading-body text-ink">
                We&apos;ll ask a few questions to see where to start. Just do your best — and it&apos;s
                fine to say you don&apos;t know.
              </p>
              {query.error ? <ErrorState error={query.error} /> : null}
              <Button
                size="lg"
                leadingIcon={<IconStart aria-hidden className="h-5 w-5" />}
                onClick={() => setStarted(true)}
              >
                Let&apos;s go
              </Button>
            </CardBody>
          </Card>
        )}
      </QueryBoundary>
    </div>
  );
}
