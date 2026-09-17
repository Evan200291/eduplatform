import { ApiError } from '@/api';
import { humanizeFieldMessage } from './humanize-validation';

/**
 * Server validation, addressed by field name.
 *
 * The backend returns `issues: { path, message }[]` on `VALIDATION_FAILED`, which
 * `ApiError.fieldErrors()` flattens. Screens pass the result straight to
 * `<Field error={...}>` so a rejected form marks the offending input instead of
 * showing one message at the top and leaving the user hunting.
 *
 * Each message passes through `humanizeFieldMessage` first: most validation
 * primitives on the backend never set a custom message, so the raw text is
 * Zod's own ("String must contain at least 1 character(s)") rather than
 * anything meant for a screen.
 */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const raw = error.fieldErrors();
  const out: Record<string, string> = {};
  for (const [path, message] of Object.entries(raw)) out[path] = humanizeFieldMessage(message);
  return out;
}

/**
 * True when the failure was purely about the submitted values *and* the
 * per-field messages already say everything, so a summary alert would only
 * repeat it.
 *
 * `code === 'VALIDATION_FAILED'` alone is not enough: the backend reuses that
 * one code for `badRequest(message)` too — a general refusal with a specific,
 * hand-written reason and no field to blame it on (122 call sites, e.g. "That
 * invitation has expired."). A form gating its `<ErrorState>` on this alone
 * used to go completely silent for that case: no field turned red (there was
 * nothing in `issues` to attach to one), and the summary was suppressed
 * because the code matched. Requiring at least one issue is what tells the
 * two apart.
 */
export function isValidationError(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'VALIDATION_FAILED' && error.issues.length > 0;
}
