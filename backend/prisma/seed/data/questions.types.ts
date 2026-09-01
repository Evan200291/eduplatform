// ─────────────────────────────────────────────────────────────────────────────
// Question bank data — shared shapes
// Blueprint 03 "Supported initial forms" and blueprint 12 evidence capture.
//
// Three questions per topic, hand-written so the demo contains real teaching
// content rather than generated filler. The answer key lives here and is never
// sent to a student client; marking happens in src/modules/assessment.
//
// Keys are `${programKey}:${topicKey}`, matching the curriculum data tables.
// ─────────────────────────────────────────────────────────────────────────────

import type { DifficultyBand, QuestionType } from '@prisma/client';

/** `[label, isCorrect, feedback]` — feedback turns a wrong choice into teaching. */
export type OptionSpec = readonly [label: string, isCorrect: boolean, feedback: string];

export interface QuestionSpec {
  type: QuestionType;
  prompt: string;
  /** Shown after answering. Explains; never shames. */
  explanation: string;
  /** Index into the topic's objective list, so evidence attributes correctly. */
  objective: 0 | 1;
  /** One scaffold per question. Free by default — using it is recorded, not punished. */
  hint: string;
  band?: DifficultyBand;
  points?: number;
  /** MULTIPLE_CHOICE, MATCHING and SORTING. */
  options?: readonly OptionSpec[];
  /**
   * MATCHING answer key: `[left, right]` pairs. The writer stores `left` as the
   * option label and `right` as its `matchKey`, so the API can shuffle the right
   * column before sending and still mark the response server-side.
   */
  pairs?: readonly (readonly [left: string, right: string])[];
  /**
   * SORTING answer key: the items in their one correct order. The writer stores
   * the index as `sortOrder`, which is therefore an answer key and — like
   * `isCorrect` — must never be sent to a student client.
   */
  order?: readonly string[];
  /** NUMERIC answer key. */
  numeric?: number;
  tolerance?: number;
  /** TRUE_FALSE answer key. */
  boolean?: boolean;
  /** SHORT_TEXT accepted answers, compared case-insensitively. */
  text?: readonly string[];
}

/** Questions by `${programKey}:${topicKey}`. */
export type QuestionBank = Readonly<Record<string, readonly QuestionSpec[]>>;
