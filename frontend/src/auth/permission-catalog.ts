/**
 * The permission catalogue, mirrored verbatim from
 * `backend/src/core/rbac/permissions.ts`.
 *
 * Kept as a typed list rather than loose strings so a mistyped permission is a
 * build error instead of a silently hidden button. It is a flat data file: when
 * the backend adds a key, add the same line here in the same section.
 *
 * This is the *catalogue* of what can be granted — never a claim about what the
 * current user holds. Read that from `profile.permissions` via `PermissionSet`.
 */
export const PERMISSIONS = [
  // Platform administration
  'platform.overview.read',
  'platform.settings.read',
  'platform.settings.write',
  'platform.features.read',
  'platform.features.write',
  'platform.releases.read',
  'platform.releases.write',
  'platform.incidents.read',
  'platform.incidents.write',
  'platform.jobs.read',
  'platform.impersonate.tenant',

  // Tenancy
  'organization.read',
  'organization.create',
  'organization.update',
  'organization.archive',
  'school.read',
  'school.create',
  'school.update',
  'school.archive',
  'school.settings.read',
  'school.settings.write',

  // Commercial
  'subscription.read',
  'subscription.write',
  'entitlement.read',
  'entitlement.write',

  // Branding
  'theme.read',
  'theme.write',
  'theme.publish',
  // Identity and access
  'user.read',
  'user.create',
  'user.update',
  'user.suspend',
  'user.archive',
  'user.credentials.reset',
  'role.assign',
  'role.revoke',
  'invitation.read',
  'invitation.create',
  'invitation.revoke',
  'usergroup.read',
  'usergroup.write',
  'session.revoke',

  // Academic structure
  'grade.read',
  'grade.write',
  'class.read',
  'class.write',
  'class.roster.write',
  'subject.read',
  'subject.write',
  'term.read',
  'term.write',

  // Curriculum and content
  'curriculum.read',
  'curriculum.write',
  'lesson.read',
  'lesson.write',
  'activity.read',
  'activity.write',
  'content.review',
  'content.publish',
  'content.archive',
  'content.ownership.read',
  'content.ownership.write',
  'media.read',
  'media.upload',
  'media.moderate',
  'media.delete',
  'content.report.create',
  'content.report.review',
  // Assessment
  'assessment.read',
  'assessment.write',
  'assessment.publish',
  'assessment.attempt.start',
  'assessment.attempt.read',
  'assessment.response.override',

  // Learning paths and recommendations
  'learningpath.read',
  'learningpath.write',
  'learningpath.approve',
  'recommendation.read',
  'recommendation.decide',

  // Progress, mastery and teacher judgment
  'progress.read.own',
  'progress.read.scoped',
  'progress.read.school',
  'mastery.read',
  'mastery.override',
  'teacherassessment.write',
  'note.read',
  'note.write',
  'note.read.sensitive',
  'note.escalate',

  // Assignments and homework
  'assignment.read',
  'assignment.write',
  'assignment.submit',
  'assignment.grade',
  'assignment.excuse',
  // Gamification
  'gamification.read',
  'gamification.config',
  'points.read',
  'points.award',
  'points.adjust',
  'badge.read',
  'badge.write',
  'badge.award',
  'reward.read',
  'reward.write',
  'reward.redeem',
  'mission.read',
  'mission.write',
  'companion.read',
  'companion.interact',
  'companion.config',
  'leaderboard.read',
  'leaderboard.config',

  // Notifications
  'notification.read',
  'notification.send',
  'notification.broadcast',
  'notification.preference.write',

  // Reporting
  'report.read.own',
  'report.read.scoped',
  'report.read.school',
  'report.read.organization',
  'report.read.platform',
  'report.export',
  'report.definition.write',
  // Support
  'support.create',
  'support.read.own',
  'support.read.all',
  'support.respond',
  'support.assign',

  // Audit, privacy and compliance
  'audit.read.school',
  'audit.read.platform',
  'datarequest.read',
  'datarequest.write',
  'consent.read',
  'consent.write',
  'retention.read',
  'retention.write',

  // Learner self-service
  'self.profile.read',
  'self.profile.update',
  'self.learning.participate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);
