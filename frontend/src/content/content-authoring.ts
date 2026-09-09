import type { QuestionInput, QuestionType } from './content.types';

/**
 * The answer-key rules, mirrored from the server.
 *
 * `answerKeyIssues` in `backend/src/modules/content/content.validation.ts` is the
 * authority and re-runs on every write — this is not a security boundary. It
 * exists so an author is told "a multiple-choice question needs a correct answer"
 * while they are still writing it, instead of losing the form to a 422.
 *
 * The wording differs from the server's on purpose: those messages are written
 * for a developer reading a log, these for a teacher building a question.
 *
 * Keep this in step with the server. If the rules there change, they change here.
 */

/** Which parts of the form a given question type actually uses. */
export interface QuestionTypeShape {
  /** Options are authored as a list: multiple choice, matching pairs, sortable items. */
  usesOptions: boolean;
  /** At least one option must be flagged correct. */
  usesCorrectFlag: boolean;
  /** Each option carries a key naming its pair. */
  usesMatchKey: boolean;
  usesCorrectBoolean: boolean;
  usesCorrectNumeric: boolean;
  usesCorrectText: boolean;
  /** Shown under the options list to explain what the author is building. */
  optionsLabel: string;
  optionsHint: string;
}

const SHAPES: Record<QuestionType, QuestionTypeShape> = {
  MULTIPLE_CHOICE: {
    usesOptions: true,
    usesCorrectFlag: true,
    usesMatchKey: false,
    usesCorrectBoolean: false,
    usesCorrectNumeric: false,
    usesCorrectText: false,
    optionsLabel: 'Answers',
    optionsHint: 'At least two, with one or more marked correct. Feedback on a wrong answer is where the teaching happens.',
  },
  TRUE_FALSE: {
    usesOptions: false,
    usesCorrectFlag: false,
    usesMatchKey: false,
    usesCorrectBoolean: true,
    usesCorrectNumeric: false,
    usesCorrectText: false,
    optionsLabel: 'Answers',
    optionsHint: '',
  },
  NUMERIC: {
    usesOptions: false,
    usesCorrectFlag: false,
    usesMatchKey: false,
    usesCorrectBoolean: false,
    usesCorrectNumeric: true,
    usesCorrectText: false,
    optionsLabel: 'Answers',
    optionsHint: '',
  },
  SHORT_TEXT: {
    usesOptions: false,
    usesCorrectFlag: false,
    usesMatchKey: false,
    usesCorrectBoolean: false,
    usesCorrectNumeric: false,
    usesCorrectText: true,
    optionsLabel: 'Answers',
    optionsHint: '',
  },
  MATCHING: {
    usesOptions: true,
    usesCorrectFlag: false,
    usesMatchKey: true,
    usesCorrectBoolean: false,
    usesCorrectNumeric: false,
    usesCorrectText: false,
    optionsLabel: 'Pairs',
    optionsHint: 'Give both halves of a pair the same key — "capital-france" on both "France" and "Paris".',
  },
  SORTING: {
    usesOptions: true,
    usesCorrectFlag: false,
    usesMatchKey: false,
    usesCorrectBoolean: false,
    usesCorrectNumeric: false,
    usesCorrectText: false,
    optionsLabel: 'Items',
    optionsHint: 'List them in the correct order. The learner sees them shuffled.',
  },
};

export function questionTypeShape(type: QuestionType): QuestionTypeShape {
  return SHAPES[type];
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True or false',
  NUMERIC: 'Numeric answer',
  SHORT_TEXT: 'Short text',
  MATCHING: 'Matching pairs',
  SORTING: 'Put in order',
};

/**
 * Everything wrong with a draft, in the order an author would fix it.
 *
 * Returns an empty array when the draft is ready to save.
 */
export function questionAnswerKeyIssues(draft: Partial<QuestionInput>): string[] {
  const issues: string[] = [];
  const type = draft.type;
  if (!type) return ['Choose a question type.'];

  if (!draft.prompt?.trim()) issues.push('Write the question itself.');

  const options = draft.options ?? [];
  const shape = SHAPES[type];

  if (shape.usesOptions) {
    const filled = options.filter((option) => option.label.trim().length > 0);
    if (filled.length < 2) {
      issues.push(
        type === 'MATCHING'
          ? 'Add at least two pairs.'
          : type === 'SORTING'
            ? 'Add at least two items to put in order.'
            : 'Add at least two answers.',
      );
    }
    if (shape.usesCorrectFlag && !filled.some((option) => option.isCorrect)) {
      issues.push('Mark at least one answer as correct.');
    }
    if (shape.usesMatchKey && filled.some((option) => !option.matchKey?.trim())) {
      issues.push('Every pair needs a key so the platform knows what matches what.');
    }
  }

  if (shape.usesCorrectBoolean && draft.correctBoolean !== true && draft.correctBoolean !== false) {
    issues.push('Choose whether the answer is true or false.');
  }

  if (shape.usesCorrectNumeric && (draft.correctNumeric === null || draft.correctNumeric === undefined)) {
    issues.push('Set the correct number.');
  }

  if (shape.usesCorrectText && !(draft.correctText ?? []).some((answer) => answer.trim().length > 0)) {
    issues.push('Add at least one accepted answer.');
  }

  return issues;
}

/**
 * Strips the fields a question type does not use before sending.
 *
 * Without this, switching a numeric question to multiple choice would carry the
 * stale `correctNumeric` along and the server would reject a draft the author
 * can see is fine. Unused keys go as `null` rather than being omitted, so an
 * update actually clears what was there.
 */
export function forQuestionType(draft: QuestionInput): QuestionInput {
  const shape = SHAPES[draft.type];
  return {
    ...draft,
    prompt: draft.prompt.trim(),
    explanation: draft.explanation?.trim() || undefined,
    options: shape.usesOptions
      ? (draft.options ?? [])
          .filter((option) => option.label.trim().length > 0)
          .map((option, index) => ({
            label: option.label.trim(),
            sortOrder: index,
            isCorrect: shape.usesCorrectFlag ? Boolean(option.isCorrect) : false,
            feedback: option.feedback?.trim() || undefined,
            matchKey: shape.usesMatchKey ? option.matchKey?.trim() || undefined : undefined,
          }))
      : undefined,
    hints: (draft.hints ?? [])
      .filter((hint) => hint.body.trim().length > 0)
      .map((hint, index) => ({ body: hint.body.trim(), sortOrder: index, pointsCost: hint.pointsCost ?? 0 })),
    correctBoolean: shape.usesCorrectBoolean ? draft.correctBoolean ?? null : null,
    correctNumeric: shape.usesCorrectNumeric ? draft.correctNumeric ?? null : null,
    numericTolerance: shape.usesCorrectNumeric ? draft.numericTolerance ?? null : null,
    correctText: shape.usesCorrectText
      ? (draft.correctText ?? []).map((answer) => answer.trim()).filter(Boolean)
      : null,
  };
}
