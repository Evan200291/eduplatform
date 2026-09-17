/**
 * Domain enumerations, mirrored from `backend/prisma/schema/*.prisma`.
 *
 * Written as `const` arrays plus derived unions rather than TS `enum`s: the
 * values arrive from the API as plain strings, and the arrays double as the
 * source for dropdowns and filter chips so a new value never needs to be typed
 * out twice.
 */

export const ROLE_KEYS = [
  'PLATFORM_OWNER',
  'PLATFORM_OPS_ADMIN',
  'SCHOOL_ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'CURRICULUM_MANAGER',
  'CONTENT_REVIEWER',
  'BILLING_ADMIN',
  'SUPPORT_AGENT',
  'REPORT_VIEWER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** The two roles that carry platform-wide authority, not scoped to any one school. */
export const PLATFORM_ROLE_KEYS = ['PLATFORM_OWNER', 'PLATFORM_OPS_ADMIN'] as const;

/**
 * Roles it makes sense to hand out from a school-scoped screen (creating a
 * user, inviting staff, granting an extra role from a user's detail page).
 * Excludes `PLATFORM_OWNER` and `PLATFORM_OPS_ADMIN` — those two admin
 * panel routes sit inside `RequireSchoolContext` and act on one school at a
 * time, so offering a platform-wide role there would let a school-scoped
 * action hand out platform-wide access.
 */
export const SCHOOL_ROLE_KEYS = ROLE_KEYS.filter(
  (role) => !(PLATFORM_ROLE_KEYS as readonly string[]).includes(role),
) as Exclude<RoleKey, (typeof PLATFORM_ROLE_KEYS)[number]>[];

export const ROLE_SCOPE_TYPES = [
  'PLATFORM',
  'ORGANIZATION',
  'SCHOOL',
  'GRADE',
  'CLASS',
  'SUBJECT',
] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Age mode drives typography, density and radius from one token set rather than
 * swapping stylesheets. Ordered youngest to oldest — the order is meaningful for
 * pickers and for the `atLeast` style comparisons in `@/theme/age-mode`.
 */
export const AGE_MODES = [
  'EARLY_YEARS',
  'PRIMARY',
  'LOWER_SECONDARY',
  'UPPER_SECONDARY',
  'ADULT',
] as const;
export type AgeMode = (typeof AGE_MODES)[number];

export const LOGIN_METHODS = [
  'EMAIL_PASSWORD',
  'USERNAME_PASSWORD',
  'STUDENT_CODE',
  'STUDENT_CODE_PIN',
] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

/** Which of the three route groups a signed-in user lands in. */
export const SURFACES = ['student', 'teacher', 'admin'] as const;
export type Surface = (typeof SURFACES)[number];
