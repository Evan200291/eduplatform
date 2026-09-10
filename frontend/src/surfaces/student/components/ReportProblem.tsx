import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useCan } from '@/auth';
import { createContentReport } from '@/content/content.api';
import type { ContentReportReason } from '@/content/content.types';

/**
 * "Something's wrong with this" — the learner's side of content moderation
 * (blueprint 10 safety). A report lands in the school's moderation queue; the
 * learner can only ever see their own.
 *
 * Worded for a child: the reasons are what they would notice ("the answer
 * marked me wrong but I was right"), not the moderation vocabulary.
 */

const REASONS: { value: ContentReportReason; label: string }[] = [
  { value: 'WRONG_ANSWER_KEY', label: 'I was marked wrong but I think I was right' },
  { value: 'FACTUAL_ERROR', label: 'Something in it is not true' },
  { value: 'BROKEN_ACTIVITY', label: 'It does not work properly' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'It has something upsetting or unkind in it' },
  { value: 'AGE_UNSUITABLE', label: 'It is too grown-up for me' },
  { value: 'OTHER', label: 'Something else' },
];

export function ReportProblemButton({ activityId, lessonId }: { activityId?: string; lessonId?: string }) {
  const canReport = useCan('content.report.create');
  const [isOpen, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  if (!canReport || (!activityId && !lessonId)) return null;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} disabled={sent}>
        {sent ? 'Thanks — reported' : 'Report a problem'}
      </Button>
      {isOpen ? (
        <ReportModal
          activityId={activityId}
          lessonId={lessonId}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setSent(true);
          }}
        />
      ) : null}
    </>
  );
}

function ReportModal({
  activityId,
  lessonId,
  onClose,
  onDone,
}: {
  activityId?: string;
  lessonId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ContentReportReason | ''>('');
  const [details, setDetails] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      createContentReport({
        ...(activityId ? { activityId } : {}),
        ...(lessonId ? { lessonId } : {}),
        reason: reason as ContentReportReason,
        ...(details.trim() ? { details: details.trim() } : {}),
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Tell us what's wrong"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={!reason} onClick={() => mutation.mutate()}>
            Send
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-ink">A grown-up at your school will look at it. You won&apos;t get in trouble for telling us.</p>
        <Field label="What's the problem?" isRequired>
          <Select
            value={reason}
            placeholder="Choose one"
            onChange={(event) => setReason(event.target.value as ContentReportReason)}
            options={REASONS}
          />
        </Field>
        <Field label="Tell us more" hint="Optional.">
          <Textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
