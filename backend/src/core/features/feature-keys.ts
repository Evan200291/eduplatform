// ─────────────────────────────────────────────────────────────────────────────
// Feature registry
// Blueprint 06: "Every significant non-core feature must be configurable." This
// file is the catalogue. A key that is not declared here cannot be toggled — the
// resolver rejects it — so the admin panel can never show a switch that does
// nothing, and a tenant cannot invent an entitlement the platform never defined.
//
// `prisma/seed.ts` mirrors this list into `FeatureDefinition` rows so the admin
// UI can render descriptions and scope hints without hard-coding them.
// ─────────────────────────────────────────────────────────────────────────────

import { EntitlementScopeType, SubscriptionPlan } from '@prisma/client';

export interface FeatureSpec {
  key: string;
  name: string;
  description: string;
  category:
    | 'learning'
    | 'assessment'
    | 'gamification'
    | 'communication'
    | 'reporting'
    | 'administration'
    | 'safety'
    | 'commercial';
  /** Applied when no entitlement row matches at any scope. */
  defaultEnabled: boolean;
  /**
   * Blueprint 06: platform safety rules sit above every tenant override. A
   * safety rule can be tightened by a tenant but never loosened.
   */
  isSafetyRule?: boolean;
  configurableScopes: EntitlementScopeType[];
  /** Plans that include the feature at all. Omitted means "every plan". */
  includedInPlans?: SubscriptionPlan[];
  /** Keys that must also be enabled for this feature to function. */
  dependsOn?: string[];
}

const ALL_TENANT_SCOPES: EntitlementScopeType[] = [
  EntitlementScopeType.PLATFORM,
  EntitlementScopeType.PLAN,
  EntitlementScopeType.ORGANIZATION,
  EntitlementScopeType.SCHOOL,
];

const FULL_SCOPES: EntitlementScopeType[] = [
  ...ALL_TENANT_SCOPES,
  EntitlementScopeType.ROLE,
  EntitlementScopeType.GRADE,
  EntitlementScopeType.CLASS,
  EntitlementScopeType.SUBJECT,
  EntitlementScopeType.USER_GROUP,
];

