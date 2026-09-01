// ─────────────────────────────────────────────────────────────────────────────
// Permission catalogue and role mapping
// Blueprint 05: "Every role is scoped." Blueprint 06: "Access is denied unless
// explicitly allowed by role and active tenant context."
//
// Permissions are declared here in code — not in the database — for three
// reasons the blueprint asks for: an access decision is reviewable in version
// control, a deploy cannot silently widen access, and a tenant cannot grant
// itself something the platform never defined. Per-tenant *visibility* is a
// separate concern handled by `FeatureEntitlement` (see ../features).
//
// Scope is enforced separately in ./authorize.ts: holding `class.read` does not
// mean "every class", it means "classes inside the scope of the grant".
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey } from '@prisma/client';

export const PERMISSIONS = [
  // ── Platform administration (blueprint 05 platform panel) ─────────────────
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

  // ── Tenancy ───────────────────────────────────────────────────────────────
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

  // ── Commercial (blueprint 09) ─────────────────────────────────────────────
  'subscription.read',
  'subscription.write',
  'entitlement.read',
  'entitlement.write',

  // ── Branding (blueprint 07) ───────────────────────────────────────────────
  'theme.read',
  'theme.write',
  'theme.publish',

  // ── Identity and access (blueprint 05) ────────────────────────────────────
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

  // ── Academic structure ────────────────────────────────────────────────────
  'grade.read',
  'grade.write',
  'class.read',
  'class.write',
  'class.roster.write',
  'subject.read',
  'subject.write',
  'term.read',
  'term.write',

  // ── Curriculum and content (blueprint 05 content lifecycle) ───────────────
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
  /**
   * Soft-delete and restore. Separated from `media.upload` so an author cannot
   * remove an asset that another author's lesson may be relying on.
   */
  'media.delete',
  'content.report.create',
  'content.report.review',

  // ── Assessment (blueprint 03/12) ──────────────────────────────────────────
  'assessment.read',
  'assessment.write',
  'assessment.publish',
  'assessment.attempt.start',
  'assessment.attempt.read',
  'assessment.response.override',

  // ── Learning paths and recommendations (blueprint 03/04) ──────────────────
  'learningpath.read',
  'learningpath.write',
  'learningpath.approve',
  'recommendation.read',
  'recommendation.decide',

  // ── Progress, mastery and teacher judgment (blueprint 04/12) ──────────────
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

  // ── Assignments and homework (blueprint 04) ───────────────────────────────
  'assignment.read',
  'assignment.write',
  'assignment.submit',
  'assignment.grade',
  'assignment.excuse',

  // ── Gamification (blueprint 03) ───────────────────────────────────────────
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

  // ── Notifications (blueprint 06) ──────────────────────────────────────────
  'notification.read',
  'notification.send',
  'notification.broadcast',
  'notification.preference.write',

  // ── Reporting (blueprint 04/14) ───────────────────────────────────────────
  'report.read.own',
  'report.read.scoped',
  'report.read.school',
  'report.read.organization',
  'report.read.platform',
  'report.export',
  'report.definition.write',

  // ── Support (blueprint 13) ────────────────────────────────────────────────
  'support.create',
  'support.read.own',
  'support.read.all',
  'support.respond',
  'support.assign',

  // ── Audit, privacy and compliance (blueprint 05/10) ───────────────────────
  'audit.read.school',
  'audit.read.platform',
  'datarequest.read',
  'datarequest.write',
  'consent.read',
  'consent.write',
  'retention.read',
  'retention.write',

  // ── Learner self-service ──────────────────────────────────────────────────
  'self.profile.read',
  'self.profile.update',
  'self.learning.participate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SET: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value as Permission);
}

// ── Reusable bundles ────────────────────────────────────────────────────────

const SELF_SERVICE: Permission[] = [
  'self.profile.read',
  'self.profile.update',
  'notification.read',
  'notification.preference.write',
  'support.create',
  'support.read.own',
];

