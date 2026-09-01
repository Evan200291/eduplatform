import { ApiError } from '@/api';

/**
 * Server validation, addressed by field name.
 *
 * The backend returns `issues: { path, message }[]` on `VALIDATION_FAILED`, which
 * `ApiError.fieldErrors()` flattens. Screens pass the result straight to
 * `<Field error={...}>` so a rejected form marks the offending input instead of
 * showing one message at the top and leaving the user hunting.
 */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrors() : {};
}

/**
 * True when the failure was purely about the submitted values, meaning the
 * per-field messages already say everything and a summary alert would repeat it.
 */
export function isValidationError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'VALIDATION_FAILED';
}
