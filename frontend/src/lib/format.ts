import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/**
 * Display formatting.
 *
 * The API sends ISO 8601 strings; every one of them is rendered through here so a
 * date looks the same on a report as it does in a table. Invalid or missing values
 * return an em dash rather than "Invalid Date" — a gap in the data is not an error
 * the user can fix.
 */
const EMPTY = '—';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** `4 Sep 2026` — for anything where the day is what matters. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : EMPTY;
}

/** `4 Sep 2026, 14:30` — for audit trails and session lists. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm') : EMPTY;
}

/** `3 days ago` — for recency, where the exact timestamp is noise. */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? formatDistanceToNowStrict(date, { addSuffix: true }) : EMPTY;
}

/** Thousands separators from the browser's own locale. */
export function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : EMPTY;
}

/** `72%` — rounded, because a decimal place implies precision progress data lacks. */
export function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : EMPTY;
}

/** `1h 20m` from a duration in seconds. */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return EMPTY;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
