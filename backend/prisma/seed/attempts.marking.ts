// ─────────────────────────────────────────────────────────────────────────────
// Seed response builder and marker
// The demo attempts must contain answers the *real* marker agrees with. If the
// seed wrote `isCorrect: true` next to a payload that
// src/modules/assessment/assessment.marking.ts would mark wrong, every demo
// dashboard would show figures the API cannot reproduce — and the first person to
// re-mark a response by hand would see the number change under them.
//
// So this file does two things and nothing else:
//   1. `buildResponse` produces a payload in the exact shape
//      `responsePayloadSchema` accepts (assessment.validation.ts), so a seeded
//      row is indistinguishable from one the API wrote.
//   2. `markSeedResponse` mirrors `markResponse` branch for branch, so the stored
//      `isCorrect` / `pointsAwarded` are derived, never asserted.
//
// It deliberately imports nothing. No `@prisma/client`, no `../core/prisma`, no
// `config/env` — which is what makes it the one piece of the seed that can be
// unit-tested without a database or a `.env` file. `MarkableType` is a string
// union rather than the `QuestionType` enum for that reason; the values are
// identical, and `attempts.seed.ts` passes the enum straight in.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `QuestionType`. Kept as a union so this file stays import-free. */
export type MarkableType =
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'NUMERIC'
  | 'SHORT_TEXT'
  | 'MATCHING'
  | 'SORTING';

export interface MarkableOption {
  id: string;
  isCorrect: boolean;
  matchKey: string | null;
}

/** The subset of a question the marker actually reads. */
export interface MarkableQuestion {
  id: string;
  type: MarkableType;
  pointsValue: number;
  /** In presentation order — `sortOrder` is the answer key for SORTING. */
  options: MarkableOption[];
  correctNumeric: number | null;
  numericTolerance?: number | null;
  correctBoolean: boolean | null;
  /** The accepted spelling. Compared case- and whitespace-insensitively. */
  correctText: string | null;
}

/**
 * One answer envelope, matching `responsePayloadSchema`. Exactly one of the value
 * fields is set for a given question type; the rest stay absent so the stored JSON
 * looks like what a client would have sent.
 */
export interface SeedResponsePayload {
  optionIds?: string[];
  booleanValue?: boolean;
  numericValue?: number;
  textValue?: string;
  pairs?: { optionId: string; matchKey: string }[];
  orderedOptionIds?: string[];
  skipped: boolean;
}

/** What the seed wants this answer to be, before the marker confirms it. */
export type ResponseIntent = 'correct' | 'wrong' | 'skipped';

export interface SeedMark {
  isCorrect: boolean;
  pointsAwarded: number;
  pointsPossible: number;
}

// ── Deterministic helpers ───────────────────────────────────────────────────
// Local copies rather than imports from ./helpers, because a test for this file
// should not have to reason about the rest of the seed.

function unit(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

function intBetween(key: string, min: number, max: number): number {
  return min + Math.floor(unit(key) * (max - min + 1));
}

/** Case- and whitespace-insensitive, identical to `normalise` in the real marker. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((entry) => seen.has(entry));
}

/** Moves `items[i]` to `items[i+1]`, wrapping. Used to spoil an ordering. */
function rotate<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  return [items[items.length - 1], ...items.slice(0, -1)];
}

function swapAt<T>(items: readonly T[], index: number): T[] {
  const copy = [...items];
  const next = (index + 1) % copy.length;
  const held = copy[index];
  copy[index] = copy[next];
  copy[next] = held;
  return copy;
}

/** A near-miss a real Year 3–5 learner might actually type. */
function textNearMiss(accepted: string, key: string): string {
  const trimmed = accepted.trim();
  if (trimmed.length <= 2) return `${trimmed}${trimmed}`;
  const variants = [
    trimmed.slice(0, -1),
    `${trimmed}s`,
    `${trimmed.slice(1)}${trimmed[0]}`,
    trimmed.split('').reverse().join(''),
  ];
  const chosen = variants[intBetween(`text:${key}`, 0, variants.length - 1)];
  // Guard against a palindrome or a pluralised word colliding with the key.
  return normalise(chosen) === normalise(trimmed) ? `${trimmed} maybe` : chosen;
}

// ── Payload construction ────────────────────────────────────────────────────

function correctPayload(question: MarkableQuestion): SeedResponsePayload {
  switch (question.type) {
    case 'MULTIPLE_CHOICE':
      return {
        optionIds: question.options.filter((option) => option.isCorrect).map((o) => o.id),
        skipped: false,
      };
    case 'TRUE_FALSE':
      return { booleanValue: question.correctBoolean ?? true, skipped: false };
    case 'NUMERIC':
      return { numericValue: question.correctNumeric ?? 0, skipped: false };
    case 'SHORT_TEXT':
      return { textValue: question.correctText ?? '', skipped: false };
    case 'MATCHING':
      return {
        pairs: question.options
          .filter((option) => option.matchKey !== null)
          .map((option) => ({ optionId: option.id, matchKey: option.matchKey as string })),
        skipped: false,
      };
    case 'SORTING':
      return { orderedOptionIds: question.options.map((option) => option.id), skipped: false };
    default:
      return { skipped: true };
  }
}

