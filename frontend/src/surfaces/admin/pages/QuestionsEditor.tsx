import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  IconAdd,
  IconDelete,
  IconEdit,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import {
  createQuestion,
  deleteQuestion,
  fetchActivityQuestions,
  reorderQuestions,
  updateQuestion,
} from '@/content/content.api';
import {
  QUESTION_TYPE_LABELS,
  forQuestionType,
  questionAnswerKeyIssues,
  questionTypeShape,
} from '@/content/content-authoring';
import type {
  AnswerOptionInput,
  DifficultyBand,
  HintInput,
  QuestionInput,
  QuestionRow,
  QuestionType,
} from '@/content/content.types';

/**
 * Question authoring for one activity (blueprint §05, PRD v2.5).
 *
 * This is the screen that decides whether a school can run the platform without
 * a developer. The server has always been able to create questions, options and
 * hints; until now nothing called those routes, so changing a single answer
 * meant an engineer and a deployment.
 *
 * Two decisions shape the design:
 *
 * The form follows the question type. Each type has a different answer key — a
 * numeric question needs a number, a matching question needs a key on every
 * pair — and the server rejects a mismatch. Rather than show every field and let
 * the author discover the rule from a rejection, the form shows only what the
 * chosen type uses and states what is missing before the save.
 *
 * Order is changed with buttons, not dragging. Reordering has to work on a
 * touch screen and for someone using a keyboard, and a drag handle is the one
 * interaction that reliably fails both.
 */

const QUESTION_TYPES: QuestionType[] = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'NUMERIC',
  'SHORT_TEXT',
  'MATCHING',
  'SORTING',
];

const DIFFICULTY_BANDS: DifficultyBand[] = [
  'FOUNDATION',
  'DEVELOPING',
  'SECURE',
  'CHALLENGE',
  'EXTENSION',
];

function emptyDraft(): QuestionInput {
  return {
    type: 'MULTIPLE_CHOICE',
    prompt: '',
    explanation: '',
    difficultyBand: 'DEVELOPING',
    pointsValue: 1,
    options: [
      { label: '', isCorrect: false },
      { label: '', isCorrect: false },
    ],
    hints: [],
    correctText: [],
  };
}

function draftFromRow(row: QuestionRow): QuestionInput {
  return {
    type: row.type,
    prompt: row.prompt,
    explanation: row.explanation ?? '',
    difficultyBand: row.difficultyBand,
    pointsValue: row.pointsValue,
    correctNumeric: row.correctNumeric,
    numericTolerance: row.numericTolerance,
    correctBoolean: row.correctBoolean,
    correctText: row.correctText ?? [],
    options: row.options.map((option) => ({
      label: option.label,
      isCorrect: option.isCorrect,
      feedback: option.feedback ?? '',
      matchKey: option.matchKey ?? '',
    })),
    hints: row.hints.map((hint) => ({ body: hint.body, pointsCost: hint.pointsCost })),
  };
}

