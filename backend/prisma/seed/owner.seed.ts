// ─────────────────────────────────────────────────────────────────────────────
// Seed — platform owner
// The bootstrap identity. Without it nobody can sign in to create the first
// organization, so this runs on every environment including production.
//
// Two deliberate rules:
//   • The password is written on creation only. Re-seeding an existing platform
//     never resets a credential the owner has since changed — a seed script that
//     silently restores a placeholder password is a back door.
//   • A placeholder password sets `mustChangePassword`, so the first login is
//     forced through a change even if the operator ignored .env.example.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleKey, RoleScopeType, UserStatus } from '@prisma/client';

import { env } from '../../src/config/env';
import { hashSecret } from '../../src/core/auth/password';
import { prisma } from '../../src/core/prisma';
import { roleScopeKey } from '../../src/core/rbac/authorize';
import { log, step } from './helpers';

const PLACEHOLDER = /change-?me|replace-with|password123/i;

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? 'Platform', lastName: 'Owner' };
  return { firstName: parts[0] as string, lastName: parts.slice(1).join(' ') };
}

/** Grants one role at one scope, keyed the same way the API does. */
export async function ensureRoleAssignment(input: {
  userId: string;
  roleKey: RoleKey;
  scopeType: RoleScopeType;
  organizationId?: string | null;
  schoolId?: string | null;
  gradeId?: string | null;
  classId?: string | null;
  subjectId?: string | null;
  reason: string;
}): Promise<void> {
  const scopeKey = roleScopeKey({
    schoolId: input.schoolId,
    gradeId: input.gradeId,
    classId: input.classId,
    subjectId: input.subjectId,
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userRoleScope: {
        userId: input.userId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeKey,
      },
    },
    update: { revokedAt: null, revokedById: null },
    create: {
      userId: input.userId,
      roleKey: input.roleKey,
      scopeType: input.scopeType,
      organizationId: input.organizationId ?? null,
      schoolId: input.schoolId ?? null,
      gradeId: input.gradeId ?? null,
      classId: input.classId ?? null,
      subjectId: input.subjectId ?? null,
      scopeKey,
      reason: input.reason,
    },
  });
}

export async function seedPlatformOwner(now: Date): Promise<string> {
  step('Platform owner');
  const { ownerEmail, ownerName, ownerPassword } = env.bootstrap;
  const { firstName, lastName } = splitName(ownerName);

  const existing = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });

  let ownerId: string;
  if (existing) {
    ownerId = existing.id;
    await prisma.user.update({
      where: { id: ownerId },
      data: { status: UserStatus.ACTIVE, primaryRole: RoleKey.PLATFORM_OWNER, suspendedAt: null },
    });
    log(`${ownerEmail} already exists — password left untouched`);
  } else {
    const created = await prisma.user.create({
      data: {
        organizationId: null,
        schoolId: null,
        status: UserStatus.ACTIVE,
        primaryRole: RoleKey.PLATFORM_OWNER,
        email: ownerEmail,
        firstName,
        lastName,
        displayName: ownerName,
        passwordHash: await hashSecret(ownerPassword),
        mustChangePassword: PLACEHOLDER.test(ownerPassword),
        emailVerifiedAt: now,
        termsAcceptedAt: now,
      },
      select: { id: true },
    });
    ownerId = created.id;
    log(`created ${ownerEmail}`);
    if (PLACEHOLDER.test(ownerPassword)) {
      log('BOOTSTRAP_OWNER_PASSWORD is a placeholder — a change is forced at first login');
    }
  }

  await ensureRoleAssignment({
    userId: ownerId,
    roleKey: RoleKey.PLATFORM_OWNER,
    scopeType: RoleScopeType.PLATFORM,
    reason: 'Bootstrap platform owner created by the seed.',
  });

  return ownerId;
}
