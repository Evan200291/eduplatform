// ─────────────────────────────────────────────────────────────────────────────
// Authentication request schemas
// Blueprint 05 login methods: email + password and username + password for
// staff, student code (with or without a PIN) for learners.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { emailSchema, idSchema, text } from '../../core/http/validate';

/**
 * A single login endpoint accepts every method, discriminated by `method`, so
 * the client has one code path and the server has one audited entry point.
 */
export const loginSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('EMAIL_PASSWORD'),
    email: emailSchema,
    password: text(200),
    /** Optional school slug, used when one email exists in several tenants. */
    schoolSlug: z.string().trim().max(80).optional(),
  }),
  z.object({
    method: z.literal('USERNAME_PASSWORD'),
    username: text(80),
    password: text(200),
    schoolSlug: z.string().trim().max(80),
  }),
  z.object({
    method: z.literal('STUDENT_CODE'),
    studentCode: text(32),
    schoolSlug: z.string().trim().max(80).optional(),
  }),
  z.object({
    method: z.literal('STUDENT_CODE_PIN'),
    studentCode: text(32),
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, 'Enter your PIN.'),
    schoolSlug: z.string().trim().max(80).optional(),
  }),
]);

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: text(200),
  newPassword: text(200, 10),
});

export const acceptInvitationSchema = z.object({
  token: text(200),
  password: text(200, 10),
  firstName: text(80).optional(),
  lastName: text(80).optional(),
});

/**
 * Platform staff switching the tenant they are acting inside.
 *
 * There is deliberately no self-serve "forgot password" flow: the platform has
 * no configured mail transport, and blueprint 05 puts credential recovery with
 * the school administrator, who resets it via `POST /users/:id/credentials`.
 */
export const switchTenantSchema = z.object({
  schoolId: idSchema.optional(),
  organizationId: idSchema.optional(),
});

export const revokeSessionSchema = z.object({ sessionId: idSchema });
