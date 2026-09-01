// ─────────────────────────────────────────────────────────────────────────────
// Support request schemas (blueprint 13)
// The shape here is driven by one asymmetry: a requester describes a problem,
// an agent decides what it is. So the create schema accepts a category and a
// suggested priority but nothing about ownership, targets or status — those are
// derived from policy or set by someone holding the support permissions.
//
// `resolutionNote` is required to resolve. The blueprint's sentence is "Nothing
// is closed silently", and an optional note is the same thing as no note.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { SupportCategory, SupportPriority, SupportStatus } from '@prisma/client';
import { listQuerySchema, paginationSchema, sortSchema } from '../../core/http/pagination';
import { idSchema, jsonValue, optionalDate, optionalText, text } from '../../core/http/validate';

// ── Requester side ──────────────────────────────────────────────────────────

export const createSupportRequestSchema = z
  .object({
    category: z.nativeEnum(SupportCategory),
    /** A suggestion. Policy raises it to the category floor if it is too low. */
    priority: z.nativeEnum(SupportPriority).optional(),
    subject: text(200, 4),
    description: text(8000, 20),
    /** The route the requester was on, which halves reproduction time. */
    contextPath: optionalText(300),
    contextData: jsonValue.optional(),
  })
  .strict();

export const supportMessageSchema = z
  .object({
    body: text(8000, 1),
    /**
     * Internal notes are never shown to the requester. Only an agent may set
     * this; the service refuses it from anyone else rather than ignoring it,
     * because a note believed to be private and shown to a school is a breach
     * of trust that a silent downgrade would hide.
     */
    isInternal: z.boolean().optional(),
    attachments: z.array(text(300, 1)).max(10).optional(),
  })
  .strict();

export const satisfactionSchema = z
  .object({
    score: z.coerce.number().int().min(1).max(5),
    comment: optionalText(1000),
  })
  .strict();

// ── Agent side ──────────────────────────────────────────────────────────────

export const triageSchema = z
  .object({
    category: z.nativeEnum(SupportCategory).optional(),
    priority: z.nativeEnum(SupportPriority).optional(),
    /** Re-cutting the clock is a deliberate act, so it is opt-in and audited. */
    recalculateTargets: z.boolean().optional(),
    note: optionalText(1000),
  })
  .strict()
  .refine(
    (value) =>
      value.category !== undefined || value.priority !== undefined || value.note !== undefined,
    { message: 'Provide a category, a priority or a triage note.' },
  );

export const assignSchema = z
  .object({
    /** Null hands the request back to the queue rather than orphaning it. */
    assigneeId: idSchema.nullable(),
    note: optionalText(1000),
  })
  .strict();

export const statusChangeSchema = z
  .object({
    status: z.nativeEnum(SupportStatus),
    note: optionalText(1000),
  })
  .strict();

export const escalateSchema = z
  .object({
    /** Free text: an escalation target is often a rota or a named human. */
    escalateTo: text(32, 2),
    reason: text(1000, 10),
  })
  .strict();

export const resolveSchema = z
  .object({
    resolutionNote: text(4000, 10),
    /** Set when the cause turned out to be a platform defect worth tracking. */
    defectReference: optionalText(80),
    /** Closes in the same step where the outcome needs no confirmation. */
    closeNow: z.boolean().optional(),
  })
  .strict();

export const closeSchema = z
  .object({
    note: optionalText(1000),
  })
  .strict();

// ── Queries ─────────────────────────────────────────────────────────────────

/** Columns a client may sort a support list on. */
export const SUPPORT_SORT_KEYS = [
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'resolutionDueAt',
] as const;

export const supportListQuery = listQuerySchema
  .merge(sortSchema(SUPPORT_SORT_KEYS, 'createdAt'))
  .extend({
    /** Newest first by default: a person opening the list wants today's work. */
    order: z.enum(['asc', 'desc']).default('desc'),
    status: z.nativeEnum(SupportStatus).optional(),
    category: z.nativeEnum(SupportCategory).optional(),
    priority: z.nativeEnum(SupportPriority).optional(),
    assigneeId: idSchema.optional(),
    requesterId: idSchema.optional(),
    schoolId: idSchema.optional(),
    /** Unassigned work, which is the queue an agent actually starts from. */
    unassigned: z.coerce.boolean().optional(),
    /** Requests past a response or resolution target and still owed something. */
    breachedOnly: z.coerce.boolean().optional(),
    openOnly: z.coerce.boolean().optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
  });

export const supportMessageListQuery = paginationSchema.extend({
  /** Ignored for a requester, who can never see internal notes. */
  includeInternal: z.coerce.boolean().optional(),
});
