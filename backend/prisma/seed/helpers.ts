// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// Small utilities shared by every seed module. Three rules the whole seed obeys
// and that this file exists to make easy:
//
//   1. Idempotent. `npm run db:seed` twice must leave the same database, so every
//      row is written with `upsert` on a real unique key, or located first and
//      then created. Nothing is deleted.
//   2. Deterministic. Demo numbers come from `hashUnit(key)`, not `Math.random()`,
//      so two people seeding the same build see the same dashboards and a bug
//      report is reproducible.
//   3. Quiet but legible. One line per group of rows, so a VPS deploy log shows
//      what happened without scrolling.
//
// `ensure*` naming means "make sure this exists, return its id".
// ─────────────────────────────────────────────────────────────────────────────

/** Section heading in the seed log. */
export function step(title: string): void {
  console.log(`\n▸ ${title}`);
}

/** One detail line under the current heading. */
export function log(message: string): void {
  console.log(`  ${message}`);
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}

export function daysAhead(days: number, from: Date = new Date()): Date {
  return daysAgo(-days, from);
}

export function hoursAgo(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - hours * 3_600_000);
}

/** Same calendar day, clock set to `hour`:00 local. Keeps demo timestamps tidy. */
export function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

/**
 * Stable number in [0, 1) derived from a string. FNV-1a, then a mixing round.
 * Short, dependency-free, and identical between runs.
 *
 * The mixing round is not decoration. Plain FNV-1a only multiplies the *last*
 * character of the key once, so keys that differ only in their tail — which is
 * every key this seed builds, e.g. `mark:<student>:<attempt>:<questionId>` —
 * land within about 0.4% of each other. Neighbouring keys then fall on the same
 * side of every `chance()` threshold, and a learner's twelve answers come out
 * either all right or all wrong: correct on average, useless per topic. The
 * murmur3 `fmix32` finalizer below spreads a one-character change across the
 * whole word, so grouped values look like real data instead of a coin flip.
 */
export function hashUnit(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

/** Deterministic integer in [min, max] for a given key. */
export function hashInt(key: string, min: number, max: number): number {
  return min + Math.floor(hashUnit(key) * (max - min + 1));
}

/** Deterministic choice from a non-empty list. */
export function pick<T>(items: readonly T[], key: string): T {
  if (items.length === 0) throw new Error('pick() needs a non-empty list');
  return items[hashInt(key, 0, items.length - 1)];
}

/** True for roughly `percent` of the keys passed in, deterministically. */
export function chance(key: string, percent: number): boolean {
  return hashUnit(key) * 100 < percent;
}

/**
 * Turns `12` into `MID-0012` style padding for student codes and class codes.
 */
export function pad(value: number, width = 4): string {
  return String(value).padStart(width, '0');
}
