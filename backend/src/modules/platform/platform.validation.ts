// ─────────────────────────────────────────────────────────────────────────────
// Platform operations schemas (blueprint 06 / 13 / 17)
// Severity, incident status and job status are VarChar in the schema, so they
// are validated here against the lists in ./platform.constants.ts. A z.enum over
// a const tuple gives the same guarantee a database enum would, without needing
// a migration every time operations renames a severity band.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { EntitlementScopeType, RoleKey, SubscriptionPlan } from '@prisma/client';
import { listQuerySchema, paginationSchema, sortSchema } from '../../core/http/pagination';
import { idSchema, jsonValue, optionalDate, optionalText, text } from '../../core/http/validate';
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, JOB_STATUSES } from './platform.constants';

const severity = z.enum(INCIDENT_SEVERITIES);
const incidentStatus = z.enum(INCIDENT_STATUSES);
const jobStatus = z.enum(JOB_STATUSES);

/**
 * Feature and setting keys are dotted camelCase (`reporting.schoolReports`), so
 * the house `keySchema` — which forbids dots — cannot be reused here.
 */
const dottedKey = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/,
    'Use a dotted key such as support.contactEmail.',
  );

/** Path parameters, since neither a feature key nor a version is a cuid. */
export const featureKeyParam = z.object({ key: dottedKey });
export const settingKeyParam = z.object({ key: dottedKey });
export const versionParam = z.object({
  version: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[0-9A-Za-z][0-9A-Za-z.\-+]*$/, 'That version is not valid.'),
});

// ── Feature definitions (blueprint 06 registry) ─────────────────────────────

/**
 * Only presentation and visibility are editable. Key, default, safety flag,
 * scopes and plan inclusion come from `FEATURE_SPECS` in code, because the
 * resolver reads that file — letting the panel edit them here would let the
 * registry disagree with the engine that enforces it.
 */
export const updateFeatureDefinitionSchema = z
  .object({
    name: optionalText(180),
    description: optionalText(600),
    category: optionalText(60),
    isVisible: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export const featureDefinitionQuery = z.object({
  category: optionalText(60),
  includeHidden: z.coerce.boolean().optional(),
  /** Restricts to keys a given plan includes, for the packaging page. */
  plan: z.nativeEnum(SubscriptionPlan).optional(),
  /** Restricts to keys configurable at a given scope. */
  scope: z.nativeEnum(EntitlementScopeType).optional(),
});

// ── Platform settings ───────────────────────────────────────────────────────

export const settingWriteSchema = z
  .object({
    key: dottedKey,
    value: jsonValue,
    description: optionalText(500),
    /** Marking a value secret is one-way in practice; unmarking needs intent. */
    isSecret: z.boolean().optional(),
  })
  .strict();

export const settingListQuery = z.object({
  /** Unknown keys are surfaced by default so a typo cannot hide in the table. */
  knownOnly: z.coerce.boolean().optional(),
});

// ── Incidents (blueprint 13) ────────────────────────────────────────────────

export const createIncidentSchema = z
  .object({
    title: text(200, 6),
    severity,
    summary: text(6000, 20),
    impactSummary: optionalText(6000),
    /** Blueprint 10: this flag starts the notification clock. */
    dataAffected: z.boolean().optional(),
    detectedAt: z.coerce.date(),
    schoolId: idSchema.optional(),
    ownerUserId: idSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.detectedAt.getTime() > Date.now() + 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['detectedAt'],
        message: 'An incident cannot have been detected in the future.',
      });
    }
  });

export const updateIncidentSchema = z
  .object({
    title: optionalText(200),
    severity: severity.optional(),
    summary: optionalText(6000),
    impactSummary: optionalText(6000),
    dataAffected: z.boolean().optional(),
    ownerUserId: idSchema.nullable().optional(),
    rootCause: optionalText(6000),
    preventiveActions: optionalText(6000),
    mitigatedAt: optionalDate,
    resolvedAt: optionalDate,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export const incidentStatusSchema = z
  .object({
    status: incidentStatus,
    note: optionalText(2000),
  })
  .strict();

export const incidentListQuery = listQuerySchema.extend({
  status: incidentStatus.optional(),
  severity: severity.optional(),
  schoolId: idSchema.optional(),
  dataAffected: z.coerce.boolean().optional(),
  openOnly: z.coerce.boolean().optional(),
  detectedFrom: optionalDate,
  detectedTo: optionalDate,
});

// ── Job runs (blueprint 13) ─────────────────────────────────────────────────

export const jobRunListQuery = paginationSchema.extend({
  jobKey: optionalText(120),
  status: jobStatus.optional(),
  /** Only runs that failed or stalled, which is the view an operator opens. */
  problemsOnly: z.coerce.boolean().optional(),
  startedFrom: optionalDate,
  startedTo: optionalDate,
});

// ── Release notes (blueprint 17) ────────────────────────────────────────────

const changeList = z.array(text(300, 3)).max(60);

export const releaseNoteSchema = z
  .object({
    version: text(40, 1).regex(
      /^[0-9A-Za-z][0-9A-Za-z.\-+]*$/,
      'Use a version like 1.4.0 or 2026.03.1.',
    ),
    title: text(200, 4),
    summary: text(6000, 10),
    changes: z
      .object({
        added: changeList.optional(),
        changed: changeList.optional(),
        fixed: changeList.optional(),
        removed: changeList.optional(),
      })
      .strict()
      .refine((value) => Object.values(value).some((list) => (list?.length ?? 0) > 0), {
        message: 'List at least one change.',
      }),
    /**
     * Blueprint 05: a change that alters how evidence is interpreted must say
     * so, because a teacher comparing this term to last term needs to know.
     */
    affectsEvidenceInterpretation: z.boolean().optional(),
    audience: z.array(z.nativeEnum(RoleKey)).max(11).optional(),
    releasedAt: z.coerce.date(),
    isPublished: z.boolean().optional(),
  })
  .strict();

export const updateReleaseNoteSchema = releaseNoteSchema.partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'Provide at least one field to change.' },
);

export const releaseNoteListQuery = listQuerySchema
  .merge(sortSchema(['releasedAt', 'version', 'createdAt'] as const, 'releasedAt'))
  .extend({
    order: z.enum(['asc', 'desc']).default('desc'),
    publishedOnly: z.coerce.boolean().optional(),
    affectsEvidenceOnly: z.coerce.boolean().optional(),
  });
