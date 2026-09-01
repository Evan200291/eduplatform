// ─────────────────────────────────────────────────────────────────────────────
// API router
// One place lists every module mounted under `/api/v1`. A new module is added
// here and nowhere else, which is what keeps the surface reviewable.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { ok } from '../core/http/respond';
import {
  classRouter,
  gradeRouter,
  subjectRouter,
  termRouter,
} from '../modules/academic/academic.routes';
import {
  assessmentAttemptRouter,
  assessmentRouter,
  studentResponseRouter,
  topicEvaluationRouter,
} from '../modules/assessment/assessment.routes';
import {
  learningPathRouter,
  recommendationRouter,
} from '../modules/learning/learning.routes';
import {
  masteryRouter,
  progressRouter,
  teacherAssessmentRouter,
  teacherNoteRouter,
} from '../modules/progress/progress.routes';
import { notificationRouter } from '../modules/notifications/notifications.routes';
import {
  auditRouter,
  consentRouter,
  dataRequestRouter,
  retentionRouter,
} from '../modules/privacy/privacy.routes';
import { assignmentRouter } from '../modules/assignments/assignments.routes';
import { gamificationRouter } from '../modules/gamification/gamification.routes';
import { missionRouter } from '../modules/missions/missions.routes';
import { companionRouter } from '../modules/companion/companion.routes';
import { leaderboardRouter } from '../modules/leaderboard/leaderboard.routes';
import { reportingRouter } from '../modules/reporting/reporting.routes';
import { publicThemeRouter, themeRouter } from '../modules/theme/theme.routes';
import { authRouter } from '../modules/auth/auth.routes';
import {
  activityRouter,
  questionSubResourceRouter,
} from '../modules/content/content.activities.routes';
import {
  contentModerationReviewRouter,
  contentOwnershipRouter,
  contentPublicationRouter,
  contentReportRouter,
} from '../modules/content/content.governance.routes';
import { lessonRouter } from '../modules/content/content.routes';
import { mediaRouter, publicMediaRouter } from '../modules/content/media.routes';
import { curriculumRouter } from '../modules/curriculum/curriculum.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import {
  entitlementRouter,
  subscriptionRouter,
} from '../modules/subscription/subscription.routes';
import { supportRouter } from '../modules/support/support.routes';
import { platformRouter } from '../modules/platform/platform.routes';
import {
  organizationRouterInstance,
  publicTenancyRouter,
  schoolRouterInstance,
} from '../modules/tenancy/tenancy.routes';
import {
  invitationRouterInstance,
  userGroupRouter,
  userRouter,
} from '../modules/users/users.routes';
import { roleRouter } from '../modules/rbac/roles.routes';

const router = Router();

/** Liveness probe. Deliberately does not touch the database. */
router.get('/health', (_req, res) => {
  ok(res, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// ── Unauthenticated ─────────────────────────────────────────────────────────
router.use('/auth', authRouter);
/**
 * Mounted before `/public` so the more specific path wins regardless of what the
 * tenancy router matches. Serves logos and favicons a login screen needs before
 * any token exists.
 */
router.use('/public/media', publicMediaRouter);
/** Branding CSS for the login screen, before any token exists. */
router.use('/public', publicThemeRouter);
router.use('/public', publicTenancyRouter);

// ── Tenancy and identity ────────────────────────────────────────────────────
router.use('/organizations', organizationRouterInstance);
router.use('/schools', schoolRouterInstance);
router.use('/users', userRouter);
router.use('/invitations', invitationRouterInstance);
router.use('/user-groups', userGroupRouter);
/** The role/permission catalogue — read-only, sourced from core/rbac/permissions.ts. */
router.use('/roles', roleRouter);

// ── Role-appropriate home screens (blueprint 03/04/05) ───────────────────────
router.use('/dashboard', dashboardRouter);

// ── Academic structure ──────────────────────────────────────────────────────
router.use('/grades', gradeRouter);
router.use('/terms', termRouter);
router.use('/subjects', subjectRouter);
router.use('/classes', classRouter);

// ── Curriculum and content ──────────────────────────────────────────────────
router.use('/curriculum', curriculumRouter);
router.use('/lessons', lessonRouter);
router.use('/activities', activityRouter);
/** Options and hints hang off a question, not an activity. */
router.use('/questions', questionSubResourceRouter);
router.use('/media', mediaRouter);
router.use('/content-ownership', contentOwnershipRouter);
router.use('/content-publications', contentPublicationRouter);
router.use('/content-reports', contentReportRouter);
router.use('/content-moderation-reviews', contentModerationReviewRouter);

// ── Assessment, evidence and inference ──────────────────────────────────────
router.use('/assessments', assessmentRouter);
router.use('/assessment-attempts', assessmentAttemptRouter);
router.use('/assessment-responses', studentResponseRouter);
router.use('/topic-evaluations', topicEvaluationRouter);

// ── Learning paths and the recommendation queue ─────────────────────────────
router.use('/learning-paths', learningPathRouter);
router.use('/recommendations', recommendationRouter);

// ── Progress, mastery, judgment and notes ───────────────────────────────────
router.use('/progress', progressRouter);
router.use('/mastery', masteryRouter);
router.use('/teacher-assessments', teacherAssessmentRouter);
router.use('/notes', teacherNoteRouter);

// ── Assignments and homework ────────────────────────────────────────────────
router.use('/assignments', assignmentRouter);

// ── Points, badges, streaks and rewards ─────────────────────────────────────
router.use('/gamification', gamificationRouter);

// ── Missions and short-term challenges ──────────────────────────────────────
router.use('/missions', missionRouter);

// ── The learner's companion ─────────────────────────────────────────────────
router.use('/companion', companionRouter);

// ── Leaderboards (off by default, per blueprint 03) ─────────────────────────
router.use('/leaderboards', leaderboardRouter);

// ── Notifications ───────────────────────────────────────────────────────────
router.use('/notifications', notificationRouter);

// ── Reports and exports (every figure travels with its caveats, blueprint 04) ─
router.use('/reports', reportingRouter);

// ── Privacy, data rights, retention and the audit trail (blueprint 05/10) ────
router.use('/data-requests', dataRequestRouter);
router.use('/consent', consentRouter);
router.use('/retention-policies', retentionRouter);
router.use('/audit', auditRouter);

// ── White-label theming (blueprint 07: tokens, not hard-coded values) ────────
router.use('/themes', themeRouter);

// ── Commercial packaging and feature visibility (blueprint 09/06) ────────────
router.use('/subscriptions', subscriptionRouter);
router.use('/entitlements', entitlementRouter);

// ── Support model (blueprint 13: nothing is closed silently) ─────────────────
router.use('/support', supportRouter);

// ── Platform operations, registry and versioning (blueprint 05/06/13/17) ─────
router.use('/platform', platformRouter);

export const apiRouter = router;
