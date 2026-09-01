// ─────────────────────────────────────────────────────────────────────────────
// Password and PIN hashing
// Argon2id via `@node-rs/argon2`, which ships prebuilt binaries so a bare VPS
// needs no compiler toolchain. Cost parameters come from the environment so a
// larger server can be hardened without a code change.
//
// Blueprint 10: credentials are never stored or logged in a recoverable form.
// ─────────────────────────────────────────────────────────────────────────────

import { hash, verify, Algorithm } from '@node-rs/argon2';
import { env } from '../../config/env';
import { logger } from '../logger';

const log = logger.child({ module: 'password' });

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: env.argon2.memoryCost,
  timeCost: env.argon2.timeCost,
  parallelism: env.argon2.parallelism,
};

export async function hashSecret(plaintext: string): Promise<string> {
  return hash(plaintext, options);
}

/**
 * Verifies a secret against a stored hash. Returns false rather than throwing on
 * a malformed hash so one corrupt row cannot 500 the login endpoint.
 */
export async function verifySecret(storedHash: string | null, plaintext: string): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, plaintext);
  } catch (error) {
    log.warn({ err: error }, 'stored credential hash could not be parsed');
    return false;
  }
}

export interface PasswordPolicyResult {
  ok: boolean
  problems: string[]
}

/**
 * Blueprint 05: staff credentials must meet a minimum standard. Student PINs are
 * checked by `validatePin` instead, because a six-year-old cannot be asked for a
 * symbol and a capital letter.
 */
export function validatePassword(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 10) problems.push('Use at least 10 characters.');
  if (password.length > 200) problems.push('Use fewer than 200 characters.');
  if (!/[a-z]/.test(password)) problems.push('Include a lower-case letter.');
  if (!/[A-Z]/.test(password)) problems.push('Include an upper-case letter.');
  if (!/[0-9]/.test(password)) problems.push('Include a number.');
  if (/^\s|\s$/.test(password)) problems.push('Remove the leading or trailing space.');

  const lowered = password.toLowerCase();
  const banned = ['password', 'midas', 'learning', '12345678', 'qwerty', 'letmein'];
  if (banned.some((entry) => lowered.includes(entry))) {
    problems.push('Avoid common words such as "password".');
  }

  return { ok: problems.length === 0, problems };
}

export function validatePin(pin: string, requiredLength = 4): PasswordPolicyResult {
  const problems: string[] = [];
  if (!/^\d+$/.test(pin)) problems.push('Use digits only.');
  if (pin.length < requiredLength) problems.push(`Use at least ${requiredLength} digits.`);
  if (pin.length > 8) problems.push('Use no more than 8 digits.');
  if (/^(\d)\1+$/.test(pin)) problems.push('Do not repeat the same digit.');
  return { ok: problems.length === 0, problems };
}

/**
 * A deliberate dummy verification, run when a login attempt names an account
 * that does not exist. Without it, a missing account answers measurably faster
 * than a wrong password and the endpoint becomes an account-enumeration oracle.
 */
const DUMMY_HASH_PROMISE = hashSecret('midas-timing-equaliser');

export async function equaliseTiming(plaintext: string): Promise<void> {
  const dummy = await DUMMY_HASH_PROMISE;
  await verifySecret(dummy, plaintext);
}
