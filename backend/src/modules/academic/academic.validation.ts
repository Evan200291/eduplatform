// ─────────────────────────────────────────────────────────────────────────────
// Academic structure request schemas
// Blueprint 02 hierarchy: School → Grade → Class → User, with subjects crossing
// classes. Blueprint 05: "Grade, class and subject structures are
// school-configurable" — so every field an administrator can set is declared
// here rather than being hard-coded anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema, paginationSchema } from '../../core/http/pagination';
import {
  boolQuery,
  hexColor,
  idSchema,
  keySchema,
  optionalText,
  text,
} from '../../core/http/validate';

// ── Grades ──────────────────────────────────────────────────────────────────

export const gradeListQuery = listQuerySchema.extend({
  includeArchived: boolQuery(false),
});

export const createGradeSchema = z.object({
  name: text(120, 2),
  key: keySchema.optional(),
  /** Ordinal used for progression logic, e.g. 3 for Year 3. */
  level: z.coerce.number().int().min(0).max(20),
  typicalAgeFrom: z.coerce.number().int().min(2).max(25).optional(),
  typicalAgeTo: z.coerce.number().int().min(2).max(25).optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateGradeSchema = createGradeSchema.partial();

// ── Academic terms ──────────────────────────────────────────────────────────

export const termListQuery = paginationSchema.extend({
  current: boolQuery(false),
});

export const createTermSchema = z
  .object({
    name: text(120, 2),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isCurrent: z.boolean().default(false),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: 'A term must end after it starts.',
    path: ['endsAt'],
  });

/**
 * Partial updates cannot use `.partial()` on a refined object, so the shape is
 * re-declared and the ordering rule is re-checked in the service against the
 * stored row.
 */
export const updateTermSchema = z
  .object({
    name: text(120, 2).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

// ── Subjects ────────────────────────────────────────────────────────────────

export const subjectListQuery = listQuerySchema.extend({
  includeArchived: boolQuery(false),
  isActive: z.enum(['true', 'false']).optional(),
});

export const createSubjectSchema = z.object({
  name: text(120, 2),
  key: keySchema.optional(),
  description: optionalText(500),
  colorHex: hexColor.optional(),
  iconKey: optionalText(60),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const updateSubjectSchema = createSubjectSchema.partial();

// ── Classes ─────────────────────────────────────────────────────────────────

export const classListQuery = listQuerySchema.extend({
  gradeId: idSchema.optional(),
  academicTermId: idSchema.optional(),
  subjectId: idSchema.optional(),
  teacherId: idSchema.optional(),
  includeArchived: boolQuery(false),
  /** Restricts the result to classes the caller personally teaches. */
  mine: boolQuery(false),
});

export const createClassSchema = z.object({
  gradeId: idSchema,
  academicTermId: idSchema.optional(),
  name: text(120, 2),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens.')
    .optional(),
  description: optionalText(500),
  capacity: z.coerce.number().int().min(1).max(2000).optional(),
  isActive: z.boolean().default(true),
  /** Subjects the class studies, created alongside the class for convenience. */
  subjectIds: z.array(idSchema).max(40).default([]),
});

export const updateClassSchema = createClassSchema.omit({ subjectIds: true }).partial().extend({
  academicTermId: idSchema.nullable().optional(),
});

// ── Class subjects ──────────────────────────────────────────────────────────

export const setClassSubjectsSchema = z.object({
  subjectIds: z.array(idSchema).max(40),
});

export const classSubjectSchema = z.object({
  subjectId: idSchema,
  weeklyMinutes: z.coerce.number().int().min(1).max(3000).optional(),
});

// ── Roster ──────────────────────────────────────────────────────────────────

export const rosterListQuery = paginationSchema.extend({
  includeInactive: boolQuery(false),
});

/** Blueprint 05: roster changes are made in bulk from the admin panel. */
export const rosterAddSchema = z.object({
  userIds: z.array(idSchema).min(1).max(500),
});

export const rosterRemoveSchema = z.object({
  userIds: z.array(idSchema).min(1).max(500),
  /** A soft removal keeps the membership row for historical reporting. */
  hard: z.boolean().default(false),
});

export const assignTeacherSchema = z.object({
  userId: idSchema,
  subjectId: idSchema.optional(),
  isLead: z.boolean().default(false),
});

export const classTeacherParams = z.object({
  id: idSchema,
  teacherId: idSchema,
});

export const classSubjectParams = z.object({
  id: idSchema,
  subjectId: idSchema,
});

export const classUserParams = z.object({
  id: idSchema,
  userId: idSchema,
});

// ── Shared ──────────────────────────────────────────────────────────────────

/** Archive/restore uses a reason so the audit entry explains the change. */
export const archiveSchema = z.object({
  reason: text(400, 3),
});

export type GradeListQuery = z.infer<typeof gradeListQuery>;
export type SubjectListQuery = z.infer<typeof subjectListQuery>;
export type ClassListQuery = z.infer<typeof classListQuery>;
export type TermListQuery = z.infer<typeof termListQuery>;
export type RosterListQuery = z.infer<typeof rosterListQuery>;
