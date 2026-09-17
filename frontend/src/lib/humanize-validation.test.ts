import { describe, expect, it } from 'vitest';
import { humanizeFieldMessage } from './humanize-validation';

describe('humanizeFieldMessage', () => {
  it('rewrites the empty-required-string message the login form actually hits', () => {
    expect(humanizeFieldMessage('String must contain at least 1 character(s)')).toBe(
      'This is required.',
    );
  });

  it('rewrites known Zod default shapes', () => {
    expect(humanizeFieldMessage('Required')).toBe('This is required.');
    expect(humanizeFieldMessage('String must contain at least 3 character(s)')).toBe(
      'Enter at least 3 characters.',
    );
    expect(humanizeFieldMessage('String must contain at most 120 character(s)')).toBe(
      'Keep this to 120 characters or fewer.',
    );
    expect(humanizeFieldMessage('Number must be greater than or equal to 1')).toBe(
      'Enter 1 or more.',
    );
    expect(humanizeFieldMessage('Number must be less than or equal to 100')).toBe(
      'Enter 100 or less.',
    );
    expect(humanizeFieldMessage('Array must contain at least 1 element(s)')).toBe(
      'Choose at least one.',
    );
    expect(humanizeFieldMessage('Invalid email')).toBe('Enter a valid email address.');
    expect(humanizeFieldMessage("Invalid enum value. Expected 'A' | 'B', received 'C'")).toBe(
      'Choose one of the options shown.',
    );
    expect(humanizeFieldMessage('Expected string, received undefined')).toBe(
      'This is required.',
    );
    expect(humanizeFieldMessage('Expected string, received number')).toBe(
      "That doesn't look right — check it and try again.",
    );
  });

  it('leaves a hand-written backend message untouched', () => {
    const custom = "That nickname isn't allowed — try another.";
    expect(humanizeFieldMessage(custom)).toBe(custom);
    const another = 'Use a hex colour such as #4F46E5.';
    expect(humanizeFieldMessage(another)).toBe(another);
  });
});
