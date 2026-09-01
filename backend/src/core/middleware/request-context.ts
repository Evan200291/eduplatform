// ─────────────────────────────────────────────────────────────────────────────
// Request context middleware
// Assigns a request id to every request and echoes it back in the
// `X-Request-Id` header. Blueprint 13: an operator must be able to take one id
// from a support ticket and find every log line and audit row for that request.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
/** Accepts only ids we could have generated, so a client cannot inject log noise. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId =
    candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : crypto.randomUUID();

  req.context = {
    requestId,
    startedAt: Date.now(),
    ipAddress: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  };

  res.setHeader('X-Request-Id', requestId);
  next();
};
