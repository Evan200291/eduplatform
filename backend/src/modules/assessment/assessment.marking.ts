// ─────────────────────────────────────────────────────────────────────────────
// Marking
// Blueprint 12: "a student response references the exact content version that was
// presented." Marking therefore reads the answer key out of the immutable
// `ActivityVersion.snapshot`, never out of the mutable `Question` row — so a
// question edited after the learner answered cannot retroactively change the mark.
//
// Nothing in this file touches the database or the request. It is pure, which is
// what makes the arithmetic reviewable: given a snapshot question and a learner
// payload, the outcome is fully determined.
// ─────────────────────────────────────────────────────────────────────────────

import { DifficultyBand, QuestionType, type Prisma } from '@prisma/client';
import { badRequest, preconditionFailed } from '../../core/http/errors';
import type { ResponsePayload } from './assessment.validation';

export interface SnapshotOption {
  optionId: string;
  label: string;
  isCorrect: boolean;
  sortOrder: number;
  feedback: string | null;
  matchKey: string | null;
  mediaId: string | null;
}

export interface SnapshotHint {
  hintId: string;
  body: string;
  sortOrder: number;
  pointsCost: number;
}

export interface SnapshotQuestion {
  questionId: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  config: Prisma.JsonValue;
  promptMediaId: string | null;
  objectiveId: string | null;
  difficultyBand: DifficultyBand;
  pointsValue: number;
  sortOrder: number;
  timeLimitSeconds: number | null;
  correctNumeric: number | null;
  numericTolerance: number | null;
  correctBoolean: boolean | null;
  correctText: string[] | null;
  options: SnapshotOption[];
  hints: SnapshotHint[];
}

export interface SnapshotActivity {
  activityId: string;
  title: string;
  type: string;
  instructions: string | null;
  config: Prisma.JsonValue;
  difficultyBand: DifficultyBand;
  pointsValue: number;
  passThreshold: number;
  /** Presentation metadata the delivery endpoint passes straight through. */
  estimatedMinutes: number | null;
  ageMode: string | null;
  topicId: string;
  subjectId: string;
  objectives: { objectiveId: string; weight: number }[];
  questions: SnapshotQuestion[];
}

// ── Snapshot parsing ────────────────────────────────────────────────────────

type Bag = Record<string, unknown>;

function asBag(value: unknown): Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function enumOr<T extends Record<string, string>>(
  candidates: T,
  value: unknown,
  fallback: T[keyof T],
): T[keyof T] {
  return typeof value === 'string' && Object.values(candidates).includes(value)
    ? (value as T[keyof T])
    : fallback;
}

function toOption(raw: unknown): SnapshotOption {
  const bag = asBag(raw);
  return {
    optionId: str(bag.optionId),
    label: str(bag.label),
    isCorrect: bool(bag.isCorrect, false),
    sortOrder: num(bag.sortOrder, 0),
    feedback: nullableStr(bag.feedback),
    matchKey: nullableStr(bag.matchKey),
    mediaId: nullableStr(bag.mediaId),
  };
}

