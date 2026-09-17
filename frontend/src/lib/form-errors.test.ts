import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api';
import { fieldErrorsOf, isValidationError } from './form-errors';

/**
 * The backend reuses `VALIDATION_FAILED` for two different shapes:
 * `validationFailed(issues)` (real per-field Zod problems) and
 * `badRequest(message)` (a general refusal, no field to blame — 122 call
 * sites, e.g. "That invitation has expired."). Both must be told apart here,
 * because a form used to render nothing at all for the second shape: no field
 * went red (there was nothing in `issues`), and the summary banner was
 * suppressed because the code matched anyway.
 */
function withIssues(issues: { path: string; message: string }[]): ApiError {
  return new ApiError({ code: 'VALIDATION_FAILED', message: 'The submitted data is invalid.', status: 422, issues });
}

function withoutIssues(message: string): ApiError {
  return new ApiError({ code: 'VALIDATION_FAILED', message, status: 400, issues: [] });
}

describe('isValidationError', () => {
  it('is true for a real field-level validation failure', () => {
    expect(isValidationError(withIssues([{ path: 'email', message: 'Invalid email' }]))).toBe(true);
  });

  it('is false for a badRequest()-style refusal with no field issues', () => {
    expect(isValidationError(withoutIssues('That invitation is no longer valid.'))).toBe(false);
  });

  it('is false for a non-ApiError', () => {
    expect(isValidationError(new Error('boom'))).toBe(false);
  });
});

describe('fieldErrorsOf', () => {
  it('humanizes each issue message', () => {
    const error = withIssues([{ path: 'studentCode', message: 'String must contain at least 1 character(s)' }]);
    expect(fieldErrorsOf(error)).toEqual({ studentCode: 'This is required.' });
  });

  it('is empty for an error with no issues', () => {
    expect(fieldErrorsOf(withoutIssues('That invitation is no longer valid.'))).toEqual({});
  });
});
