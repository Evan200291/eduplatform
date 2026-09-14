import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { LearnerPicker } from '@/academic/LearnerPicker';
import { setAssignmentTargets } from '@/assignments/assignments.api';
import { qk } from '@/query/keys';

/**
 * Adding learners to work already set — a new arrival, or someone who was
 * missed. Targets are added, never replaced from here, so nobody already
 * working on it loses their place.
 */
export function AddLearnersModal({ assignmentId, onClose }: { assignmentId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const mutation = useMutation({
    mutationFn: () =>
      setAssignmentTargets(assignmentId, {
        targets: studentIds.map((targetId) => ({ targetType: 'STUDENT', targetId })),
        replace: false,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.assignments.detail(assignmentId) });
      void queryClient.invalidateQueries({ queryKey: qk.assignments.monitor(assignmentId) });
      onClose();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={false}
      title="Add learners"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={studentIds.length === 0} onClick={() => mutation.mutate()}>
            {studentIds.length > 1 ? `Add ${studentIds.length} learners` : 'Add learner'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Everyone already on this work keeps their place. The learners you add see it in their set work.
        </p>
        <LearnerPicker source="mine" selected={studentIds} onChange={setStudentIds} />
      </div>
    </Modal>
  );
}
