// ─────────────────────────────────────────────────────────────────────────────
// Dashboard module barrel
// The dashboard is read-only and splits by audience, so there is no single
// service worth writing. This file exists so an editor (human or AI) can find
// the whole module from one import, and so the module's public surface is
// explicit: four functions, no writes.
//
//   dashboard.insights.ts         pure interpretation rules, no database
//   dashboard.signals.service.ts  grouped reads shared by every staff view
//   dashboard.learner.service.ts  blueprint 03 Home
//   dashboard.teacher.service.ts  blueprint 04 Teacher dashboard + attention list
//   dashboard.school.service.ts   blueprint 05 Overview
// ─────────────────────────────────────────────────────────────────────────────

export { learnerDashboard } from './dashboard.learner.service';
export type { LearnerDashboard } from './dashboard.learner.service';
export { attentionList, teacherDashboard } from './dashboard.teacher.service';
export type { AttentionEntry, AttentionListResult, TeacherDashboard } from './dashboard.teacher.service';
export { schoolDashboard } from './dashboard.school.service';
export type { SchoolDashboard } from './dashboard.school.service';
export {
  engagementBuckets,
  gatherSignalInputs,
  rankedSignalRows,
  scopedStudentIds,
  MAX_SIGNAL_STUDENTS,
} from './dashboard.signals.service';
export type { StudentSignalRow } from './dashboard.signals.service';