export const FEATURE_SPECS: readonly FeatureSpec[] = [
  // ── Learning (blueprint 03) ───────────────────────────────────────────────
  {
    key: 'learning.lessons',
    name: 'Lessons',
    description: 'Structured teaching content delivered in ordered sections.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'learning.activities',
    name: 'Practice activities',
    description: 'Interactive practice, quizzes and mini-games attached to a topic.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'learning.path',
    name: 'Personal learning path',
    description: 'A sequenced path per learner per subject, generated from evidence.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'learning.path.autoApprove',
    name: 'Auto-approve path changes',
    description:
      'Applies a recommended path change without waiting for a teacher, after a delay. Off by default because the teacher is the decision maker.',
    category: 'learning',
    defaultEnabled: false,
    configurableScopes: [...ALL_TENANT_SCOPES, EntitlementScopeType.GRADE, EntitlementScopeType.CLASS],
    dependsOn: ['learning.path'],
  },
  {
    key: 'learning.selfDirected',
    name: 'Free practice',
    description: 'Lets a learner practise beyond the assigned path.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'learning.hints',
    name: 'Hints and scaffolding',
    description: 'Reveals graded hints during an activity, recorded but not penalised.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },

  // ── Assessment (blueprint 03/12) ──────────────────────────────────────────
  {
    key: 'assessment.screening',
    name: 'Initial screening',
    description: 'Places a new learner using a short adaptive assessment.',
    category: 'assessment',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'assessment.ongoingChecks',
    name: 'Ongoing checks',
    description: 'Periodic short checks that refresh mastery evidence.',
    category: 'assessment',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'assessment.reassessment',
    name: 'Reassessment',
    description: 'Allows a topic to be reassessed after a cooldown.',
    category: 'assessment',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'assessment.studentSelfReassess',
    name: 'Learner-initiated reassessment',
    description: 'Lets a learner request a reassessment themselves.',
    category: 'assessment',
    defaultEnabled: false,
    configurableScopes: FULL_SCOPES,
    dependsOn: ['assessment.reassessment'],
  },
  {
    key: 'assessment.immediateFeedback',
    name: 'Immediate feedback',
    description: 'Shows whether an answer was correct as soon as it is submitted.',
    category: 'assessment',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },

  // ── Gamification (blueprint 03) ───────────────────────────────────────────
  {
    key: 'gamification.points',
    name: 'Points',
    description: 'Awards points for learning activity, recorded in a ledger.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'gamification.badges',
    name: 'Badges',
    description: 'Recognises milestones, effort and improvement.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'gamification.streaks',
    name: 'Streaks',
    description: 'Encourages a learning habit without punishing absence.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'gamification.missions',
    name: 'Missions',
    description: 'Short, achievable goals with a clear reward.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'gamification.companion',
    name: 'Learning companion',
    description: 'A creature that grows as the learner progresses.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'gamification.companion.decay',
    name: 'Companion mood decay',
    description:
      'Lets the companion become sleepy after inactivity. Never changes its stage and is off by default.',
    category: 'gamification',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
    dependsOn: ['gamification.companion'],
  },
  {
    key: 'gamification.rewards',
    name: 'Cosmetic rewards',
    description: 'Unlockable cosmetics. Never gates learning content.',
    category: 'gamification',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
    dependsOn: ['gamification.points'],
  },
  {
    key: 'gamification.leaderboard',
    name: 'Leaderboards',
    description:
      'Comparative standings. Off by default; identity display and ranking basis are configurable.',
    category: 'gamification',
    defaultEnabled: false,
    configurableScopes: FULL_SCOPES,
  },

  // ── Communication (blueprint 06) ──────────────────────────────────────────
  {
    key: 'notifications.inApp',
    name: 'In-app notifications',
    description: 'Delivers notifications inside the product.',
    category: 'communication',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'notifications.email',
    name: 'Email notifications',
    description: 'Sends notifications by email where a channel is configured.',
    category: 'communication',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'notifications.push',
    name: 'Push notifications',
    description: 'Sends device push notifications. Requires a configured provider.',
    category: 'communication',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'notifications.digest',
    name: 'Digests',
    description: 'Collapses low-priority notifications into a periodic summary.',
    category: 'communication',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'communication.teacherBroadcast',
    name: 'Teacher announcements',
    description: 'Lets a teacher send an announcement to a class.',
    category: 'communication',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },

  // ── Teaching workflow (blueprint 04) ──────────────────────────────────────
  {
    key: 'teaching.homework',
    name: 'Homework and assignments',
    description: 'Set, monitor and give feedback on work.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'teaching.notes',
    name: 'Teacher notes',
    description: 'Observation and intervention notes with visibility rules.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'teaching.notes.sensitive',
    name: 'Sensitive notes',
    description:
      'Allows notes marked sensitive or safeguarding, which require stricter permissions and a full audit history.',
    category: 'safety',
    defaultEnabled: true,
    isSafetyRule: true,
    configurableScopes: ALL_TENANT_SCOPES,
    dependsOn: ['teaching.notes'],
  },
  {
    key: 'teaching.masteryOverride',
    name: 'Teacher mastery override',
    description: 'Lets a teacher override an inferred mastery level, with a reason.',
    category: 'learning',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },

  // ── Reporting (blueprint 04/14) ───────────────────────────────────────────
  {
    key: 'reporting.classReports',
    name: 'Class reports',
    description: 'Progress and mastery views for a class.',
    category: 'reporting',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
  {
    key: 'reporting.schoolReports',
    name: 'School reports',
    description: 'School-wide analytics for administrators.',
    category: 'reporting',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
    includedInPlans: [
      SubscriptionPlan.STARTER,
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.ENTERPRISE,
    ],
  },
  {
    key: 'reporting.exports',
    name: 'Report exports',
    description: 'Downloadable CSV/JSON exports of a report.',
    category: 'reporting',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
    includedInPlans: [
      SubscriptionPlan.STARTER,
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.ENTERPRISE,
    ],
  },
  {
    key: 'reporting.customDefinitions',
    name: 'Custom reports',
    description: 'Lets a school save its own report configurations.',
    category: 'reporting',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
    includedInPlans: [SubscriptionPlan.PROFESSIONAL, SubscriptionPlan.ENTERPRISE],
  },

  // ── Administration (blueprint 05) ─────────────────────────────────────────
  {
    key: 'admin.contentAuthoring',
    name: 'School content authoring',
    description: 'Lets a school create and publish its own lessons and activities.',
    category: 'administration',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
    includedInPlans: [SubscriptionPlan.PROFESSIONAL, SubscriptionPlan.ENTERPRISE],
  },
  {
    key: 'admin.branding',
    name: 'Branding and themes',
    description: 'White-label logo, colours and typography.',
    category: 'administration',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'admin.customThemes',
    name: 'Custom theme editor',
    description: 'Full token-level theme editing beyond the basic colour controls.',
    category: 'administration',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
    includedInPlans: [SubscriptionPlan.PROFESSIONAL, SubscriptionPlan.ENTERPRISE],
    dependsOn: ['admin.branding'],
  },
  {
    key: 'admin.bulkImport',
    name: 'Bulk user import',
    description: 'Creates users in bulk from a prepared list.',
    category: 'administration',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'admin.userGroups',
    name: 'User groups',
    description: 'Arbitrary cohorts used to target features and assignments.',
    category: 'administration',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },

  // ── Access and safety (blueprint 05/10) ───────────────────────────────────
  {
    key: 'access.studentCodeLogin',
    name: 'Student code sign-in',
    description: 'Lets learners sign in with a school-issued code instead of an email.',
    category: 'safety',
    defaultEnabled: true,
    configurableScopes: [...ALL_TENANT_SCOPES, EntitlementScopeType.GRADE],
  },
  {
    key: 'access.studentPinRequired',
    name: 'Require a learner PIN',
    description: 'Requires a PIN alongside the student code.',
    category: 'safety',
    defaultEnabled: true,
    isSafetyRule: true,
    configurableScopes: [...ALL_TENANT_SCOPES, EntitlementScopeType.GRADE],
  },
  {
    key: 'safety.contentReporting',
    name: 'Content reporting',
    description: 'Lets learners and staff flag a content problem.',
    category: 'safety',
    defaultEnabled: true,
    isSafetyRule: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'safety.moderationRequired',
    name: 'Moderate uploads',
    description: 'Holds uploaded media for review before it can be used.',
    category: 'safety',
    defaultEnabled: true,
    isSafetyRule: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'safety.studentAvatarUpload',
    name: 'Learner avatar uploads',
    description:
      'Lets learners upload their own avatar image. Off by default; preset avatars are used instead.',
    category: 'safety',
    defaultEnabled: false,
    isSafetyRule: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'safety.parentPortal',
    name: 'Parent access',
    description: 'The planned parent role. Off until the parent experience ships.',
    category: 'safety',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
  },

  // ── Commercial (blueprint 09) ─────────────────────────────────────────────
  {
    key: 'commercial.selfServeBilling',
    name: 'Self-serve billing',
    description: 'Lets a school view and manage its own subscription.',
    category: 'commercial',
    defaultEnabled: false,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'commercial.seatEnforcement',
    name: 'Seat limit enforcement',
    description: 'Blocks new user creation once licensed seats are exhausted.',
    category: 'commercial',
    defaultEnabled: true,
    configurableScopes: ALL_TENANT_SCOPES,
  },
  {
    key: 'support.inAppRequests',
    name: 'In-app support requests',
    description: 'Lets users raise a support request from inside the product.',
    category: 'communication',
    defaultEnabled: true,
    configurableScopes: FULL_SCOPES,
  },
] as const;

export type FeatureKey = (typeof FEATURE_SPECS)[number]['key'];

const SPEC_BY_KEY = new Map<string, FeatureSpec>(
  FEATURE_SPECS.map((spec) => [spec.key, spec]),
);

export function featureSpec(key: string): FeatureSpec | undefined {
  return SPEC_BY_KEY.get(key);
}

export function isKnownFeatureKey(key: string): key is FeatureKey {
  return SPEC_BY_KEY.has(key);
}

export const FEATURE_KEYS: readonly string[] = FEATURE_SPECS.map((spec) => spec.key);