/** Blueprint 03: what a learner may do inside the student platform. */
const STUDENT: Permission[] = [
  ...SELF_SERVICE,
  'self.learning.participate',
  'lesson.read',
  'activity.read',
  'curriculum.read',
  'assessment.read',
  'assessment.attempt.start',
  'assessment.attempt.read',
  'learningpath.read',
  'progress.read.own',
  'mastery.read',
  'assignment.read',
  'assignment.submit',
  'gamification.read',
  'points.read',
  'badge.read',
  'reward.read',
  'reward.redeem',
  'mission.read',
  'companion.read',
  'companion.interact',
  'leaderboard.read',
  'report.read.own',
  'media.read',
  'content.report.create',
];

/** Blueprint 04: the teacher portal. The teacher decides; the system proposes. */
const TEACHER: Permission[] = [
  ...SELF_SERVICE,
  'school.read',
  'school.settings.read',
  'grade.read',
  'class.read',
  'subject.read',
  'term.read',
  'user.read',
  'usergroup.read',
  'curriculum.read',
  'lesson.read',
  'activity.read',
  'media.read',
  'media.upload',
  'content.report.create',
  'content.report.review',
  'assessment.read',
  'assessment.attempt.read',
  'assessment.response.override',
  'learningpath.read',
  'learningpath.write',
  'learningpath.approve',
  'recommendation.read',
  'recommendation.decide',
  'progress.read.scoped',
  'mastery.read',
  'mastery.override',
  'teacherassessment.write',
  'note.read',
  'note.write',
  'note.escalate',
  'assignment.read',
  'assignment.write',
  'assignment.grade',
  'assignment.excuse',
  'gamification.read',
  'points.read',
  'points.award',
  'badge.read',
  'badge.award',
  'reward.read',
  'mission.read',
  'mission.write',
  'companion.read',
  'leaderboard.read',
  'notification.send',
  'report.read.scoped',
  'report.export',
  'theme.read',
];

/** Blueprint 05: the school administrator owns their school, not the platform. */
const SCHOOL_ADMIN: Permission[] = [
  ...TEACHER,
  'school.update',
  'school.settings.write',
  'subscription.read',
  'entitlement.read',
  'entitlement.write',
  'theme.write',
  'theme.publish',
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
  'usergroup.write',
  'session.revoke',
  'grade.write',
  'class.write',
  'class.roster.write',
  'subject.write',
  'term.write',
  'curriculum.write',
  'lesson.write',
  'activity.write',
  'content.review',
  'content.publish',
  'content.archive',
  'content.ownership.read',
  'content.ownership.write',
  'media.moderate',
  'media.delete',
  'assessment.write',
  'assessment.publish',
  'note.read.sensitive',
  'gamification.config',
  'points.adjust',
  'badge.write',
  'reward.write',
  'companion.config',
  'leaderboard.config',
  'notification.broadcast',
  'progress.read.school',
  'report.read.school',
  'report.definition.write',
  'audit.read.school',
  'datarequest.read',
  'datarequest.write',
  'consent.read',
  'consent.write',
  'retention.read',
];

/** Blueprint 05: platform operations staff support tenants; they do not own them. */
const PLATFORM_OPS_ADMIN: Permission[] = [
  ...SCHOOL_ADMIN,
  'platform.overview.read',
  'platform.settings.read',
  'platform.features.read',
  'platform.features.write',
  'platform.releases.read',
  'platform.incidents.read',
  'platform.incidents.write',
  'platform.jobs.read',
  'platform.impersonate.tenant',
  'organization.read',
  'organization.create',
  'organization.update',
  'school.create',
  'subscription.write',
  'support.read.all',
  'support.respond',
  'support.assign',
  'report.read.organization',
  'report.read.platform',
  'audit.read.platform',
  'retention.write',
];

/** The platform owner is the only role that can archive a tenant or edit secrets. */
const PLATFORM_OWNER: Permission[] = [...PERMISSIONS];

