// ─────────────────────────────────────────────────────────────────────────────
// Reporting validation
// Blueprint 04: "Every report must state what the measure is, where it came from,
// and what it does not prove."
//
// That is not a documentation convention here, it is a validation rule.
// `measureNotes` and `limitationNotes` are required on every custom definition, with
// a real minimum length, because "n/a" in a limitations field is worse than an empty
// one — it claims the question was considered. A school that cannot say what its
// report does not prove has not finished designing the report.
//
// `scopeLevel` is a fixed list even though the column is free text, for the same
// reason mission goal types are: a report that validates is a report that can run.
// ─────────────────────────────────────────────────────────────────────────────

import { ReportFormat } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  jsonValue,
  keySchema,
  optionalDate,
  optionalText,
  text,
} from '../../core/http/validate';

/**
 * Standard report keys are dotted (`engagement.activity-summary`) — the shared
 * `keySchema` used for entity keys elsewhere (themes, subjects, ...) rejects
 * dots by design, so it doesn't fit here.
 */
export const reportKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Use lowercase letters, numbers, dots, hyphens or underscores.');

/** The levels a report can be run at. Anything else has no cohort resolver. */
export const SCOPE_LEVELS = [
  'STUDENT',
  'CLASS',
  'GRADE',
  'SUBJECT',
  'SCHOOL',
  'ORGANIZATION',
  'PLATFORM',
] as const;

export type ScopeLevel = (typeof SCOPE_LEVELS)[number];
export const scopeLevelSchema = z.enum(SCOPE_LEVELS);

/**
 * Blueprint 04's honesty fields. Forty characters minimum is not arbitrary: it is
 * about one sentence, and one sentence is the least that can honestly answer "what
 * does this not prove?".
 */
const honestyNote = text(1_000, 40);

const definitionShape = {
  name: text(180, 3),
  description: optionalText(600),
  scopeLevel: scopeLevelSchema,
  /** Which roles this report is written for. A report with no audience has no author. */
  audience: z.array(z.string().min(2).max(40)).min(1).max(12),
  measureNotes: honestyNote,
  limitationNotes: honestyNote,
  /** Where the figures come from, e.g. ["ProgressRecord", "AssignmentAttempt"]. */
  evidenceSources: z.array(z.string().min(2).max(60)).min(1).max(20),
  configuration: jsonValue.optional(),
};

export const createReportDefinitionSchema = z
  .object({ ...definitionShape, key: keySchema })
  .strict();

/**
 * Editing. `key` is absent: a saved report that changes identity breaks every export
 * that cites it, and an export nobody can trace back is exactly the kind of figure
 * blueprint 04 is written against.
 */
export const updateReportDefinitionSchema = z
  .object(definitionShape)
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const reportDefinitionListQuery = listQuerySchema.extend({
  scopeLevel: scopeLevelSchema.optional(),
  /** Platform-provided standard reports as well as the school's own. */
  includeSystem: boolQuery(true),
  activeOnly: boolQuery(true),
});

/**
 * Running a report. The window defaults are applied in the service rather than here,
 * because "the last 30 days" is a reporting decision and belongs next to the code
 * that has to label the window in the output.
 */
export const runReportQuery = z.object({
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  gradeId: idSchema.optional(),
  subjectId: idSchema.optional(),
  from: optionalDate,
  to: optionalDate,
  /** Row ceiling for an interactive run. Exports are not bound by this. */
  limit: z.coerce.number().int().min(1).max(2_000).optional(),
});

export const requestExportSchema = z
  .object({
    definitionId: idSchema.optional(),
    /** A standard report by key, for the common case of exporting one of those. */
    reportKey: reportKeySchema.optional(),
    format: z.nativeEnum(ReportFormat).default(ReportFormat.CSV),
    studentId: idSchema.optional(),
    classId: idSchema.optional(),
    gradeId: idSchema.optional(),
    subjectId: idSchema.optional(),
    from: optionalDate,
    to: optionalDate,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.definitionId && !value.reportKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reportKey'],
        message: 'Name the report to export, either by id or by key.',
      });
    }
  });

export const exportListQuery = listQuerySchema.extend({
  definitionId: idSchema.optional(),
  /** Only the caller's own requests, for the "my exports" screen. */
  mineOnly: boolQuery(false),
  includeExpired: boolQuery(false),
});

export type CreateReportDefinitionInput = z.infer<typeof createReportDefinitionSchema>;
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>;
export type ReportDefinitionListQuery = z.infer<typeof reportDefinitionListQuery>;
export type RunReportQuery = z.infer<typeof runReportQuery>;
export type RequestExportInput = z.infer<typeof requestExportSchema>;
export type ExportListQuery = z.infer<typeof exportListQuery>;
