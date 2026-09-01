// ─────────────────────────────────────────────────────────────────────────────
// JWT access tokens and opaque refresh tokens
// The access token is short-lived, stateless and carries only ids — never a
// permission list, so revoking a role takes effect on the next request rather
// than when the token expires.
//
// The refresh token is opaque random bytes. Only its SHA-256 hash is stored (in
// `Session.refreshTokenHash`), so a database disclosure does not hand an
// attacker a usable credential.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { sessionExpired, unauthenticated } from '../http/errors';

export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  /** Session id, so a revoked session invalidates its access tokens too. */
  sid: string;
  /** Active school id at the time the token was issued. */
  sch?: string;
  /** Active organization id at the time the token was issued. */
  org?: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: SignOptions = {
    expiresIn: env.jwt.accessTtl as SignOptions['expiresIn'],
    issuer: env.jwt.issuer,
    audience: env.jwt.audience,
    algorithm: 'HS256',
  };
  return jwt.sign(claims, env.jwt.accessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw sessionExpired('Your session has expired.');
    throw unauthenticated('That sign-in token is not valid.');
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
    throw unauthenticated('That sign-in token is not valid.');
  }

  return {
    sub: decoded.sub,
    sid: decoded.sid,
    sch: typeof decoded.sch === 'string' ? decoded.sch : undefined,
    org: typeof decoded.org === 'string' ? decoded.org : undefined,
  };
}

export interface RefreshTokenPair {
  /** Sent to the client in an httpOnly cookie. */
  token: string;
  /** Stored on the session row. */
  hash: string;
}

export function createRefreshToken(): RefreshTokenPair {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Single-use token for invitations and password recovery, hashed at rest. */
export function createOpaqueToken(byteLength = 32): RefreshTokenPair {
  const token = crypto.randomBytes(byteLength).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

/**
 * Parses a `jsonwebtoken`-style duration (`15m`, `30d`) into milliseconds, used
 * to set the session expiry and the cookie `maxAge` from one source of truth.
 */
export function durationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration: ${duration}`);
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return value * (multipliers[unit] ?? 1);
}

export const ACCESS_TTL_MS = durationToMs(env.jwt.accessTtl);
export const REFRESH_TTL_MS = durationToMs(env.jwt.refreshTtl);

/** Extracts a bearer token from an `Authorization` header. */
export function bearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const [scheme, value] = headerValue.split(' ');
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
