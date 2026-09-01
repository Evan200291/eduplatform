// ─────────────────────────────────────────────────────────────────────────────
// Human-facing identifier generation
// Blueprint 03: young learners sign in with a school-issued code, so the code
// has to be readable aloud and typeable by a seven-year-old. The alphabet below
// removes every character pair that is confusable in a child's handwriting or on
// a printed card: 0/O, 1/I/L, 2/Z, 5/S, 8/B, U/V.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

/** Unambiguous uppercase alphabet for codes read aloud or copied from paper. */
const CODE_ALPHABET = '34679ACDEFGHJKMNPQRTWXY';

const DIGITS = '0123456789';

/** Cryptographically uniform pick, avoiding the modulo bias of `% length`. */
function randomChars(alphabet: string, length: number): string {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let output = '';
  while (output.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (const byte of bytes) {
      if (byte >= max) continue;
      output += alphabet[byte % alphabet.length];
      if (output.length === length) break;
    }
  }
  return output;
}

/**
 * A student sign-in code, grouped for legibility: `MID-K7T4-QF9C`.
 * `prefix` is the school's short code so a learner can tell which school a
 * printed card belongs to.
 */
export function generateStudentCode(prefix: string, bodyLength = 8): string {
  const normalizedPrefix = prefix
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  const body = randomChars(CODE_ALPHABET, Math.max(6, Math.min(bodyLength, 12)));
  const grouped = body.replace(/(.{4})(?=.)/g, '$1-');
  return normalizedPrefix ? `${normalizedPrefix}-${grouped}` : grouped;
}

/** A numeric PIN for student-code + PIN login. */
export function generatePin(length = 4): string {
  return randomChars(DIGITS, Math.max(4, Math.min(length, 8)));
}

/** A temporary staff password that satisfies `validatePassword`. */
export function generateTemporaryPassword(): string {
  const upper = randomChars('ABCDEFGHJKMNPQRSTUVWXYZ', 3);
  const lower = randomChars('abcdefghjkmnpqrstuvwxyz', 5);
  const digits = randomChars(DIGITS, 3);
  return `${upper}${lower}${digits}!`;
}

/** A URL-safe school or organization slug derived from its name. */
export function slugify(value: string, maxLength = 80): string {
  const base = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return base || `t-${randomChars(DIGITS, 6)}`;
}

/**
 * A sequential-looking public reference such as `MID-1042` for support requests
 * and incidents. The numeric part is random rather than a counter so the volume
 * of a tenant's support traffic is not inferable from a ticket number.
 */
export function generateReference(prefix: string): string {
  return `${prefix.toUpperCase().slice(0, 6)}-${randomChars(DIGITS, 6)}`;
}

/** A stable key for a named entity, e.g. a subject called "Maths" → `maths`. */
export function toKey(value: string, maxLength = 60): string {
  return slugify(value, maxLength).replace(/-/g, '_');
}
