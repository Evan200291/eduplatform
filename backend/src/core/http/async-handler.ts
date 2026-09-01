// ─────────────────────────────────────────────────────────────────────────────
// Async route wrapper
// Express 4 does not catch rejected promises from an async handler: the request
// hangs and the process logs an unhandled rejection. Every async route and
// middleware in this codebase is wrapped so a thrown `AppError` always reaches
// the error handler.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Alias used at call sites where the brevity reads better. */
export const ah = asyncHandler;
