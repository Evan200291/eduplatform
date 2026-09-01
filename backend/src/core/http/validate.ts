// ─────────────────────────────────────────────────────────────────────────────
// Request validation
// Every route that accepts input declares a Zod schema. Validation runs before
// the handler, so a handler never sees an unparsed value and never has to
// defensively coerce a query string.
//
// Parsed output replaces the raw input, which is what makes coercion (`"3"` → 3,
// `"true"` → true) safe: the handler reads the typed value, not the string.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import { validationFailed, type FieldIssue } from './errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function toFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Parses `value` or throws a 422 carrying field-level issues. */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationFailed(toFieldIssues(result.error));
  return result.data;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: FieldIssue[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) req.params = result.data as Request['params'];
      else issues.push(...prefix('params', toFieldIssues(result.error)));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) req.query = result.data as Request['query'];
      else issues.push(...prefix('query', toFieldIssues(result.error)));
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else issues.push(...toFieldIssues(result.error));
    }

    if (issues.length > 0) throw validationFailed(issues);
    next();
  };
}

function prefix(scope: string, issues: FieldIssue[]): FieldIssue[] {
  return issues.map((issue) => ({ ...issue, path: `${scope}.${issue.path}` }));
}

// ── Reusable primitives ─────────────────────────────────────────────────────

/** A cuid produced by Prisma's `@default(cuid())`. */
export const idSchema = z
  .string()
  .trim()
  .min(1, 'An id is required.')
  .max(40, 'That id is not valid.')
  .regex(/^[A-Za-z0-9_-]+$/, 'That id is not valid.');

export const idParam = z.object({ id: idSchema });

/** Coerces `"3"` → 3 for query strings, with bounds. */
export const intQuery = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

export const boolQuery = (fallback = false) =>
  z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .default(fallback);

/** ISO date or datetime, normalised to a `Date`. */
export const dateQuery = z.coerce.date();

export const optionalDate = z.coerce.date().optional();

/** Trimmed non-empty string with a length cap. */
export const text = (max: number, min = 1) => z.string().trim().min(min).max(max);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** A `#rgb`, `#rrggbb` or `#rrggbbaa` colour. */
export const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use a hex colour such as #4F46E5.');

/** A stable machine key: lowercase letters, digits, underscore and hyphen. */
export const keySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, numbers, hyphens or underscores.');

export const emailSchema = z.string().trim().toLowerCase().email().max(190);

export const percentSchema = z.coerce.number().int().min(0).max(100);

/** Free-form JSON payload column, bounded so a request cannot store megabytes. */
export const jsonValue = z.unknown().refine(
  (value) => {
    if (value === undefined) return true;
    try {
      return JSON.stringify(value).length <= 64_000;
    } catch {
      return false;
    }
  },
  { message: 'That configuration is too large or not serialisable.' },
);
