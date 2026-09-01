// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// Streaks, missions, digests and leaderboard periods all need "which day is
// this?" answered consistently. Getting that wrong shows up as a learner losing
// a streak they earned, so the rules are centralised here rather than repeated.
//
// All persisted timestamps are UTC. A *calendar day* is evaluated in the
// school's timezone, because a learner who practises at 9pm expects that to
// count for their local day.
// ─────────────────────────────────────────────────────────────────────────────

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

/**
 * The calendar date in a given IANA timezone, as `YYYY-MM-DD`.
 * Uses `Intl` rather than manual offset arithmetic so daylight saving is handled.
 */
export function localDateKey(instant: Date, timeZone = 'UTC'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(instant);
}

/** The local hour (0–23) in a given timezone, used for quiet-hours checks. */
export function localHour(instant: Date, timeZone = 'UTC'): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  });
  return Number(formatter.format(instant));
}

/** Whole calendar days between two dates in a timezone. Negative if `b` is earlier. */
export function calendarDaysBetween(a: Date, b: Date, timeZone = 'UTC'): number {
  const first = Date.parse(`${localDateKey(a, timeZone)}T00:00:00Z`);
  const second = Date.parse(`${localDateKey(b, timeZone)}T00:00:00Z`);
  return Math.round((second - first) / MS_PER_DAY);
}

export function isSameLocalDay(a: Date, b: Date, timeZone = 'UTC'): boolean {
  return localDateKey(a, timeZone) === localDateKey(b, timeZone);
}

/**
 * Whether a streak continues. Today keeps it, yesterday extends it, anything
 * older breaks it — which is where a streak freeze is spent.
 */
export type StreakContinuity = 'same-day' | 'continues' | 'broken';

export function streakContinuity(
  lastQualifiedOn: Date | null,
  now: Date,
  timeZone = 'UTC',
): StreakContinuity {
  if (!lastQualifiedOn) return 'continues';
  const gap = calendarDaysBetween(lastQualifiedOn, now, timeZone);
  if (gap <= 0) return 'same-day';
  if (gap === 1) return 'continues';
  return 'broken';
}

export function startOfUtcDay(instant: Date): Date {
  const copy = new Date(instant);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function endOfUtcDay(instant: Date): Date {
  const copy = new Date(instant);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

/** Monday-based week start, matching the school week used in reporting. */
export function startOfUtcWeek(instant: Date): Date {
  const start = startOfUtcDay(instant);
  const dayOfWeek = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  return start;
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * MS_PER_DAY);
}

export function addHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * MS_PER_HOUR);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

/** A rolling window ending now, used by leaderboards and activity reports. */
export function rollingWindow(days: number, now = new Date()): { start: Date; end: Date } {
  return { start: addDays(now, -Math.abs(days)), end: now };
}

/**
 * The current period for a recurring mission. Periods are anchored to the
 * mission's start so they do not drift, and a learner joining mid-period gets
 * the same window as everyone else.
 */
export function currentPeriod(
  anchor: Date,
  recurrenceDays: number,
  now = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const length = Math.max(1, recurrenceDays) * MS_PER_DAY;
  const elapsed = Math.max(0, now.getTime() - anchor.getTime());
  const periodIndex = Math.floor(elapsed / length);
  const periodStart = new Date(anchor.getTime() + periodIndex * length);
  return { periodStart, periodEnd: new Date(periodStart.getTime() + length) };
}

/** Whether `dueAt` has passed, allowing for a grace period. */
export function isOverdue(dueAt: Date | null, graceHours = 0, now = new Date()): boolean {
  if (!dueAt) return false;
  return now.getTime() > dueAt.getTime() + graceHours * MS_PER_HOUR;
}

/** Whether now falls inside a quiet-hours window that may wrap past midnight. */
export function isWithinQuietHours(
  startHour: number | null,
  endHour: number | null,
  now: Date,
  timeZone = 'UTC',
): boolean {
  if (startHour === null || endHour === null) return false;
  const hour = localHour(now, timeZone);
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}
