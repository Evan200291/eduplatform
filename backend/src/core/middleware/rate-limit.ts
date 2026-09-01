// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// Blueprint 10/13: the platform must resist credential stuffing and abusive
// automation. Limits are in-memory, which is correct for the single PM2 process
// this project deploys; scaling to a cluster means swapping the store for Redis
// and nothing else (see docs/DEPLOYMENT.md).
//
// The authenticated limiter keys on the user id rather than the IP, so a whole
// school behind one NAT address is not throttled as if it were one person.
// ─────────────────────────────────────────────────────────────────────────────

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../../config/env';
import { rateLimited } from '../http/errors';

const shared: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next, options) => {
    next(rateLimited(Math.ceil(options.windowMs / 1000)));
  },
};

function actorOrIpKey(req: Request): string {
  return req.actor?.userId ?? req.ip ?? 'unknown';
}

/** Applied to the whole API. Generous; catches runaway clients, not users. */
export const globalRateLimit = rateLimit({
  ...shared,
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.max,
  keyGenerator: actorOrIpKey,
  skip: () => env.isTest,
});

/**
 * Applied to sign-in, refresh and recovery. Deliberately strict, and keyed on IP
 * because an attacker guessing passwords is not authenticated yet.
 */
export const authRateLimit = rateLimit({
  ...shared,
  windowMs: env.rateLimit.windowMs,
  limit: env.rateLimit.authMax,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
});

/** Applied to uploads and export requests, which are expensive per call. */
export const heavyOperationRateLimit = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 20,
  keyGenerator: actorOrIpKey,
  skip: () => env.isTest,
});

/** Applied to endpoints that send email or notifications on a user's behalf. */
export const messagingRateLimit = rateLimit({
  ...shared,
  windowMs: 60_000,
  limit: 30,
  keyGenerator: actorOrIpKey,
  skip: () => env.isTest,
});
