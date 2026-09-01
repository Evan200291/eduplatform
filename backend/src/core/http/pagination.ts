// ─────────────────────────────────────────────────────────────────────────────
// Pagination and list query helpers
// Every list endpoint is paginated. An unbounded list over learner data is both
// a performance problem and, per blueprint 10, an unnecessary disclosure — so the
// page size is capped here rather than trusted from the client.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export interface SkipTake {
  skip: number;
  take: number;
}

export function toSkipTake(query: PaginationQuery): SkipTake {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** `?sort=name&order=asc` with an allow-list, so a client cannot sort on anything. */
export function sortSchema<T extends string>(allowed: readonly T[], fallback: T) {
  return z.object({
    sort: z
      .enum(allowed as unknown as [T, ...T[]])
      .default(fallback),
    order: z.enum(['asc', 'desc']).default('asc'),
  });
}

/** Builds a Prisma `orderBy` from a validated sort query. */
export function toOrderBy<T extends string>(sort: T, order: 'asc' | 'desc'): Record<T, 'asc' | 'desc'> {
  return { [sort]: order } as Record<T, 'asc' | 'desc'>;
}

/** `?search=` term, trimmed and length-capped for a MySQL `contains` filter. */
export const searchSchema = z.object({
  search: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

/** Common list query: pagination plus search. */
export const listQuerySchema = paginationSchema.merge(searchSchema);

export type ListQuery = z.infer<typeof listQuerySchema>;
