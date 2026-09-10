import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  IconChevronDown,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import {
  createObjective,
  deleteObjective,
  fetchObjectives,
  fetchTopic,
  reorderCurriculum,
  setTopicPrerequisites,
  updateObjective,
  updateProgram,
  updateTopic,
  updateUnit,
} from '@/curriculum/curriculum.api';
import type { CurriculumTopic, LearningObjective } from '@/curriculum/curriculum.types';
import type { DifficultyBand } from '@/content/content.types';

/**
 * Editing the curriculum tree after creation: rename and describe a node,
 * put siblings in order, set what a topic requires first, and write the
 * learning objectives a topic is measured against.
 *
 * Reordering uses up/down buttons rather than drag — the UX brief is
 * touch-first, and a drag handle is the hardest control to use on a tablet.
 */

const BANDS: DifficultyBand[] = ['FOUNDATION', 'DEVELOPING', 'SECURE', 'CHALLENGE', 'EXTENSION'];
const bandLabel = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

type NodeKind = 'programs' | 'units' | 'topics';

// ── Reorder ─────────────────────────────────────────────────────────────────

/**
 * Up/down for one row. Rewrites the whole sibling list with dense sort orders,
 * so rows that were all created at sortOrder 0 end up in a real order too.
 */
export function MoveButtons({
  kind,
  ids,
  index,
}: {
  kind: NodeKind | 'objectives';
  ids: string[];
  index: number;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (direction: -1 | 1) => {
      const next = [...ids];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return reorderCurriculum(kind, next.map((id, position) => ({ id, sortOrder: position })));
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all }),
  });

  return (
    <span className="inline-flex">
      <IconButton
        size="sm"
        variant="ghost"
        label="Move up"
        disabled={index === 0 || mutation.isPending}
        onClick={() => mutation.mutate(-1)}
      >
        <IconChevronDown aria-hidden className="h-4 w-4 rotate-180" />
      </IconButton>
      <IconButton
        size="sm"
        variant="ghost"
        label="Move down"
        disabled={index === ids.length - 1 || mutation.isPending}
        onClick={() => mutation.mutate(1)}
      >
        <IconChevronDown aria-hidden className="h-4 w-4" />
      </IconButton>
    </span>
  );
}

// ── Edit a node ─────────────────────────────────────────────────────────────

