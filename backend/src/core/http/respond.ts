// ─────────────────────────────────────────────────────────────────────────────
// Response envelope
// Every successful API response has the same shape, so the frontend has exactly
// one unwrapping rule:
//
//   { "data": <payload>, "meta": { ... } | undefined }
//
// Errors use the matching shape from ./error-handler.ts:
//
//   { "error": { "code", "message", "issues"?, "details"? } }
// ─────────────────────────────────────────────────────────────────────────────

import type { Response } from 'express';

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface ResponseMeta {
  [key: string]: unknown;
}

/** 200 with a payload. */
export function ok<T>(res: Response, data: T, meta?: ResponseMeta): void {
  res.status(200).json(meta ? { data, meta } : { data });
}

/** 201 with the created record. `location` sets the `Location` header. */
export function created<T>(res: Response, data: T, location?: string): void {
  if (location) res.setHeader('Location', location);
  res.status(201).json({ data });
}

/** 202 for work that has been queued rather than completed. */
export function accepted<T>(res: Response, data: T, meta?: ResponseMeta): void {
  res.status(202).json(meta ? { data, meta } : { data });
}

/** 204 for a successful action with nothing to return. */
export function noContent(res: Response): void {
  res.status(204).end();
}

export function buildPageMeta(page: number, pageSize: number, totalItems: number): PageMeta {
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalItems / pageSize)) : 1;
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
  };
}

/** 200 with a list payload plus pagination metadata. */
export function paginated<T>(
  res: Response,
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
  extraMeta?: ResponseMeta,
): void {
  res.status(200).json({
    data: items,
    meta: { ...buildPageMeta(page, pageSize, totalItems), ...extraMeta },
  });
}
