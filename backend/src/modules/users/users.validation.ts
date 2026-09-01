// ─────────────────────────────────────────────────────────────────────────────
// User, role, invitation and group request schemas
// Blueprint 05: staff join by invitation; learners are created by the school
// with a code (and PIN) rather than by self-registration.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode, RoleKey, RoleScopeType, UserStatus } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { containsUnsafeLanguage } from '../../core/content-safety/profanity';
import {
  emailSchema,
  idSchema,
  keySchema,
  optionalText,
  text,
} from '../../core/http/validate';

/**
 * Shared nickname field: free text, unmoderated by length alone, but run
 * through a baseline profanity/unsafe-language check since nicknames are
 * shown directly on leaderboards to other children. See
 * core/content-safety/profanity.ts for the scope of that check.
 */
const nicknameSchema = optionalText(60).refine(
  (value) => value === undefined || !containsUnsafeLanguage(value),
  { message: "That nickname isn't allowed — try another." },
);

export const userListQuery = listQuerySchema.extend({
  role: z.nativeEnum(RoleKey).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  classId: idSchema.optional(),
  gradeId: idSchema.optional(),
  groupId: idSchema.optional(),
  sort: z.enum(['displayName', 'createdAt', 'lastLoginAt']).default('displayName'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const baseUser = z.object({
  firstName: text(80),
  lastName: text(80),
  nickname: nicknameSchema,
  email: emailSchema.optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, hyphens or underscores.')
    .optional(),
  dateOfBirth: z.coerce.date().optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  locale: z.string().trim().max(16).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export const createUserSchema = baseUser
  .extend({
    primaryRole: z.nativeEnum(RoleKey),
    /** Optional starting classes for a learner. */
    classIds: z.array(idSchema).max(40).optional(),
    gradeId: idSchema.optional(),
    /** Staff only. When omitted a temporary password is generated. */
    password: text(200, 10).optional(),
    /** Learners only. When omitted a PIN is generated. */
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/)
      .optional(),
    guardianEmail: emailSchema.optional(),
    targetMinutesPerWeek: z.number().int().min(0).max(2000).optional(),
    supportNotes: optionalText(2000),
  })
  .refine(
    (value) =>
      value.primaryRole === RoleKey.STUDENT ? true : Boolean(value.email || value.username),
    { message: 'Staff accounts need an email address or a username.', path: ['email'] },
  );

export const updateUserSchema = baseUser.partial().extend({
  status: z.nativeEnum(UserStatus).optional(),
  avatarMediaId: idSchema.nullable().optional(),
  gradeId: idSchema.nullable().optional(),
  guardianEmail: emailSchema.nullable().optional(),
  targetMinutesPerWeek: z.number().int().min(0).max(2000).optional(),
  supportNotes: optionalText(2000),
  // Blueprint 07 accessibility preferences, editable by staff or the learner.
  fontScale: z.number().int().min(75).max(200).optional(),
  dyslexiaFont: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  audioSupport: z.boolean().optional(),
  captionsPreferred: z.boolean().optional(),
});

/** A learner editing their own profile may change far less than staff can. */
export const updateOwnProfileSchema = z.object({
  nickname: nicknameSchema,
  locale: z.string().trim().max(16).optional(),
  timezone: z.string().trim().max(64).optional(),
  avatarMediaId: idSchema.nullable().optional(),
  fontScale: z.number().int().min(75).max(200).optional(),
  dyslexiaFont: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  audioSupport: z.boolean().optional(),
  captionsPreferred: z.boolean().optional(),
});

export const userStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
  reason: text(400, 3),
});

export const resetCredentialsSchema = z.object({
  /** `password` for staff, `pin` for learners. */
  kind: z.enum(['password', 'pin']),
  reason: text(400, 3),
  /** When omitted the server generates one and returns it once. */
  value: text(200).optional(),
  requireChangeOnNextLogin: z.boolean().default(true),
});

export const assignRoleSchema = z.object({
  roleKey: z.nativeEnum(RoleKey),
  scopeType: z.nativeEnum(RoleScopeType),
  schoolId: idSchema.optional(),
  gradeId: idSchema.optional(),
  classId: idSchema.optional(),
  subjectId: idSchema.optional(),
  expiresAt: z.coerce.date().optional(),
  reason: optionalText(300),
});

export const revokeRoleSchema = z.object({ reason: text(300, 3) });

export const bulkCreateStudentsSchema = z.object({
  classId: idSchema.optional(),
  gradeId: idSchema.optional(),
  students: z
    .array(
      z.object({
        firstName: text(80),
        lastName: text(80),
        nickname: nicknameSchema,
        dateOfBirth: z.coerce.date().optional(),
        guardianEmail: emailSchema.optional(),
      }),
    )
    .min(1)
    .max(300),
});

// ── Invitations ─────────────────────────────────────────────────────────────

export const invitationListQuery = listQuerySchema.extend({
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']).optional(),
});

export const createInvitationSchema = z.object({
  email: emailSchema,
  roleKey: z.nativeEnum(RoleKey),
  scopeType: z.nativeEnum(RoleScopeType).default(RoleScopeType.SCHOOL),
  message: optionalText(500),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

// ── User groups ─────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: text(140, 2),
  key: keySchema.optional(),
  description: optionalText(500),
});

export const updateGroupSchema = createGroupSchema.partial();

export const groupMembersSchema = z.object({
  userIds: z.array(idSchema).min(1).max(500),
});