/** Blueprint 05 future specialist roles. */
const CURRICULUM_MANAGER: Permission[] = [
  ...SELF_SERVICE,
  'school.read',
  'grade.read',
  'subject.read',
  'class.read',
  'curriculum.read',
  'curriculum.write',
  'lesson.read',
  'lesson.write',
  'activity.read',
  'activity.write',
  'assessment.read',
  'assessment.write',
  'assessment.publish',
  'content.review',
  'content.publish',
  'content.archive',
  'content.ownership.read',
  'content.ownership.write',
  'content.report.review',
  'media.read',
  'media.upload',
  'media.moderate',
  'media.delete',
  'report.read.school',
  'report.export',
];

const CONTENT_REVIEWER: Permission[] = [
  ...SELF_SERVICE,
  'school.read',
  'curriculum.read',
  'lesson.read',
  'activity.read',
  'assessment.read',
  'content.review',
  'content.report.review',
  'media.read',
  'media.moderate',
];

const BILLING_ADMIN: Permission[] = [
  ...SELF_SERVICE,
  'organization.read',
  'school.read',
  'subscription.read',
  'subscription.write',
  'entitlement.read',
  'report.read.organization',
  'report.export',
];

const SUPPORT_AGENT: Permission[] = [
  ...SELF_SERVICE,
  'organization.read',
  'school.read',
  'school.settings.read',
  'user.read',
  'class.read',
  'grade.read',
  'subject.read',
  'support.read.all',
  'support.respond',
  'support.assign',
  'platform.incidents.read',
  'platform.jobs.read',
  'audit.read.school',
  'report.read.scoped',
];

const REPORT_VIEWER: Permission[] = [
  ...SELF_SERVICE,
  'school.read',
  'class.read',
  'grade.read',
  'subject.read',
  'progress.read.school',
  'mastery.read',
  'report.read.school',
  'report.export',
];

/** Blueprint 03/04: the parent role is defined but disabled by default. */
const PARENT: Permission[] = [
  ...SELF_SERVICE,
  'progress.read.own',
  'report.read.own',
  'assignment.read',
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  [RoleKey.PLATFORM_OWNER]: dedupe(PLATFORM_OWNER),
  [RoleKey.PLATFORM_OPS_ADMIN]: dedupe(PLATFORM_OPS_ADMIN),
  [RoleKey.SCHOOL_ADMIN]: dedupe(SCHOOL_ADMIN),
  [RoleKey.TEACHER]: dedupe(TEACHER),
  [RoleKey.STUDENT]: dedupe(STUDENT),
  [RoleKey.PARENT]: dedupe(PARENT),
  [RoleKey.CURRICULUM_MANAGER]: dedupe(CURRICULUM_MANAGER),
  [RoleKey.CONTENT_REVIEWER]: dedupe(CONTENT_REVIEWER),
  [RoleKey.BILLING_ADMIN]: dedupe(BILLING_ADMIN),
  [RoleKey.SUPPORT_AGENT]: dedupe(SUPPORT_AGENT),
  [RoleKey.REPORT_VIEWER]: dedupe(REPORT_VIEWER),
};

function dedupe(list: Permission[]): readonly Permission[] {
  return Object.freeze([...new Set(list)]);
}

/** Union of the permissions granted by every role the actor holds. */
export function permissionsForRoles(roleKeys: readonly RoleKey[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const roleKey of roleKeys) {
    for (const permission of ROLE_PERMISSIONS[roleKey] ?? []) result.add(permission);
  }
  return result;
}

/** Roles that may only ever act inside a single school. */
export const SCHOOL_BOUND_ROLES: readonly RoleKey[] = [
  RoleKey.SCHOOL_ADMIN,
  RoleKey.TEACHER,
  RoleKey.STUDENT,
  RoleKey.PARENT,
  RoleKey.CURRICULUM_MANAGER,
  RoleKey.CONTENT_REVIEWER,
  RoleKey.REPORT_VIEWER,
];

export const PLATFORM_ROLES: readonly RoleKey[] = [
  RoleKey.PLATFORM_OWNER,
  RoleKey.PLATFORM_OPS_ADMIN,
  RoleKey.SUPPORT_AGENT,
  RoleKey.BILLING_ADMIN,
];
