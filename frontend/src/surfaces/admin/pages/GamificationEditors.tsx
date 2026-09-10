import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { LearnerPicker } from '@/academic/LearnerPicker';
import { qk } from '@/query/keys';
import {
  awardBadge,
  grantReward,
  updateBadge,
  updateReward,
} from '@/gamification/gamification.api';
import type { BadgeCatalogueRow, BadgeTier, RewardCatalogueRow } from '@/gamification/gamification.types';
import {
  cancelMissionForStudents,
  enrolInMission,
  fetchMissionProgress,
  updateMission,
} from '@/missions/missions.api';
import type { MissionDefinition, MissionStatus } from '@/missions/missions.types';

/**
 * Edit, award and withdraw dialogs for the Rewards & buddy page.
 *
 * Until these existed the catalogue was create-and-archive only: a typo in a
 * badge name meant archiving it and making a new one, which also split its
 * award history in two.
 */

const TIERS: BadgeTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'SPECIAL'];
const title = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

function Footer({
  onClose,
  isPending,
  disabled,
  label,
  onConfirm,
}: {
  onClose: () => void;
  isPending: boolean;
  disabled?: boolean;
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

// ── Badges ──────────────────────────────────────────────────────────────────

export function EditBadgeModal({
  badge,
  onClose,
  onDone,
}: {
  badge: BadgeCatalogueRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(badge.name);
  const [description, setDescription] = useState(badge.description ?? '');
  const [tier, setTier] = useState<BadgeTier>(badge.tier);
  const [criteriaLabel, setCriteriaLabel] = useState(badge.criteriaLabel ?? '');
  const [pointsValue, setPointsValue] = useState(String(badge.pointsValue));
  const [isActive, setActive] = useState(badge.isActive);
  const [recognisesEffort, setRecognisesEffort] = useState(badge.recognisesEffort);

  const mutation = useMutation({
    mutationFn: () =>
      updateBadge(badge.id, {
        name: name.trim(),
        description: description.trim(),
        tier,
        criteriaLabel: criteriaLabel.trim(),
        pointsValue: Number(pointsValue),
        isActive,
        recognisesEffort,
      }),
    onSuccess: onDone,
  });

  const invalid = !name.trim() || !description.trim() || !criteriaLabel.trim() || Number(pointsValue) < 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit “${badge.name}”`}
      footer={
        <Footer onClose={onClose} isPending={mutation.isPending} disabled={invalid} label="Save" onConfirm={() => mutation.mutate()} />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Learners who already hold this badge keep it. The earning rule itself is not
          editable here — change what it says, not what it measures.
        </p>
        <Field label="Name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Description" isRequired>
          <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label="How it is earned, in the learner’s words" isRequired>
          <Input value={criteriaLabel} onChange={(event) => setCriteriaLabel(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tier">
            <Select
              value={tier}
              onChange={(event) => setTier(event.target.value as BadgeTier)}
              options={TIERS.map((value) => ({ value, label: title(value) }))}
            />
          </Field>
          <Field label="Bonus points when earned">
            <Input type="number" min={0} value={pointsValue} onChange={(event) => setPointsValue(event.target.value)} />
          </Field>
        </div>
        <Checkbox
          label="Recognises effort rather than a score"
          hint="Shown to learners so a badge is not only for the top of the class."
          checked={recognisesEffort}
          onChange={(event) => setRecognisesEffort(event.target.checked)}
        />
        <Checkbox
          label="Can be earned"
          hint="Turn off to pause a badge without archiving it."
          checked={isActive}
          onChange={(event) => setActive(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

export function AwardBadgeModal({
  badge,
  source,
  onClose,
  onDone,
}: {
  badge: BadgeCatalogueRow;
  source: 'mine' | 'all';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => awardBadge(badge.id, studentIds, reason.trim()),
    onSuccess: (result) =>
      onDone(
        `Awarded to ${result.awarded}${result.alreadyHeld ? `; ${result.alreadyHeld} already held it` : ''}.`,
      ),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Award “${badge.name}”`}
      footer={
        <Footer
          onClose={onClose}
          isPending={mutation.isPending}
          disabled={studentIds.length === 0 || !reason.trim()}
          label={`Award to ${studentIds.length || ''}`.trim()}
          onConfirm={() => mutation.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <LearnerPicker source={source} selected={studentIds} onChange={setStudentIds} />
        <Field label="Why" isRequired hint="Kept on the record with the award.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Rewards ─────────────────────────────────────────────────────────────────

export function EditRewardModal({
  reward,
  onClose,
  onDone,
}: {
  reward: RewardCatalogueRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(reward.name);
  const [description, setDescription] = useState(reward.description ?? '');
  const [pointsCost, setPointsCost] = useState(String(reward.pointsCost));
  const [isActive, setActive] = useState(reward.isActive);

  const mutation = useMutation({
    mutationFn: () =>
      updateReward(reward.id, {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        pointsCost: Number(pointsCost),
        isActive,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit “${reward.name}”`}
      footer={
        <Footer
          onClose={onClose}
          isPending={mutation.isPending}
          disabled={!name.trim() || Number(pointsCost) < 0}
          label="Save"
          onConfirm={() => mutation.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          Learners who already own it keep it. A new price applies to the next redemption.
        </p>
        <Field label="Name" isRequired>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Field label="Points cost">
          <Input type="number" min={0} value={pointsCost} onChange={(event) => setPointsCost(event.target.value)} />
        </Field>
        <Checkbox
          label="Available in the shop"
          checked={isActive}
          onChange={(event) => setActive(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

export function GrantRewardModal({
  reward,
  onClose,
  onDone,
}: {
  reward: RewardCatalogueRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => grantReward(reward.id, studentIds, reason.trim()),
    onSuccess: (result) =>
      onDone(`Given to ${result.granted}${result.alreadyHeld ? `; ${result.alreadyHeld} already had it` : ''}.`),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Give “${reward.name}”`}
      footer={
        <Footer
          onClose={onClose}
          isPending={mutation.isPending}
          disabled={studentIds.length === 0 || !reason.trim()}
          label="Give"
          onConfirm={() => mutation.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">A given reward costs the learner no points.</p>
        <LearnerPicker source="all" selected={studentIds} onChange={setStudentIds} />
        <Field label="Why" isRequired hint="Kept on the record.">
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

// ── Missions ────────────────────────────────────────────────────────────────

export function EditMissionModal({
  mission,
  onClose,
  onDone,
}: {
  mission: MissionDefinition;
  onClose: () => void;
  onDone: () => void;
}) {
  const [missionTitle, setTitle] = useState(mission.title);
  const [description, setDescription] = useState(mission.description ?? '');
  const [goalTarget, setGoalTarget] = useState(String(mission.goalTarget));
  const [pointsReward, setPointsReward] = useState(String(mission.pointsReward));
  const [isActive, setActive] = useState(mission.isActive);

  const target = Number(goalTarget);
  const blockedReason =
    missionTitle.trim().length < 2
      ? 'A title needs at least two characters.'
      : description.trim().length < 4
        ? 'A description needs at least four characters.'
        : !Number.isInteger(target) || target < 1
          ? 'The goal is a whole number of at least 1.'
          : mission.goalType === 'ACCURACY_PERCENT' && target > 100
            ? 'An accuracy goal is a percentage, so it cannot be more than 100.'
            : null;

  const mutation = useMutation({
    mutationFn: () =>
      updateMission(mission.id, {
        title: missionTitle.trim(),
        description: description.trim(),
        goalTarget: target,
        pointsReward: Number(pointsReward),
        isActive,
      }),
    onSuccess: onDone,
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit “${mission.title}”`}
      footer={
        <Footer
          onClose={onClose}
          isPending={mutation.isPending}
          disabled={blockedReason !== null}
          label="Save"
          onConfirm={() => mutation.mutate()}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Title" isRequired>
          <Input value={missionTitle} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Description" isRequired>
          <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`Goal (${mission.goalLabel || title(mission.goalType)})`} isRequired>
            <Input type="number" min={1} value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} />
          </Field>
          <Field label="Points reward">
            <Input type="number" min={0} value={pointsReward} onChange={(event) => setPointsReward(event.target.value)} />
          </Field>
        </div>
        <Checkbox
          label="Active"
          hint="An inactive mission stops enrolling new learners."
          checked={isActive}
          onChange={(event) => setActive(event.target.checked)}
        />
        {blockedReason ? <p className="text-sm text-ink-muted">{blockedReason}</p> : null}
      </div>
    </Modal>
  );
}

const PROGRESS_TONE: Record<MissionStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  NOT_STARTED: 'neutral',
  ACTIVE: 'info',
  COMPLETED: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'neutral',
};

/**
 * Who is on a mission, and the two changes a teacher makes to that: give it to
 * more learners, or withdraw it from some. Withdrawing needs a reason because
 * the learner saw the mission and will see it go.
 */
export function MissionLearnersModal({
  mission,
  source,
  onClose,
}: {
  mission: MissionDefinition;
  source: 'mine' | 'all';
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'list' | 'enrol'>('list');
  const [withdrawIds, setWithdrawIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [enrolIds, setEnrolIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const progress = useQuery({
    queryKey: qk.missions.progress({ missionId: mission.id }),
    queryFn: () => fetchMissionProgress({ missionId: mission.id }),
  });

  const withdraw = useMutation({
    mutationFn: () => cancelMissionForStudents(mission.id, withdrawIds, reason.trim()),
    onSuccess: (result) => {
      setMessage(`Withdrawn from ${result.cancelled} learner${result.cancelled === 1 ? '' : 's'}.`);
      setWithdrawIds([]);
      setReason('');
      void progress.refetch();
    },
  });
  const enrol = useMutation({
    mutationFn: () => enrolInMission(mission.id, enrolIds),
    onSuccess: (result) => {
      setMessage(`Enrolled ${result.enrolled} of ${result.requested}; the rest were already on it.`);
      setEnrolIds([]);
      setMode('list');
      void progress.refetch();
    },
  });

  const rows = progress.data?.items ?? [];
  const withdrawable = (status: MissionStatus) => status === 'NOT_STARTED' || status === 'ACTIVE';

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Learners on “${mission.title}”`}
      footer={
        mode === 'enrol' ? (
          <Footer
            onClose={() => setMode('list')}
            isPending={enrol.isPending}
            disabled={enrolIds.length === 0}
            label="Enrol"
            onConfirm={() => enrol.mutate()}
          />
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {message ? <p className="rounded-lg bg-success-soft p-3 text-sm text-ink">{message}</p> : null}
        {withdraw.error ? <ErrorState error={withdraw.error} /> : null}
        {enrol.error ? <ErrorState error={enrol.error} /> : null}

        {mode === 'enrol' ? (
          <LearnerPicker source={source} selected={enrolIds} onChange={setEnrolIds} />
        ) : (
          <>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setMode('enrol')}>
                Enrol more learners
              </Button>
            </div>
            <QueryBoundary
              isLoading={progress.isPending}
              error={progress.error}
              onRetry={() => void progress.refetch()}
              isEmpty={rows.length === 0}
              emptyState={<p className="text-sm text-ink-muted">Nobody is on this mission yet.</p>}
            >
              <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    {withdrawable(row.status) ? (
                      <Checkbox
                        label={row.student.displayName}
                        checked={withdrawIds.includes(row.studentId)}
                        onChange={() =>
                          setWithdrawIds((current) =>
                            current.includes(row.studentId)
                              ? current.filter((id) => id !== row.studentId)
                              : [...current, row.studentId],
                          )
                        }
                      />
                    ) : (
                      <span className="text-sm text-ink">{row.student.displayName}</span>
                    )}
                    <span className="flex items-center gap-2 text-sm text-ink-muted">
                      {row.progressValue}/{row.goalTarget}
                      <Badge tone={PROGRESS_TONE[row.status]}>{title(row.status)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </QueryBoundary>

            {withdrawIds.length > 0 ? (
              <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-3">
                <Field label={`Withdraw from ${withdrawIds.length}`} isRequired hint="At least four characters. Kept on the record.">
                  <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why" />
                </Field>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="danger"
                    isLoading={withdraw.isPending}
                    disabled={reason.trim().length < 4}
                    onClick={() => withdraw.mutate()}
                  >
                    Withdraw mission
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
