import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { fetchActivityStaff, fetchLesson, publishActivity, updateActivity, updateLesson } from '@/content/content.api';
import type { ActivityStaffDetail, DifficultyBand, LessonDetail } from '@/content/content.types';
import { qk } from '@/query/keys';

/**
 * Editing a lesson or activity after it was created, and publishing an
 * activity the way blueprint 05 asks: with a summary of what changed and a
 * clear statement of whether learners' earlier evidence still stands.
 */

const BANDS: DifficultyBand[] = ['FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION'];
const BAND_OPTIONS = BANDS.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }));

function Footer({
  onClose,
  isPending,
  disabled,
  label,
  onConfirm,
}: {
  onClose: () => void;
  isPending: boolean;
  disabled: boolean;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <>
      <Button variant="outline" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button isLoading={isPending} disabled={disabled} onClick={onConfirm}>
        {label}
      </Button>
    </>
  );
}

export function EditLessonModal({ lessonId, onClose }: { lessonId: string; onClose: () => void }) {
  const query = useQuery({ queryKey: qk.lessons.detail(lessonId), queryFn: () => fetchLesson(lessonId) });
  return (
    <Modal isOpen onClose={onClose} size="lg" title="Edit lesson">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data ? <LessonForm lesson={query.data} onClose={onClose} /> : null}
      </QueryBoundary>
    </Modal>
  );
}

function LessonForm({ lesson, onClose }: { lesson: LessonDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? '');
  const [body, setBody] = useState(lesson.body ?? '');
  const [band, setBand] = useState<DifficultyBand>(lesson.difficultyBand);
  const [minutes, setMinutes] = useState(String(lesson.estimatedMinutes ?? 15));
  const [requiresAudio, setRequiresAudio] = useState(lesson.requiresAudio);

  const mutation = useMutation({
    mutationFn: () =>
      updateLesson(lesson.id, {
        title: title.trim(),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(body.trim() ? { body: body.trim() } : {}),
        difficultyBand: band,
        estimatedMinutes: Number(minutes),
        requiresAudio,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.lessons.all });
      onClose();
    },
  });
  const minutesValue = Number(minutes);
  const invalid = title.trim().length < 2 || !Number.isInteger(minutesValue) || minutesValue < 1 || minutesValue > 600;

  return (
    <div className="flex flex-col gap-4">
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      {lesson.status === 'PUBLISHED' ? (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-ink">
          This lesson is published. Saving moves it to Revised — publish it again to put the changes live.
        </p>
      ) : null}
      <Field label="Title" isRequired>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Summary" hint="One or two sentences shown before the lesson opens.">
        <Textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </Field>
      <Field label="Introduction" hint="Markdown. The lesson's sections are edited separately.">
        <Textarea rows={6} value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Difficulty band">
          <Select value={band} onChange={(event) => setBand(event.target.value as DifficultyBand)} options={BAND_OPTIONS} />
        </Field>
        <Field label="Estimated minutes" hint="1 to 600.">
          <Input type="number" min={1} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </Field>
      </div>
      <Checkbox
        label="Needs audio to be usable"
        hint="Flags the lesson for learners who cannot use sound."
        checked={requiresAudio}
        onChange={(event) => setRequiresAudio(event.target.checked)}
      />
      <div className="flex justify-end gap-2">
        <Footer onClose={onClose} isPending={mutation.isPending} disabled={invalid} label="Save" onConfirm={() => mutation.mutate()} />
      </div>
    </div>
  );
}