function wrongPayload(question: MarkableQuestion, key: string): SeedResponsePayload {
  switch (question.type) {
    case 'MULTIPLE_CHOICE': {
      const distractors = question.options.filter((option) => !option.isCorrect);
      // A question with no distractor cannot be answered wrongly by selection, so
      // the learner is recorded as having submitted nothing rather than as skipping.
      if (distractors.length === 0) return { optionIds: [], skipped: false };
      const chosen = distractors[intBetween(`mc:${key}`, 0, distractors.length - 1)];
      return { optionIds: [(chosen).id], skipped: false };
    }
    case 'TRUE_FALSE':
      return { booleanValue: !(question.correctBoolean ?? true), skipped: false };
    case 'NUMERIC': {
      const correct = question.correctNumeric ?? 0;
      const tolerance = Math.abs(question.numericTolerance ?? 0);
      // Clear the tolerance band by a wide margin so the miss is unambiguous.
      const drift = tolerance * 2 + intBetween(`num:${key}`, 1, 9);
      return { numericValue: correct + (unit(`sign:${key}`) < 0.5 ? -drift : drift), skipped: false };
    }
    case 'SHORT_TEXT':
      return { textValue: textNearMiss(question.correctText ?? 'answer', key), skipped: false };
    case 'MATCHING': {
      const keyed = question.options.filter((option) => option.matchKey !== null);
      if (keyed.length < 2) return { pairs: [], skipped: false };
      const shifted = rotate(keyed.map((option) => option.matchKey as string));
      return {
        pairs: keyed.map((option, index) => ({
          optionId: option.id,
          matchKey: shifted[index],
        })),
        skipped: false,
      };
    }
    case 'SORTING': {
      const ids = question.options.map((option) => option.id);
      if (ids.length < 2) return { orderedOptionIds: ids, skipped: false };
      return {
        orderedOptionIds: swapAt(ids, intBetween(`sort:${key}`, 0, ids.length - 1)),
        skipped: false,
      };
    }
    default:
      return { skipped: true };
  }
}

/**
 * Builds one answer. `key` is any stable string — the seed passes
 * `${attemptId}:${questionId}` — so the same build always produces the same wrong
 * answer, and a screenshot of a demo dashboard stays reproducible.
 */
export function buildResponse(
  question: MarkableQuestion,
  intent: ResponseIntent,
  key: string,
): SeedResponsePayload {
  if (intent === 'skipped') return { skipped: true };
  return intent === 'correct' ? correctPayload(question) : wrongPayload(question, key);
}

// ── Marking ─────────────────────────────────────────────────────────────────

function isCorrectAnswer(question: MarkableQuestion, payload: SeedResponsePayload): boolean {
  switch (question.type) {
    case 'MULTIPLE_CHOICE': {
      const selected = payload.optionIds ?? [];
      const answerKey = question.options.filter((o) => o.isCorrect).map((o) => o.id);
      return answerKey.length > 0 && sameIdSet(selected, answerKey);
    }
    case 'TRUE_FALSE':
      return (
        question.correctBoolean !== null && payload.booleanValue === question.correctBoolean
      );
    case 'NUMERIC': {
      if (question.correctNumeric === null || payload.numericValue === undefined) return false;
      const tolerance = Math.abs(question.numericTolerance ?? 0) + 1e-9;
      return Math.abs(payload.numericValue - question.correctNumeric) <= tolerance;
    }
    case 'SHORT_TEXT':
      return (
        question.correctText !== null &&
        payload.textValue !== undefined &&
        normalise(payload.textValue) === normalise(question.correctText)
      );
    case 'MATCHING': {
      const pairs = payload.pairs ?? [];
      const keyed = question.options.filter((option) => option.matchKey !== null);
      if (keyed.length === 0 || pairs.length !== keyed.length) return false;
      const answer = new Map(pairs.map((pair) => [pair.optionId, normalise(pair.matchKey)]));
      return keyed.every(
        (option) => answer.get(option.id) === normalise(option.matchKey as string),
      );
    }
    case 'SORTING': {
      const ordered = payload.orderedOptionIds ?? [];
      const expected = question.options.map((option) => option.id);
      return (
        expected.length > 0 &&
        ordered.length === expected.length &&
        expected.every((id, index) => ordered[index] === id)
      );
    }
    default:
      return false;
  }
}

/**
 * The same arithmetic as `markResponse`. `hintPointsCost` is the summed cost of the
 * hints the learner opened; the seed's hints are all free, so it is 0 in practice
 * and present only so the two implementations stay comparable.
 */
export function markSeedResponse(
  question: MarkableQuestion,
  payload: SeedResponsePayload,
  hintPointsCost = 0,
): SeedMark {
  const pointsPossible = Math.max(0, question.pointsValue);

  if (payload.skipped) {
    return { isCorrect: false, pointsAwarded: 0, pointsPossible };
  }

  const isCorrect = isCorrectAnswer(question, payload);
  return {
    isCorrect,
    pointsAwarded: isCorrect ? Math.max(0, pointsPossible - Math.max(0, hintPointsCost)) : 0,
    pointsPossible,
  };
}

/** Convenience for the seed: build and mark in one step. */
export function answer(
  question: MarkableQuestion,
  intent: ResponseIntent,
  key: string,
): { payload: SeedResponsePayload; mark: SeedMark } {
  const payload = buildResponse(question, intent, key);
  return { payload, mark: markSeedResponse(question, payload) };
}
