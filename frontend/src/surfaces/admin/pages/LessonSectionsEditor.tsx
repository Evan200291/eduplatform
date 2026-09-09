import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconAdd,
  IconDelete,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ErrorState, QueryBoundary } from '@/components/feedback';
import { qk } from '@/query/keys';
import {
  createLessonSection,
  deleteLessonSection,
  fetchLesson,
  reorderLessonSections,
  updateLessonSection,
} from '@/content/content.api';
import type { ActivityType, LessonSection } from '@/content/content.types';

/**
 * Lesson body authoring (blueprint §05).
 *
 * A lesson is a sequence of sections rather than one block of text, so a worked
 * example can sit between two explanations and either can be moved without
 * retyping the other. The routes have existed since launch with nothing calling
 * them — lesson bodies were fixed at seed time.
 *
 * Sections are edited in place rather than in a second dialog: there are only
 * three fields, and an author writing a lesson is doing one continuous piece of
 * work, not dipping in and out of a record.
 */

/** The two kinds that make sense for prose. The server accepts any activity type. */
const SECTION_KINDS: { value: ActivityType; label: string }[] = [
  { value: 'EXPLANATION', label: 'Explanation' },
  { value: 'WORKED_EXAMPLE', label: 'Worked example' },
];

export function LessonSectionsEditor({
  lessonId,
  lessonTitle,
  canWrite,
  onClose,
}: {
  lessonId: string;
  lessonTitle: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ heading: string; body: string; kind: ActivityType } | null>(
    null,
  );

  const query = useQuery({ queryKey: qk.lessons.detail(lessonId), queryFn: () => fetchLesson(lessonId) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: qk.lessons.all });

  const sections = [...(query.data?.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const create = useMutation({
    mutationFn: (input: { heading: string; body: string; kind: ActivityType }) =>
      createLessonSection(lessonId, { ...input, sortOrder: sections.length }),
    onSuccess: () => {
      setDraft(null);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (sectionId: string) => deleteLessonSection(lessonId, sectionId),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) => reorderLessonSections(lessonId, items),
    onSuccess: invalidate,
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((section, position) => ({ id: section.id, sortOrder: position })));
  };

  return (
    <Modal isOpen onClose={onClose} title={`Sections — ${lessonTitle}`} size="lg">
      <div className="flex flex-col gap-4">
        <QueryBoundary
          isLoading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        >
          {sections.length === 0 ? (
            <EmptyState
              title="This lesson has no sections"
              description={
                canWrite
                  ? 'Add a section to start writing the lesson body.'
                  : 'Nobody has written the lesson body yet.'
              }
            />
          ) : (
            <ol className="flex flex-col gap-3">
              {sections.map((section, index) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  index={index}
                  total={sections.length}
                  canWrite={canWrite}
                  isBusy={reorder.isPending || remove.isPending}
                  onMove={(direction) => move(index, direction)}
                  onSave={(patch) => updateLessonSection(lessonId, section.id, patch).then(invalidate)}
                  onDelete={() => {
                    if (window.confirm(`Delete "${section.heading}"? This cannot be undone.`)) {
                      remove.mutate(section.id);
                    }
                  }}
                />
              ))}
            </ol>
          )}
        </QueryBoundary>

        {remove.error ? <ErrorState error={remove.error} /> : null}
        {reorder.error ? <ErrorState error={reorder.error} /> : null}

        {canWrite && draft ? (
          <div className="rounded-md border border-border p-3">
            {create.error ? <ErrorState error={create.error} /> : null}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Field label="Heading">
                    <Input
                      value={draft.heading}
                      onChange={(event) => setDraft({ ...draft, heading: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Kind">
                  <Select
                    value={draft.kind}
                    onChange={(event) => setDraft({ ...draft, kind: event.target.value as ActivityType })}
                    options={SECTION_KINDS}
                  />
                </Field>
              </div>
              <Field label="Body">
                <Textarea
                  rows={4}
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  isLoading={create.isPending}
                  disabled={draft.heading.trim().length < 2 || draft.body.trim().length === 0}
                  onClick={() => create.mutate(draft)}
                >
                  Add section
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)} disabled={create.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {canWrite && !draft ? (
          <div>
            <Button
              leadingIcon={<IconAdd aria-hidden className="h-4 w-4" />}
              onClick={() => setDraft({ heading: '', body: '', kind: 'EXPLANATION' })}
            >
              Add a section
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** One section, read-only until the author chooses to edit it. */
function SectionRow({
  section,
  index,
  total,
  canWrite,
  isBusy,
  onMove,
  onSave,
  onDelete,
}: {
  section: LessonSection;
  index: number;
  total: number;
  canWrite: boolean;
  isBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onSave: (patch: { heading: string; body: string; kind: ActivityType }) => Promise<unknown>;
  onDelete: () => void;
}) {
  const [isEditing, setEditing] = useState(false);
  const [heading, setHeading] = useState(section.heading);
  const [body, setBody] = useState(section.body);
  const [kind, setKind] = useState(section.kind as ActivityType);

  const save = useMutation({
    mutationFn: () => onSave({ heading: heading.trim(), body: body.trim(), kind }),
    onSuccess: () => setEditing(false),
  });

  if (isEditing) {
    return (
      <li className="rounded-md border border-border p-3">
        {save.error ? <ErrorState error={save.error} /> : null}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Heading">
                <Input value={heading} onChange={(event) => setHeading(event.target.value)} />
              </Field>
            </div>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as ActivityType)}
                options={SECTION_KINDS}
              />
            </Field>
          </div>
          <Field label="Body">
            <Textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              isLoading={save.isPending}
              disabled={heading.trim().length < 2 || body.trim().length === 0}
              onClick={() => save.mutate()}
            >
              Save
            </Button>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setHeading(section.heading);
                setBody(section.body);
                setKind(section.kind as ActivityType);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            {SECTION_KINDS.find((option) => option.value === section.kind)?.label ?? section.kind}
          </Badge>
          <span className="text-sm font-medium text-ink">{section.heading}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink-muted">{section.body}</p>
      </div>

      {canWrite ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Move "${section.heading}" up`}
            disabled={index === 0 || isBusy}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Move "${section.heading}" down`}
            disabled={index === total - 1 || isBusy}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Delete "${section.heading}"`}
            disabled={isBusy}
            onClick={onDelete}
          >
            <IconDelete aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
