import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api';
import { errorCopy } from './error-messages';

describe('errorCopy', () => {
  it('uses the generic "highlighted fields" copy when the server sent real field issues', () => {
    const error = new ApiError({
      code: 'VALIDATION_FAILED',
      message: 'The submitted data is invalid.',
      status: 422,
      issues: [{ path: 'email', message: 'Invalid email' }],
    });
    expect(errorCopy(error).title).toBe('Some details need fixing.');
  });

  it("uses the server's own message for a badRequest()-style refusal with no field to blame", () => {
    const error = new ApiError({
      code: 'VALIDATION_FAILED',
      message: 'That invitation has expired. Ask your administrator for a new one.',
      status: 400,
      issues: [],
    });
    expect(errorCopy(error).title).toBe('That invitation has expired. Ask your administrator for a new one.');
  });

  it('falls back to a generic message for a non-ApiError', () => {
    expect(errorCopy(new Error('boom')).title).toBe('Something went wrong.');
  });

  it('still uses the mapped copy for a known unrelated code', () => {
    const error = new ApiError({ code: 'NOT_FOUND', message: 'Assignment 123 not found', status: 404, issues: [] });
    expect(errorCopy(error).title).toBe('We could not find that.');
  });
});
