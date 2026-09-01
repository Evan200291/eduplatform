import type { BadgeTone } from '@/components/ui';

/**
 * Several backend enums (mastery level, difficulty band, assignment kind,
 * recommendation status...) carry more values in Prisma than the frontend's own
 * `*.types.ts` unions currently declare — this surface renders many of them, so
 * every lookup here is a map with a safe fallback rather than an exhaustive
 * switch that would throw on the values the type files have not caught up with.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function toneFor<K extends string>(
  map: Partial<Record<K, BadgeTone>>,
  value: K | (string & {}) | null | undefined,
  fallback: BadgeTone = 'neutral',
): BadgeTone {
  if (!value) return fallback;
  return (map as Record<string, BadgeTone>)[value] ?? fallback;
}
