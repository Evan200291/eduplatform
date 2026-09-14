import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Field, Input, Modal, Select } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { LearnerPicker } from '@/academic/LearnerPicker';
import { fetchSubjects } from '@/academic/academic.api';
import { archiveLearningPath, generateLearningPath } from '@/learning/learning.api';
import type { LearningPath, PathMode } from '@/learning/learning.types';
import { qk } from '@/query/keys';

/**
 * Laying out a path for one or more learners (blueprint 07). The server builds
 * each path from the learner's mastery and the curriculum's prerequisites; the
 * teacher only chooses the subject, how it is organised and how long it is.
 * Learners are generated one after another so a failure names who it was for.
 */

const MODE_OPTIONS: { value: PathMode; label: string }[] = [
  { value: 'HYBRID', label: 'Balanced (recommended)' },
  { value: 'TOPIC_BASED', label: 'Topic by topic' },
  { value: 'SUBJECT_BASED', label: 'Across the subject' },
  { value: 'GRADE_BASED', label: 'By year group expectations' },
];

export function PlanPathsModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const queryClient = useQueryClient();
  const subjects = useQuery({ queryKey: qk.subjects.all, queryFn: fetchSubjects });
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [mode, setMode] = useState<PathMode>('HYBRID');
  const [topicLimit, setTopicLimit] = useState('12');
  const [includeMastered, setIncludeMastered] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      setProgress(0);
      for (const studentId of studentIds) {
        await generateLearningPath({
          studentId,
          subjectId,
          mode,
          topicLimit: Number(topicLimit),
          includeMastered,
          replaceExisting,
        });
        setProgress((done) => done + 1);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.learningPaths.all });
      onDone(`Planned ${studentIds.length} path${studentIds.length === 1 ? '' : 's'}.`);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: qk.learningPaths.all }),
  });

  const limit = Number(topicLimit);
  const blocked =
    studentIds.length === 0
      ? 'Choose at least one learner.'
      : !subjectId
        ? 'Choose the subject.'
        : !Number.isInteger(limit) || limit < 1 || limit > 40
          ? 'Topics are 1 to 40. A path longer than a term is not a plan.'
          : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title="Plan learning paths"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={blocked !== null} onClick={() => mutation.mutate()}>
            {studentIds.length > 1 ? `Plan ${studentIds.length} paths` : 'Plan path'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? (
          <>
            {progress > 0 ? (
              <p className="text-sm text-ink">
                {progress} of {studentIds.length} were planned before this stopped.
              </p>
            ) : null}
            <ErrorState error={mutation.error} />
          </>
        ) : null}
        {mutation.isPending && studentIds.length > 1 ? (
          <p className="text-sm text-ink-muted">
            Planning {progress + 1} of {studentIds.length}…
          </p>
        ) : null}
        <LearnerPicker source="mine" selected={studentIds} onChange={setStudentIds} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Subject" isRequired>
            <Select
              value={subjectId}
              placeholder={subjects.isPending ? 'Loading…' : 'Choose'}
              onChange={(event) => setSubjectId(event.target.value)}
              options={(subjects.data?.items ?? []).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
          <Field label="Organised">
            <Select value={mode} onChange={(event) => setMode(event.target.value as PathMode)} options={MODE_OPTIONS} />
          </Field>
          <Field label="Topics" hint="1 to 40.">
            <Input type="number" min={1} max={40} value={topicLimit} onChange={(event) => setTopicLimit(event.target.value)} />
          </Field>
        </div>
        <Checkbox
          label="Show topics already mastered, locked"
          hint="Lets the learner see the whole map, not just what is left."
          checked={includeMastered}
          onChange={(event) => setIncludeMastered(event.target.checked)}
        />
        <Checkbox
          label="Replace a learner's current path in this subject"
          hint="The old path is kept in history. Clear this to leave existing paths alone."
          checked={replaceExisting}
          onChange={(event) => setReplaceExisting(event.target.checked)}
        />
        {blocked ? <p className="text-sm text-ink-muted">{blocked}</p> : null}
      </div>
    </Modal>
  );
}

export function ArchivePathModal({
  path,
  onClose,
  onDone,
}: {
  path: LearningPath;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => archiveLearningPath(path.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.learningPaths.all });
      onDone();
    },
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Archive this path?"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Keep it
          </Button>
          <Button variant="danger" isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            Archive
          </Button>
        </>
      }
    >
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <p className="text-ink">
        {path.student.displayName} stops seeing it. Everything they finished stays on their record, and you can plan a new
        path at any time.
      </p>
    </Modal>
  );
}
