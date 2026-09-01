// ─────────────────────────────────────────────────────────────────────────────
// Dashboard request schemas
// The dashboards are reads, so the schemas are small. What they mostly do is
// keep the *scope* of a dashboard explicit: a `classId` narrows a teacher view,
// a `studentId` lets staff preview what a learner sees, and neither is trusted —
// both are checked against the roster in the service.
//
// There is no date range. A dashboard answers "what is true now, and what should
// I do about it"; anything a user wants to slice by period belongs in the
// reporting module, which already has windows, cohorts and exports.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { paginationSchema } from '../../core/http/pagination';
import { boolQuery, idSchema, intQuery } from '../../core/http/validate';
import { SIGNAL_SEVERITIES } from './dashboard.insights';

/**
 * Staff may pass a learner id to see the learner home as that learner sees it —
 * blueprint 04 student monitoring. A learner passing someone else's id is
 * refused by `assertCanViewStudent`, not by this schema.
 */
export const learnerDashboardQuery = z.object({
  studentId: idSchema.optional(),
});

export const teacherDashboardQuery = z.object({
  classId: idSchema.optional(),
  /** How many learners to name on the attention card before "and N more". */
  attentionLimit: intQuery(1, 50, 8),
});

/**
 * The full attention list behind the dashboard card. Paginated, because a school
 * admin covering 600 learners has a longer list than one teacher does.
 */
export const attentionListQuery = paginationSchema.extend({
  classId: idSchema.optional(),
  /** Floor, not an exact match: HIGH returns only HIGH. */
  minSeverity: z.enum(SIGNAL_SEVERITIES).default('MEDIUM'),
  /** Blueprint 04 lists improvement beside difficulty; off by default. */
  includeCelebrations: boolQuery(false),
});

export const schoolDashboardQuery = z.object({
  gradeId: idSchema.optional(),
});

export type LearnerDashboardQuery = z.infer<typeof learnerDashboardQuery>;
export type TeacherDashboardQuery = z.infer<typeof teacherDashboardQuery>;
export type AttentionListQuery = z.infer<typeof attentionListQuery>;
export type SchoolDashboardQuery = z.infer<typeof schoolDashboardQuery>;