export function EditActivityModal({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const query = useQuery({ queryKey: qk.activities.detail(activityId), queryFn: () => fetchActivityStaff(activityId) });
  return (
    <Modal isOpen onClose={onClose} size="lg" title="Edit activity">
      <QueryBoundary isLoading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
        {query.data ? <ActivityForm activity={query.data} onClose={onClose} /> : null}
      </QueryBoundary>
    </Modal>
  );
}

function ActivityForm({ activity, onClose }: { activity: ActivityStaffDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(activity.title);
  const [instructions, setInstructions] = useState(activity.instructions ?? '');
  const [band, setBand] = useState<DifficultyBand>(activity.difficultyBand);
  const [minutes, setMinutes] = useState(String(activity.estimatedMinutes ?? 10));
  const [points, setPoints] = useState(String(activity.pointsValue));
  const [passThreshold, setPassThreshold] = useState(String(activity.passThreshold ?? 70));
  const [maxAttempts, setMaxAttempts] = useState(activity.maxAttempts ? String(activity.maxAttempts) : '');

  const mutation = useMutation({
    mutationFn: () =>
      updateActivity(activity.id, {
        title: title.trim(),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        difficultyBand: band,
        estimatedMinutes: Number(minutes),
        pointsValue: Number(points),
        passThreshold: Number(passThreshold),
        maxAttempts: maxAttempts ? Number(maxAttempts) : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.activities.all });
      onClose();
    },
  });

  const n = (value: string) => Number(value);
  const blockedReason =
    title.trim().length < 2
      ? 'A title needs at least two characters.'
      : !Number.isInteger(n(minutes)) || n(minutes) < 1 || n(minutes) > 600
        ? 'Minutes are 1 to 600.'
        : !Number.isInteger(n(points)) || n(points) < 0 || n(points) > 10_000
          ? 'Points are 0 to 10,000.'
          : !Number.isInteger(n(passThreshold)) || n(passThreshold) < 0 || n(passThreshold) > 100
            ? 'The pass mark is a percentage, 0 to 100.'
            : maxAttempts && (!Number.isInteger(n(maxAttempts)) || n(maxAttempts) < 1 || n(maxAttempts) > 100)
              ? 'Attempts are 1 to 100, or empty for no limit.'
              : null;

  return (
    <div className="flex flex-col gap-4">
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      {activity.status === 'PUBLISHED' ? (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-ink">
          This activity is published. Saving moves it to Revised — publish it again to put the changes live.
        </p>
      ) : null}
      <Field label="Title" isRequired>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Instructions" hint="What the learner reads before starting.">
        <Textarea rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Difficulty band">
          <Select value={band} onChange={(event) => setBand(event.target.value as DifficultyBand)} options={BAND_OPTIONS} />
        </Field>
        <Field label="Estimated minutes">
          <Input type="number" min={1} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </Field>
        <Field label="Points">
          <Input type="number" min={0} max={10000} value={points} onChange={(event) => setPoints(event.target.value)} />
        </Field>
        <Field label="Pass mark (%)">
          <Input type="number" min={0} max={100} value={passThreshold} onChange={(event) => setPassThreshold(event.target.value)} />
        </Field>
        <Field label="Most attempts" hint="Empty for no limit.">
          <Input type="number" min={1} max={100} value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} />
        </Field>
      </div>
      {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      <div className="flex justify-end gap-2">
        <Footer onClose={onClose} isPending={mutation.isPending} disabled={blockedReason !== null} label="Save" onConfirm={() => mutation.mutate()} />
      </div>
    </div>
  );
}

/**
 * Publishing snapshots the activity into a new immutable version. Blueprint
 * 05: a revision must say whether it invalidates evidence learners produced
 * on the earlier version — a changed answer key does, a typo fix does not.
 */
export function PublishActivityModal({
  activity,
  onClose,
  onDone,
}: {
  activity: { id: string; title: string; currentVersion: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [changeSummary, setChangeSummary] = useState('');
  const [invalidates, setInvalidates] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const isRevision = activity.currentVersion > 0;

  const mutation = useMutation({
    mutationFn: () =>
      publishActivity(activity.id, {
        ...(changeSummary.trim() ? { changeSummary: changeSummary.trim() } : {}),
        invalidatesPriorEvidence: invalidates,
        ...(reviewNotes.trim() ? { reviewNotes: reviewNotes.trim() } : {}),
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeOnBackdropClick={false}
      title={`Publish “${activity.title}”`}
      footer={
        <Footer
          onClose={onClose}
          isPending={mutation.isPending}
          disabled={isRevision && !changeSummary.trim()}
          label={isRevision ? `Publish version ${activity.currentVersion + 1}` : 'Publish'}
          onConfirm={() => mutation.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field
          label="What changed"
          isRequired={isRevision}
          hint={isRevision ? 'Shown in the version history. Required for a revision.' : 'Optional for a first version.'}
        >
          <Textarea rows={2} value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} />
        </Field>
        {isRevision ? (
          <Checkbox
            label="This change means earlier answers no longer count as evidence"
            hint="Tick for a corrected answer key or a changed question; leave clear for wording fixes."
            checked={invalidates}
            onChange={(event) => setInvalidates(event.target.checked)}
          />
        ) : null}
        <Field label="Review notes" hint="Optional. For the reviewer's record.">
          <Textarea rows={2} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
