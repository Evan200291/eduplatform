/**
 * Sign-out after inactivity (PRD v2.5: sessions expire after inactivity; the
 * exact time is the technical owner's call and each school can set its own).
 *
 * The school's limit lives in `SchoolSettings.sessionIdleMinutes`. The server
 * does not enforce it yet, so the app does: it watches for input, warns a minute
 * before the limit, then signs out. This is a courtesy on a shared classroom
 * device, not a security boundary — the refresh token's own lifetime still is.
 *
 * Activity is shared between tabs through `localStorage`, so someone working in
 * one tab is not signed out by another tab they left open.
 */

/** The schema default, used when the school's own value cannot be read. */
export const DEFAULT_IDLE_MINUTES = 120;
export const IDLE_WARNING_MS = 60_000;
export const LAST_ACTIVITY_KEY = 'midas.lastActivityAt';

export type IdlePhase = 'active' | 'warning' | 'expired';

export function idlePhase(lastActivityAt: number, now: number, idleMs: number, warningMs = IDLE_WARNING_MS): IdlePhase {
  const quiet = now - lastActivityAt;
  if (quiet >= idleMs) return 'expired';
  if (quiet >= idleMs - Math.min(warningMs, idleMs / 2)) return 'warning';
  return 'active';
}

export function readLastActivity(fallback: number): number {
  try {
    const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.max(stored, fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLastActivity(at: number): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Storage blocked: this tab still tracks its own activity in memory.
  }
}
