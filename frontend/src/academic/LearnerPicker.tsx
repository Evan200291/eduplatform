import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Field, Select } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { qk } from '@/query/keys';
import { fetchClassRoster, fetchClasses, fetchMyClasses } from './academic.api';

/**
 * Choosing learners for a bulk action — awarding a badge, granting a reward,
 * enrolling in a mission.
 *
 * Always goes through a class. A teacher's scope is their own classes, and even
 * an administrator thinks "Year 4 Kestrels", not "search 400 learners". Picking
 * a different class keeps earlier ticks, so a selection can span classes.
 */
export function LearnerPicker({
  source,
  selected,
  onChange,
}: {
  /** `mine` for a teacher (their classes), `all` for a school administrator. */
  source: 'mine' | 'all';
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [classId, setClassId] = useState('');

  const classes = useQuery({
    queryKey: source === 'mine' ? qk.classes.mine : qk.classes.list({ pageSize: 100 }),
    queryFn: () => (source === 'mine' ? fetchMyClasses() : fetchClasses({ pageSize: 100 })),
  });
  const roster = useQuery({
    queryKey: qk.classes.roster(classId),
    queryFn: () => fetchClassRoster(classId),
    enabled: classId.length > 0,
  });

  const learners = (roster.data ?? []).filter((entry) => entry.isActive);
  const chosen = new Set(selected);
  const allTicked = learners.length > 0 && learners.every((entry) => chosen.has(entry.user.id));

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const toggleAll = () => {
    const next = new Set(chosen);
    for (const entry of learners) {
      if (allTicked) next.delete(entry.user.id);
      else next.add(entry.user.id);
    }
    onChange([...next]);
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label="Class">
        <Select
          value={classId}
          placeholder={classes.isPending ? 'Loading…' : 'Choose a class'}
          onChange={(event) => setClassId(event.target.value)}
          options={(classes.data?.items ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
        />
      </Field>
      {classes.error ? <ErrorState error={classes.error} /> : null}
      {roster.error ? <ErrorState error={roster.error} /> : null}

      {classId && roster.isPending ? <p className="text-sm text-ink-muted">Loading the class…</p> : null}
      {classId && !roster.isPending && learners.length === 0 ? (
        <p className="text-sm text-ink-muted">No learners in this class.</p>
      ) : null}

      {learners.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">{selected.length} chosen</p>
            <Button size="sm" variant="ghost" onClick={toggleAll}>
              {allTicked ? 'Clear this class' : 'Choose whole class'}
            </Button>
          </div>
          <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {learners.map((entry) => (
              <li key={entry.user.id}>
                <Checkbox
                  label={entry.user.displayName}
                  checked={chosen.has(entry.user.id)}
                  onChange={() => toggle(entry.user.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