export function EditNodeModal({
  kind,
  node,
  onClose,
}: {
  kind: NodeKind;
  node: {
    id: string;
    name: string;
    description: string | null;
    difficultyBand?: DifficultyBand;
    estimatedMinutes?: number | null;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? '');
  const [band, setBand] = useState<DifficultyBand>(node.difficultyBand ?? 'DEVELOPING');
  const [minutes, setMinutes] = useState(String(node.estimatedMinutes ?? 20));

  const mutation = useMutation({
    mutationFn: (): Promise<unknown> => {
      const base = { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) };
      if (kind === 'programs') return updateProgram(node.id, base);
      if (kind === 'units') return updateUnit(node.id, base);
      return updateTopic(node.id, { ...base, difficultyBand: band, estimatedMinutes: Number(minutes) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
      onClose();
    },
  });

  const minutesValue = Number(minutes);
  const invalid =
    name.trim().length < 2 ||
    (kind === 'topics' && (!Number.isInteger(minutesValue) || minutesValue < 1 || minutesValue > 600));
  const noun = kind === 'programs' ? 'program' : kind === 'units' ? 'unit' : 'topic';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Edit ${noun}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button isLoading={mutation.isPending} disabled={invalid} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <Field label="Name" isRequired hint="At least two characters.">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {kind === 'topics' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Difficulty band">
              <Select
                value={band}
                onChange={(event) => setBand(event.target.value as DifficultyBand)}
                options={BANDS.map((value) => ({ value, label: bandLabel(value) }))}
              />
            </Field>
            <Field label="Estimated minutes" hint="1 to 600.">
              <Input type="number" min={1} max={600} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Prerequisites ───────────────────────────────────────────────────────────

/**
 * What a topic requires first. A hard prerequisite locks the topic on a
 * learner's path until it is met; a soft one is advice the path shows but does
 * not enforce. Offered from the same subject only.
 */
export function PrerequisitesModal({
  topic,
  allTopics,
  onClose,
}: {
  topic: CurriculumTopic;
  allTopics: CurriculumTopic[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: qk.curriculum.detail(topic.id), queryFn: () => fetchTopic(topic.id) });
  const [draft, setDraft] = useState<Map<string, boolean> | null>(null);

  const current: Map<string, boolean> =
    draft ?? new Map((detail.data?.prerequisites ?? []).map((entry) => [entry.requiredTopic.id, entry.isHard]));

  const candidates = allTopics.filter((entry) => entry.id !== topic.id && entry.subjectId === topic.subjectId);

  const setEntry = (id: string, value: 'none' | 'hard' | 'soft') => {
    const next = new Map(current);
    if (value === 'none') next.delete(id);
    else next.set(id, value === 'hard');
    setDraft(next);
  };

  const mutation = useMutation({
    mutationFn: () =>
      setTopicPrerequisites(
        topic.id,
        [...current.entries()].map(([requiredTopicId, isHard]) => ({ requiredTopicId, isHard })),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
      onClose();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Before “${topic.name}”`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={mutation.isPending}
            disabled={draft === null || current.size > 20}
            onClick={() => mutation.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.error ? <ErrorState error={mutation.error} /> : null}
        <p className="text-sm text-ink-muted">
          <strong className="text-ink">Required</strong> locks this topic on a learner&rsquo;s path until the
          earlier one is done. <strong className="text-ink">Suggested</strong> is shown as advice only. Up to 20.
        </p>
        <QueryBoundary isLoading={detail.isPending} error={detail.error} onRetry={() => void detail.refetch()}>
          {candidates.length === 0 ? (
            <EmptyState title="No other topics in this subject" />
          ) : (
            <ul className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {candidates.map((entry) => {
                const state = current.has(entry.id) ? (current.get(entry.id) ? 'hard' : 'soft') : 'none';
                return (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm text-ink">{entry.name}</span>
                    <div className="w-40">
                      <Select
                        aria-label={`${entry.name} as a prerequisite`}
                        value={state}
                        onChange={(event) => setEntry(entry.id, event.target.value as 'none' | 'hard' | 'soft')}
                        options={[
                          { value: 'none', label: 'Not needed' },
                          { value: 'hard', label: 'Required' },
                          { value: 'soft', label: 'Suggested' },
                        ]}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {detail.data && detail.data.requiredFor.length > 0 ? (
            <p className="text-xs text-ink-muted">
              Needed before: {detail.data.requiredFor.map((entry) => entry.topic.name).join(', ')}. Choosing any of
              these would make a loop, which the server refuses.
            </p>
          ) : null}
        </QueryBoundary>
      </div>
    </Modal>
  );
}

// ── Objectives ──────────────────────────────────────────────────────────────

/**
 * The learning objectives a topic is measured against — the "can do"
 * statements mastery is recorded per. Until this screen they could only be
 * created by the seed.
 */
export function ObjectivesModal({
  topic,
  canWrite,
  onClose,
}: {
  topic: CurriculumTopic;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const params = { topicId: topic.id, pageSize: 100 };
  const query = useQuery({ queryKey: qk.curriculum.list({ scope: 'objectives', ...params }), queryFn: () => fetchObjectives(params) });
  const [editing, setEditing] = useState<LearningObjective | 'new' | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.curriculum.all });
  const remove = useMutation({ mutationFn: (id: string) => deleteObjective(id), onSuccess: refresh });

  const rows = [...(query.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = rows.map((row) => row.id);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={`Objectives for “${topic.name}”`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {remove.error ? <ErrorState error={remove.error} /> : null}
        {canWrite && editing === null ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEditing('new')}>
              Add an objective
            </Button>
          </div>
        ) : null}
        {editing !== null ? (
          <ObjectiveForm
            topicId={topic.id}
            existing={editing === 'new' ? null : editing}
            nextSortOrder={rows.length}
            onCancel={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        ) : null}
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={rows.length === 0}
          emptyState={
            <EmptyState
              title="No objectives yet"
              description="Objectives are the “I can…” statements this topic is assessed against."
            />
          }
        >
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {rows.map((row, index) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-ink">
                    <span className="font-semibold">{row.code}</span> {row.statement}
                  </span>
                  <span className="text-xs text-ink-muted">{bandLabel(row.difficultyBand)}</span>
                </div>
                {canWrite ? (
                  <div className="flex items-center gap-1">
                    <MoveButtons kind="objectives" ids={ids} index={index} />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={remove.isPending && remove.variables === row.id}
                      onClick={() => remove.mutate(row.id)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </QueryBoundary>
        <p className="text-xs text-ink-muted">
          An objective that evidence or content already refers to cannot be deleted — the server will say so.
        </p>
      </div>
    </Modal>
  );
}

function ObjectiveForm({
  topicId,
  existing,
  nextSortOrder,
  onCancel,
  onDone,
}: {
  topicId: string;
  existing: LearningObjective | null;
  nextSortOrder: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState(existing?.code ?? '');
  const [statement, setStatement] = useState(existing?.statement ?? '');
  const [band, setBand] = useState<DifficultyBand>(existing?.difficultyBand ?? 'DEVELOPING');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        code: code.trim(),
        statement: statement.trim(),
        difficultyBand: band,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      return existing
        ? updateObjective(existing.id, body)
        : createObjective({ ...body, topicId, sortOrder: nextSortOrder });
    },
    onSuccess: onDone,
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-3">
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="Code" isRequired>
          <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="M4.2" />
        </Field>
        <Field label="Statement" isRequired hint="At least three characters.">
          <Input value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="I can…" />
        </Field>
      </div>
      <Field label="Difficulty band">
        <Select
          value={band}
          onChange={(event) => setBand(event.target.value as DifficultyBand)}
          options={BANDS.map((value) => ({ value, label: bandLabel(value) }))}
        />
      </Field>
      <Field label="Notes for teachers">
        <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          size="sm"
          isLoading={mutation.isPending}
          disabled={!code.trim() || statement.trim().length < 3}
          onClick={() => mutation.mutate()}
        >
          {existing ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