function toQuestion(raw: unknown): SnapshotQuestion {
  const bag = asBag(raw);
  return {
    questionId: str(bag.questionId),
    type: enumOr(QuestionType, bag.type, QuestionType.MULTIPLE_CHOICE),
    prompt: str(bag.prompt),
    explanation: nullableStr(bag.explanation),
    config: (bag.config ?? null),
    promptMediaId: nullableStr(bag.promptMediaId),
    objectiveId: nullableStr(bag.objectiveId),
    difficultyBand: enumOr(DifficultyBand, bag.difficultyBand, DifficultyBand.DEVELOPING),
    pointsValue: Math.max(0, num(bag.pointsValue, 1)),
    sortOrder: num(bag.sortOrder, 0),
    timeLimitSeconds: nullableNum(bag.timeLimitSeconds),
    correctNumeric: nullableNum(bag.correctNumeric),
    numericTolerance: nullableNum(bag.numericTolerance),
    correctBoolean: nullableBool(bag.correctBoolean),
    correctText: Array.isArray(bag.correctText)
      ? bag.correctText.filter((entry): entry is string => typeof entry === 'string')
      : null,
    options: asArray(bag.options).map(toOption).sort((a, b) => a.sortOrder - b.sortOrder),
    hints: asArray(bag.hints)
      .map((entry) => {
        const hint = asBag(entry);
        return {
          hintId: str(hint.hintId),
          body: str(hint.body),
          sortOrder: num(hint.sortOrder, 0),
          pointsCost: Math.max(0, num(hint.pointsCost, 0)),
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/**
 * Reads a stored snapshot defensively. A snapshot is written by this codebase, but
 * it is a JSON column that outlives the code that wrote it, so every field is
 * narrowed rather than asserted.
 */
export function parseActivitySnapshot(value: Prisma.JsonValue): SnapshotActivity {
  const bag = asBag(value);
  const activityId = str(bag.activityId);
  if (!activityId) throw preconditionFailed('That content version has no usable snapshot.');

  return {
    activityId,
    title: str(bag.title),
    type: str(bag.type),
    instructions: nullableStr(bag.instructions),
    config: (bag.config ?? null),
    difficultyBand: enumOr(DifficultyBand, bag.difficultyBand, DifficultyBand.DEVELOPING),
    pointsValue: Math.max(0, num(bag.pointsValue, 0)),
    passThreshold: Math.min(100, Math.max(0, num(bag.passThreshold, 70))),
    estimatedMinutes: nullableNum(bag.estimatedMinutes),
    ageMode: nullableStr(bag.ageMode),
    topicId: str(bag.topicId),
    subjectId: str(bag.subjectId),
    objectives: asArray(bag.objectives).map((entry) => {
      const link = asBag(entry);
      return { objectiveId: str(link.objectiveId), weight: Math.max(1, num(link.weight, 100)) };
    }),
    questions: asArray(bag.questions)
      .map(toQuestion)
      .filter((question) => question.questionId.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function findSnapshotQuestion(
  snapshot: SnapshotActivity,
  questionId: string,
): SnapshotQuestion {
  const question = snapshot.questions.find((entry) => entry.questionId === questionId);
  if (!question) {
    throw badRequest('That question is not part of the version being attempted.');
  }
  return question;
}

/**
 * The learner-safe view of a snapshot question. Mirrors `DELIVERY_QUESTION_SELECT`
 * in the content service: no `isCorrect`, no `matchKey`, no distractor feedback and
 * no `correct*` value ever crosses the wire.
 */
export function presentQuestion(question: SnapshotQuestion) {
  return {
    id: question.questionId,
    type: question.type,
    prompt: question.prompt,
    config: question.config,
    promptMediaId: question.promptMediaId,
    objectiveId: question.objectiveId,
    difficultyBand: question.difficultyBand,
    pointsValue: question.pointsValue,
    sortOrder: question.sortOrder,
    timeLimitSeconds: question.timeLimitSeconds,
    options: question.options.map((option) => ({
      id: option.optionId,
      label: option.label,
      sortOrder: option.sortOrder,
      mediaId: option.mediaId,
    })),
    hints: question.hints.map((hint) => ({
      id: hint.hintId,
      body: hint.body,
      sortOrder: hint.sortOrder,
      pointsCost: hint.pointsCost,
    })),
  };
}

// ── Marking ─────────────────────────────────────────────────────────────────

export interface MarkResult {
  isCorrect: boolean;
  pointsAwarded: number;
  pointsPossible: number;
  /**
   * Distractor-specific feedback where the author wrote one, otherwise the
   * question explanation. The caller decides whether the learner may see it yet.
   */
  feedback: string | null;
}

/** Case- and whitespace-insensitive comparison for SHORT_TEXT and match keys. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((entry) => seen.has(entry));
}

/** Hints are free by default; only an author-declared `pointsCost` reduces a mark. */
function hintCost(question: SnapshotQuestion, hintsUsed: number): number {
  if (hintsUsed <= 0) return 0;
  return question.hints
    .slice(0, hintsUsed)
    .reduce((total, hint) => total + Math.max(0, hint.pointsCost), 0);
}

function requireField<T>(value: T | undefined, field: string, type: QuestionType): T {
  if (value === undefined) {
    throw badRequest(`A ${type} answer must include "${field}".`);
  }
  return value;
}

function isCorrectAnswer(question: SnapshotQuestion, payload: ResponsePayload): boolean {
  switch (question.type) {
    case QuestionType.MULTIPLE_CHOICE: {
      const selected = requireField(payload.optionIds, 'optionIds', question.type);
      const key = question.options.filter((option) => option.isCorrect).map((o) => o.optionId);
      // Exact-set match. A partially correct multi-select is wrong rather than
      // half-right, so the pass threshold means the same thing on every item.
      return key.length > 0 && sameIdSet(selected, key);
    }
    case QuestionType.TRUE_FALSE: {
      const value = requireField(payload.booleanValue, 'booleanValue', question.type);
      return question.correctBoolean !== null && value === question.correctBoolean;
    }
    case QuestionType.NUMERIC: {
      const value = requireField(payload.numericValue, 'numericValue', question.type);
      if (question.correctNumeric === null) return false;
      // A tiny epsilon absorbs binary floating-point noise on an exact-match item.
      const tolerance = Math.abs(question.numericTolerance ?? 0) + 1e-9;
      return Math.abs(value - question.correctNumeric) <= tolerance;
    }
    case QuestionType.SHORT_TEXT: {
      const value = requireField(payload.textValue, 'textValue', question.type);
      const accepted = question.correctText ?? [];
      return accepted.some((entry) => normalise(entry) === normalise(value));
    }
    case QuestionType.MATCHING: {
      const pairs = requireField(payload.pairs, 'pairs', question.type);
      const keyed = question.options.filter((option) => option.matchKey !== null);
      if (keyed.length === 0 || pairs.length !== keyed.length) return false;
      const answer = new Map(pairs.map((pair) => [pair.optionId, normalise(pair.matchKey)]));
      return keyed.every((option) => answer.get(option.optionId) === normalise(option.matchKey ?? ''));
    }
    case QuestionType.SORTING: {
      const ordered = requireField(payload.orderedOptionIds, 'orderedOptionIds', question.type);
      // SORTING is an ordering task; the author's `sortOrder` is the key. Bucket
      // tasks are authored as MATCHING, where the bucket is the `matchKey`.
      const expected = question.options.map((option) => option.optionId);
      return expected.length > 0 && ordered.length === expected.length
        && expected.every((id, index) => ordered[index] === id);
    }
    default:
      return false;
  }
}

/** Blueprint 03: a wrong answer is a teaching moment, so a distractor can explain itself. */
function feedbackFor(
  question: SnapshotQuestion,
  payload: ResponsePayload,
  isCorrect: boolean,
): string | null {
  if (isCorrect) return question.explanation;

  if (question.type === QuestionType.MULTIPLE_CHOICE) {
    const chosen = payload.optionIds ?? [];
    const distractor = question.options.find(
      (option) => !option.isCorrect && option.feedback && chosen.includes(option.optionId),
    );
    if (distractor?.feedback) return distractor.feedback;
  }
  return question.explanation;
}

export function markResponse(
  question: SnapshotQuestion,
  payload: ResponsePayload,
  hintsUsed = 0,
): MarkResult {
  const pointsPossible = question.pointsValue;

  if (payload.skipped) {
    return { isCorrect: false, pointsAwarded: 0, pointsPossible, feedback: null };
  }

  const isCorrect = isCorrectAnswer(question, payload);
  const pointsAwarded = isCorrect
    ? Math.max(0, pointsPossible - hintCost(question, hintsUsed))
    : 0;

  return {
    isCorrect,
    pointsAwarded,
    pointsPossible,
    feedback: feedbackFor(question, payload, isCorrect),
  };
}