export function QuestionsEditor({
  activityId,
  activityTitle,
  canWrite,
  onClose,
}: {
  activityId: string;
  activityTitle: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<QuestionRow | 'new' | null>(null);

  const query = useQuery({
    queryKey: qk.activities.questions(activityId),
    queryFn: () => fetchActivityQuestions(activityId),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: qk.activities.questions(activityId) });

  const remove = useMutation({
    mutationFn: (questionId: string) => deleteQuestion(activityId, questionId),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => reorderQuestions(activityId, items),
    onSuccess: invalidate,
  });

  const questions = query.data ?? [];

  /** Swap with the neighbour and renumber the whole list — the server takes positions, not deltas. */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((question, position) => ({ id: question.id, sortOrder: position })));
  };

  if (editing) {
    return (
      <QuestionForm
        activityId={activityId}
        existing={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={`Questions — ${activityTitle}`} size="lg">
      <div className="flex flex-col gap-4">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          {questions.length === 0 ? (
            <EmptyState
              title="No questions yet"
              description={
                canWrite
                  ? 'Add the first question. An activity cannot be published until it has one.'
                  : 'Nobody has added a question to this activity.'
              }
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {questions.map((question, index) => (
                <li
                  key={question.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                      <span className="text-xs text-ink-muted">
                        {question.pointsValue} {question.pointsValue === 1 ? 'point' : 'points'}
                        {question.options.length > 0
                          ? ` · ${question.options.length} answers`
                          : ''}
                        {question.hints.length > 0 ? ` · ${question.hints.length} hints` : ''}
                      </span>
                    </div>
                    <p className="text-sm text-ink">{question.prompt}</p>
                  </div>

                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move question ${index + 1} up`}
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Move question ${index + 1} down`}
                        disabled={index === questions.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        leadingIcon={<IconEdit aria-hidden className="h-4 w-4" />}
                        onClick={() => setEditing(question)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete question ${index + 1}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm('Delete this question? This cannot be undone.')) {
                            remove.mutate(question.id);
                          }
                        }}
                      >
                        <IconDelete aria-hidden className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </QueryBoundary>

        {remove.error ? <ErrorState error={remove.error} /> : null}
        {reorder.error ? <ErrorState error={reorder.error} /> : null}

        {canWrite ? (
          <div>
            <Button
              leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
              onClick={() => setEditing('new')}
            >
              Add a question
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** Create or edit one question, with only the fields its type actually uses. */
function QuestionForm({
  activityId,
  existing,
  onCancel,
  onSaved,
}: {
  activityId: string;
  existing: QuestionRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<QuestionInput>(() =>
    existing ? draftFromRow(existing) : emptyDraft(),
  );
  const [showIssues, setShowIssues] = useState(false);

  const shape = questionTypeShape(draft.type);
  const issues = questionAnswerKeyIssues(draft);

  const save = useMutation({
    mutationFn: () => {
      const payload = forQuestionType(draft);
      return existing
        ? updateQuestion(activityId, existing.id, payload)
        : createQuestion(activityId, payload);
    },
    onSuccess: onSaved,
  });

  const set = <K extends keyof QuestionInput>(key: K, value: QuestionInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setOption = (index: number, patch: Partial<AnswerOptionInput>) =>
    setDraft((prev) => ({
      ...prev,
      options: (prev.options ?? []).map((option, i) => (i === index ? { ...option, ...patch } : option)),
    }));

  const options = draft.options ?? [];
  const hints = draft.hints ?? [];
  const acceptedAnswers = draft.correctText ?? [];

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={existing ? 'Edit question' : 'Add a question'}
      size="lg"
      closeOnBackdropClick={false}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            onClick={() => {
              if (issues.length > 0) {
                setShowIssues(true);
                return;
              }
              save.mutate();
            }}
          >
            {existing ? 'Save changes' : 'Add question'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {save.error ? <ErrorState error={save.error} /> : null}

        {showIssues && issues.length > 0 ? (
          <div className="rounded-md border border-danger bg-danger-soft p-3">
            <p className="mb-1 text-sm font-medium text-danger-strong">
              Not ready to save yet:
            </p>
            <ul className="list-inside list-disc text-sm text-danger-strong">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Type" hint={existing ? 'Changing this clears the answer key.' : undefined}>
            <Select
              value={draft.type}
              onChange={(event) => set('type', event.target.value as QuestionType)}
              options={QUESTION_TYPES.map((type) => ({
                value: type,
                label: QUESTION_TYPE_LABELS[type],
              }))}
            />
          </Field>
          <Field label="Difficulty">
            <Select
              value={draft.difficultyBand ?? 'DEVELOPING'}
              onChange={(event) => set('difficultyBand', event.target.value as DifficultyBand)}
              options={DIFFICULTY_BANDS.map((band) => ({
                value: band,
                label: band.charAt(0) + band.slice(1).toLowerCase(),
              }))}
            />
          </Field>
          <Field label="Points">
            <Input
              type="number"
              min={0}
              max={1000}
              value={draft.pointsValue ?? 1}
              onChange={(event) => set('pointsValue', Number(event.target.value))}
            />
          </Field>
        </div>

        <Field label="Question" hint="What the learner reads.">
          <Textarea
            rows={2}
            value={draft.prompt}
            onChange={(event) => set('prompt', event.target.value)}
          />
        </Field>

        {shape.usesCorrectBoolean ? (
          <Field label="Correct answer">
            <Select
              value={draft.correctBoolean === true ? 'true' : draft.correctBoolean === false ? 'false' : ''}
              placeholder="Choose true or false"
              onChange={(event) =>
                set('correctBoolean', event.target.value === '' ? null : event.target.value === 'true')
              }
              options={[
                { value: 'true', label: 'True' },
                { value: 'false', label: 'False' },
              ]}
            />
          </Field>
        ) : null}

        {shape.usesCorrectNumeric ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Correct number">
              <Input
                type="number"
                value={draft.correctNumeric ?? ''}
                onChange={(event) =>
                  set('correctNumeric', event.target.value === '' ? null : Number(event.target.value))
                }
              />
            </Field>
            <Field label="Tolerance" hint="How far off can still count as right. Leave blank for exact.">
              <Input
                type="number"
                min={0}
                value={draft.numericTolerance ?? ''}
                onChange={(event) =>
                  set('numericTolerance', event.target.value === '' ? null : Number(event.target.value))
                }
              />
            </Field>
          </div>
        ) : null}

        {shape.usesCorrectText ? (
          <Field label="Accepted answers" hint="Case is ignored. Add every spelling you would mark correct.">
            <div className="flex flex-col gap-2">
              {acceptedAnswers.map((answer, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={answer}
                    onChange={(event) =>
                      set(
                        'correctText',
                        acceptedAnswers.map((value, i) => (i === index ? event.target.value : value)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove accepted answer ${index + 1}`}
                    onClick={() =>
                      set('correctText', acceptedAnswers.filter((_, i) => i !== index))
                    }
                  >
                    <IconDelete aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set('correctText', [...acceptedAnswers, ''])}
                >
                  Add an accepted answer
                </Button>
              </div>
            </div>
          </Field>
        ) : null}

        {shape.usesOptions ? (
          <Field label={shape.optionsLabel} hint={shape.optionsHint}>
            <div className="flex flex-col gap-3">
              {options.map((option, index) => (
                <div key={index} className="rounded-md border border-border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      aria-label={`${shape.optionsLabel} ${index + 1}`}
                      value={option.label}
                      onChange={(event) => setOption(index, { label: event.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${shape.optionsLabel.toLowerCase()} ${index + 1}`}
                      onClick={() =>
                        set('options', options.filter((_, i) => i !== index))
                      }
                    >
                      <IconDelete aria-hidden className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {shape.usesCorrectFlag ? (
                      <Checkbox
                        label="This answer is correct"
                        checked={Boolean(option.isCorrect)}
                        onChange={(event) => setOption(index, { isCorrect: event.target.checked })}
                      />
                    ) : null}

                    {shape.usesMatchKey ? (
                      <Input
                        aria-label={`Pair key for item ${index + 1}`}
                        placeholder="Pair key, e.g. capital-france"
                        value={option.matchKey ?? ''}
                        onChange={(event) => setOption(index, { matchKey: event.target.value })}
                      />
                    ) : null}

                    {shape.usesCorrectFlag ? (
                      <Input
                        aria-label={`Feedback for answer ${index + 1}`}
                        placeholder="Feedback if chosen (optional)"
                        value={option.feedback ?? ''}
                        onChange={(event) => setOption(index, { feedback: event.target.value })}
                      />
                    ) : null}
                  </div>
                </div>
              ))}

              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set('options', [...options, { label: '', isCorrect: false }])}
                >
                  Add {shape.optionsLabel.toLowerCase().replace(/s$/, '')}
                </Button>
              </div>
            </div>
          </Field>
        ) : null}

        <Field
          label="Hints"
          hint="Offered when a learner is stuck. Hint use is recorded, never punished."
        >
          <div className="flex flex-col gap-2">
            {hints.map((hint, index) => (
              <div key={index} className="flex gap-2">
                <Textarea
                  rows={2}
                  aria-label={`Hint ${index + 1}`}
                  value={hint.body}
                  onChange={(event) =>
                    set(
                      'hints',
                      hints.map((value, i) =>
                        i === index ? { ...value, body: event.target.value } : value,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove hint ${index + 1}`}
                  onClick={() => set('hints', hints.filter((_, i) => i !== index))}
                >
                  <IconDelete aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => set('hints', [...hints, { body: '', pointsCost: 0 } as HintInput])}
              >
                Add a hint
              </Button>
            </div>
          </div>
        </Field>

        <Field label="Explanation" hint="Shown after answering, so a wrong answer still teaches.">
          <Textarea
            rows={2}
            value={draft.explanation ?? ''}
            onChange={(event) => set('explanation', event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
