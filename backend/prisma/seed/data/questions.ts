// ─────────────────────────────────────────────────────────────────────────────
// Question bank — combined index
//
// To add a subject: create `questions.<subject>.ts` exporting a `QuestionBank`,
// then add it to the `mergeBanks` call below. Nothing else needs editing — the
// writer in prisma/seed/question.seed.ts reads this table and nothing else.
//
// Keys are `${programKey}:${topicKey}`. A topic with no entry here simply gets
// no questions; the seed reports the gap rather than failing.
// ─────────────────────────────────────────────────────────────────────────────

import { ENGLISH_QUESTIONS } from './questions.english';
import { FORM_QUESTIONS } from './questions.forms';
import { MATHEMATICS_QUESTIONS } from './questions.mathematics';
import { SCIENCE_QUESTIONS } from './questions.science';
import type { QuestionBank, QuestionSpec } from './questions.types';

/**
 * Concatenates per topic key rather than spreading, because two banks may
 * legitimately contribute questions to the same topic — the matching and
 * sorting items in `questions.forms.ts` do exactly that. A plain object spread
 * would silently drop the earlier array.
 */
function mergeBanks(...banks: readonly QuestionBank[]): QuestionBank {
  const merged: Record<string, QuestionSpec[]> = {};

  for (const bank of banks) {
    for (const [key, specs] of Object.entries(bank)) {
      const bucket = merged[key] ?? (merged[key] = []);
      bucket.push(...specs);
    }
  }

  return merged;
}

export const QUESTION_BANK: QuestionBank = mergeBanks(
  MATHEMATICS_QUESTIONS,
  ENGLISH_QUESTIONS,
  SCIENCE_QUESTIONS,
  FORM_QUESTIONS,
);

export type { OptionSpec, QuestionBank, QuestionSpec } from './questions.types';
