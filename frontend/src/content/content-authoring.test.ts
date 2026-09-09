import { describe, expect, it } from 'vitest';
import { forQuestionType, questionAnswerKeyIssues, questionTypeShape } from './content-authoring';
import type { QuestionInput } from './content.types';

/**
 * These rules mirror `answerKeyIssues` in the backend's content.validation.ts.
 *
 * The mirror is the point of the tests: if the two drift, an author is told a
 * draft is fine and the server then rejects it, which is the worst version of
 * this feature. Each case here is one rule the server enforces.
 */

function draft(overrides: Partial<QuestionInput>): QuestionInput {
  return {
    type: 'MULTIPLE_CHOICE',
    prompt: 'What is 2 + 2?',
    options: [],
    hints: [],
    ...overrides,
  };
}

describe('questionAnswerKeyIssues', () => {
  it('asks for a prompt before anything else', () => {
    const issues = questionAnswerKeyIssues(draft({ prompt: '   ' }));
    expect(issues).toContain('Write the question itself.');
  });

  it('reports no issues for a complete multiple-choice question', () => {
    const issues = questionAnswerKeyIssues(
      draft({
        options: [
          { label: '4', isCorrect: true },
          { label: '5', isCorrect: false },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  it('requires two options and a correct one for multiple choice', () => {
    expect(questionAnswerKeyIssues(draft({ options: [{ label: '4', isCorrect: true }] }))).toContain(
      'Add at least two answers.',
    );

    expect(
      questionAnswerKeyIssues(
        draft({
          options: [
            { label: '4', isCorrect: false },
            { label: '5', isCorrect: false },
          ],
        }),
      ),
    ).toContain('Mark at least one answer as correct.');
  });

  it('ignores blank option rows when counting', () => {
    // An author who adds a row and does not fill it in has one answer, not two.
    const issues = questionAnswerKeyIssues(
      draft({
        options: [
          { label: '4', isCorrect: true },
          { label: '   ', isCorrect: false },
        ],
      }),
    );
    expect(issues).toContain('Add at least two answers.');
  });

  it('requires an explicit true or false answer', () => {
    expect(questionAnswerKeyIssues(draft({ type: 'TRUE_FALSE' }))).toContain(
      'Choose whether the answer is true or false.',
    );
    // false is a real answer, not a missing one — the classic falsy-check bug.
    expect(questionAnswerKeyIssues(draft({ type: 'TRUE_FALSE', correctBoolean: false }))).toEqual([]);
  });

  it('requires a number for a numeric question, and accepts zero', () => {
    expect(questionAnswerKeyIssues(draft({ type: 'NUMERIC' }))).toContain('Set the correct number.');
    expect(questionAnswerKeyIssues(draft({ type: 'NUMERIC', correctNumeric: 0 }))).toEqual([]);
  });

  it('requires at least one non-blank accepted answer for short text', () => {
    expect(questionAnswerKeyIssues(draft({ type: 'SHORT_TEXT', correctText: [] }))).toContain(
      'Add at least one accepted answer.',
    );
    expect(questionAnswerKeyIssues(draft({ type: 'SHORT_TEXT', correctText: ['  '] }))).toContain(
      'Add at least one accepted answer.',
    );
    expect(questionAnswerKeyIssues(draft({ type: 'SHORT_TEXT', correctText: ['four'] }))).toEqual([]);
  });

  it('requires a pair key on every matching option', () => {
    const issues = questionAnswerKeyIssues(
      draft({
        type: 'MATCHING',
        options: [
          { label: 'France', matchKey: 'capital-france' },
          { label: 'Paris' },
        ],
      }),
    );
    expect(issues).toContain('Every pair needs a key so the platform knows what matches what.');
  });

  it('accepts a sorting question with two items and no answer key', () => {
    const issues = questionAnswerKeyIssues(
      draft({ type: 'SORTING', options: [{ label: 'First' }, { label: 'Second' }] }),
    );
    expect(issues).toEqual([]);
  });
});

describe('forQuestionType', () => {
  it('clears the answer key belonging to a different type', () => {
    // Switching a numeric question to multiple choice must not carry the stale
    // number along, or the server rejects a draft the author can see is fine.
    const payload = forQuestionType(
      draft({
        type: 'MULTIPLE_CHOICE',
        correctNumeric: 42,
        correctBoolean: true,
        correctText: ['forty two'],
        options: [
          { label: '4', isCorrect: true },
          { label: '5', isCorrect: false },
        ],
      }),
    );

    expect(payload.correctNumeric).toBeNull();
    expect(payload.correctBoolean).toBeNull();
    expect(payload.correctText).toBeNull();
  });

  it('drops blank rows and renumbers what survives', () => {
    const payload = forQuestionType(
      draft({
        options: [
          { label: 'First', isCorrect: true },
          { label: '  ', isCorrect: false },
          { label: 'Third', isCorrect: false },
        ],
        hints: [{ body: 'Try counting up.' }, { body: '   ' }],
      }),
    );

    expect(payload.options?.map((option) => option.label)).toEqual(['First', 'Third']);
    expect(payload.options?.map((option) => option.sortOrder)).toEqual([0, 1]);
    expect(payload.hints).toHaveLength(1);
    expect(payload.hints?.[0]?.sortOrder).toBe(0);
  });

  it('does not send a correct flag for a type that has no correct answer', () => {
    const payload = forQuestionType(
      draft({
        type: 'SORTING',
        options: [
          { label: 'First', isCorrect: true },
          { label: 'Second', isCorrect: true },
        ],
      }),
    );
    expect(payload.options?.every((option) => option.isCorrect === false)).toBe(true);
  });

  it('trims the prompt and turns an empty explanation into undefined', () => {
    const payload = forQuestionType(
      draft({
        prompt: '  What is 2 + 2?  ',
        explanation: '   ',
        options: [
          { label: '4', isCorrect: true },
          { label: '5', isCorrect: false },
        ],
      }),
    );
    expect(payload.prompt).toBe('What is 2 + 2?');
    expect(payload.explanation).toBeUndefined();
  });
});

describe('questionTypeShape', () => {
  it('asks for options only for the types that have them', () => {
    expect(questionTypeShape('MULTIPLE_CHOICE').usesOptions).toBe(true);
    expect(questionTypeShape('MATCHING').usesOptions).toBe(true);
    expect(questionTypeShape('SORTING').usesOptions).toBe(true);
    expect(questionTypeShape('TRUE_FALSE').usesOptions).toBe(false);
    expect(questionTypeShape('NUMERIC').usesOptions).toBe(false);
    expect(questionTypeShape('SHORT_TEXT').usesOptions).toBe(false);
  });

  it('only multiple choice marks a correct option', () => {
    expect(questionTypeShape('MULTIPLE_CHOICE').usesCorrectFlag).toBe(true);
    expect(questionTypeShape('MATCHING').usesCorrectFlag).toBe(false);
    expect(questionTypeShape('SORTING').usesCorrectFlag).toBe(false);
  });
});
