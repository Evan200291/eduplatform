/**
 * The one password rule the server actually enforces (`text(200, 10)` on the
 * password field — ten characters, trimmed, no complexity requirement).
 *
 * Mirrored here rather than invented: a client-side rule the backend does not
 * share would reject passwords the platform would have accepted, and a rule the
 * backend has but the client does not produces a confusing round trip. If the
 * backend rule changes, this file is the only place to follow it.
 */

export const PASSWORD_MIN_LENGTH = 10;

export function isPasswordAcceptable(value: string): boolean {
  return value.trim().length >= PASSWORD_MIN_LENGTH;
}

/** How many characters short the value still is. Zero once it is acceptable. */
export function passwordCharactersRemaining(value: string): number {
  return Math.max(0, PASSWORD_MIN_LENGTH - value.trim().length);
}
