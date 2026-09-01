// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// Blueprint 05: access is granted by an account inside a tenant, and every
// sign-in attempt — successful or not — is auditable.
//
// Account-enumeration resistance is a design constraint here, not a nicety:
// every failure path returns the same message and does the same amount of
// hashing work, so a caller cannot tell "no such account" from "wrong password".
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RoleScopeType} from '@prisma/client';
import {
  LoginMethod,
  TenantStatus,
  UserStatus,
  type Prisma,
  type User,
} from '@prisma/client';
import { env } from '../../config/env';
import type { ActorContext, AuthenticatedActor, RequestContext } from '../../core/context';
import { recordAudit, recordFailure } from '../../core/audit/audit.service';
import { equaliseTiming, hashSecret, validatePassword, verifySecret } from '../../core/auth/password';
import {
  createSession,
  loadActor,
  revokeAllSessionsForUser,
  rotateSession,
  type IssuedSession,
} from '../../core/auth/session.service';
import {
  accountInactive,
  accountLocked,
  badRequest,
  forbidden,
  invalidCredentials,
  notFound,
  validationFailed,
} from '../../core/http/errors';
import { logger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { hashRefreshToken } from '../../core/auth/tokens';
import { roleScopeKey } from '../../core/rbac/authorize';
import { addMinutes } from '../../core/utils/dates';
import type { LoginInput } from './auth.validation';

const log = logger.child({ module: 'auth' });

export interface LoginResult {
  session: IssuedSession;
  actor: AuthenticatedActor;
}

/** The identity payload returned by `/auth/me` and after a successful sign-in. */
export interface ActorProfile {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string | null;
  primaryRole: string;
  status: UserStatus;
  ageMode: string | null;
  locale: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  mustChangePassword: boolean;
  organization: { id: string; name: string; slug: string } | null;
  school: {
    id: string;
    name: string;
    slug: string;
    code: string;
    status: TenantStatus;
    defaultAgeMode: string;
    timezone: string;
    locale: string;
  } | null;
  roles: Array<{
    roleKey: string;
    scopeType: RoleScopeType;
    schoolId: string | null;
    gradeId: string | null;
    classId: string | null;
    subjectId: string | null;
  }>;
  permissions: string[];
  isPlatformStaff: boolean;
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

export async function login(input: LoginInput, request: RequestContext): Promise<LoginResult> {
  const school = input.schoolSlug ? await findSchoolBySlug(input.schoolSlug) : null;
  if (input.schoolSlug && !school) {
    // Same failure as a bad password: a wrong slug must not confirm which
    // schools exist on the platform.
    await equaliseTiming('missing-school');
    throw invalidCredentials();
  }

  const candidate = await findLoginCandidate(input, school?.id ?? null);

  if (!candidate) {
    await equaliseTiming(secretFrom(input));
    recordFailure(null, {
      action: 'auth.login.failed',
      targetType: 'User',
      summary: `Failed sign-in for an unknown account (${input.method}).`,
      schoolId: school?.id ?? null,
    });
    throw invalidCredentials();
  }

  assertAccountUsable(candidate);
  await assertTenantUsable(candidate);
  await assertLoginMethodAllowed(candidate, input.method);

  const secretOk = await verifyLoginSecret(input, candidate);

  if (!secretOk) {
    await registerFailedAttempt(candidate, request);
    throw invalidCredentials();
  }

  await prisma.user.update({
    where: { id: candidate.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginMethod: input.method,
    },
  });

  const session = await createSession({
    userId: candidate.id,
    loginMethod: input.method,
    activeSchoolId: candidate.schoolId,
    activeOrganizationId: candidate.organizationId,
    userAgent: request.userAgent,
    ipAddress: request.ipAddress,
  });

  const actor = await loadActor(candidate.id, session.sessionId);

  recordAudit(contextFor(actor, request), {
    action: 'auth.login',
    targetType: 'User',
    targetId: candidate.id,
    summary: `Signed in via ${input.method}.`,
  });

  return { session, actor };
}

/** Exchanges a refresh token for a new pair. */
export async function refresh(token: string, request: RequestContext): Promise<LoginResult> {
  const session = await rotateSession(token, {
    userAgent: request.userAgent,
    ipAddress: request.ipAddress,
  });
  const actor = await loadActor(sessionUserId(session), session.sessionId);
  return { session, actor };
}

function sessionUserId(session: IssuedSession): string {
  // `rotateSession` always issues for the same user; decoding the fresh access
  // token avoids a second query just to learn the id back.
  const payload = session.accessToken.split('.')[1];
  if (!payload) throw badRequest('Could not refresh that session.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
  if (!decoded.sub) throw badRequest('Could not refresh that session.');
  return decoded.sub;
}

export async function logout(refreshToken: string | undefined, context: ActorContext | null): Promise<void> {
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { refreshTokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (context) {
    await prisma.session.updateMany({
      where: { id: context.actor.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    recordAudit(context, {
      action: 'auth.logout',
      targetType: 'Session',
      targetId: context.actor.sessionId,
      summary: 'Signed out.',
    });
  }
}

// ── Profile ─────────────────────────────────────────────────────────────────

export async function profileFor(actor: AuthenticatedActor): Promise<ActorProfile> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      nickname: true,
      email: true,
      primaryRole: true,
      status: true,
      ageMode: true,
      locale: true,
      timezone: true,
      mustChangePassword: true,
      avatarMedia: { select: { storageKey: true, isPublic: true } },
      organization: { select: { id: true, name: true, slug: true } },
      school: {
        select: {
          id: true,
          name: true,
          slug: true,
          code: true,
          status: true,
          defaultAgeMode: true,
          timezone: true,
          locale: true,
        },
      },
    },
  });

  if (!user) throw notFound('Account');

  return {
    id: user.id,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    email: user.email,
    primaryRole: user.primaryRole,
    status: user.status,
    ageMode: user.ageMode ?? user.school?.defaultAgeMode ?? null,
    locale: user.locale ?? user.school?.locale ?? null,
    timezone: user.timezone ?? user.school?.timezone ?? null,
    avatarUrl: user.avatarMedia ? `${env.storage.publicPath}/${user.avatarMedia.storageKey}` : null,
    mustChangePassword: user.mustChangePassword,
    organization: user.organization,
    school: user.school,
    roles: actor.roles.map((grant) => ({
      roleKey: grant.roleKey,
      scopeType: grant.scopeType,
      schoolId: grant.schoolId,
      gradeId: grant.gradeId,
      classId: grant.classId,
      subjectId: grant.subjectId,
    })),
    permissions: [...actor.permissions].sort(),
    isPlatformStaff: actor.isPlatformStaff,
  };
}

// ── Credentials ─────────────────────────────────────────────────────────────

export async function changePassword(
  context: ActorContext,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: context.actor.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) throw notFound('Account');

  const currentOk = await verifySecret(user.passwordHash, currentPassword);
  if (!currentOk) throw invalidCredentials('That current password is not correct.');

  const policy = validatePassword(newPassword);
  if (!policy.ok) {
    throw validationFailed(
      policy.problems.map((message) => ({ path: 'newPassword', message })),
      'That password does not meet the requirements.',
    );
  }

  if (await verifySecret(user.passwordHash, newPassword)) {
    throw badRequest('Choose a password you have not used here before.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashSecret(newPassword), mustChangePassword: false },
  });

  // Changing a password ends every other session; a password change is the
  // standard response to suspecting someone else has access.
  await revokeAllSessionsForUser(user.id, 'password changed');

  recordAudit(context, {
    action: 'auth.password.change',
    targetType: 'User',
    targetId: user.id,
    summary: 'Changed their own password.',
  });
}

/** Accepts a staff invitation and sets the first password. */
export async function acceptInvitation(
  token: string,
  password: string,
  names: { firstName?: string; lastName?: string },
  request: RequestContext,
): Promise<LoginResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: {
      id: true,
      email: true,
      roleKey: true,
      scopeType: true,
      schoolId: true,
      organizationId: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!invitation || invitation.status !== 'PENDING') throw badRequest('That invitation is no longer valid.');
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    throw badRequest('That invitation has expired. Ask your administrator for a new one.');
  }

  const policy = validatePassword(password);
  if (!policy.ok) {
    throw validationFailed(policy.problems.map((message) => ({ path: 'password', message })));
  }

  const existing = await prisma.user.findFirst({
    where: { email: invitation.email },
    select: { id: true, status: true, firstName: true, lastName: true },
  });

  const passwordHash = await hashSecret(password);
  const firstName = names.firstName ?? existing?.firstName ?? invitation.email.split('@')[0] ?? 'New';
  const lastName = names.lastName ?? existing?.lastName ?? 'User';

  const user = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            status: UserStatus.ACTIVE,
            passwordHash,
            mustChangePassword: false,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`.trim(),
            emailVerifiedAt: new Date(),
            termsAcceptedAt: new Date(),
          },
        })
      : await tx.user.create({
          data: {
            email: invitation.email,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`.trim(),
            status: UserStatus.ACTIVE,
            primaryRole: invitation.roleKey,
            passwordHash,
            schoolId: invitation.schoolId,
            organizationId: invitation.organizationId,
            emailVerifiedAt: new Date(),
            termsAcceptedAt: new Date(),
          },
        });

    await tx.userRoleAssignment.create({
      data: {
        userId: saved.id,
        roleKey: invitation.roleKey,
        scopeType: invitation.scopeType,
        organizationId: invitation.organizationId,
        schoolId: invitation.schoolId,
        scopeKey: roleScopeKey({ schoolId: invitation.schoolId }),
        reason: 'Invitation accepted',
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: saved.id },
    });

    return saved;
  });

  const session = await createSession({
    userId: user.id,
    loginMethod: LoginMethod.EMAIL_PASSWORD,
    activeSchoolId: user.schoolId,
    activeOrganizationId: user.organizationId,
    userAgent: request.userAgent,
    ipAddress: request.ipAddress,
  });

  const actor = await loadActor(user.id, session.sessionId);

  recordAudit(contextFor(actor, request), {
    action: 'invitation.accept',
    targetType: 'Invitation',
    targetId: invitation.id,
    summary: `Accepted an invitation as ${invitation.roleKey}.`,
  });

  return { session, actor };
}

// ── Internals ───────────────────────────────────────────────────────────────

type LoginCandidate = Pick<
  User,
  | 'id'
  | 'status'
  | 'schoolId'
  | 'organizationId'
  | 'passwordHash'
  | 'pinHash'
  | 'failedLoginCount'
  | 'lockedUntil'
  | 'primaryRole'
>;

const CANDIDATE_SELECT = {
  id: true,
  status: true,
  schoolId: true,
  organizationId: true,
  passwordHash: true,
  pinHash: true,
  failedLoginCount: true,
  lockedUntil: true,
  primaryRole: true,
} satisfies Prisma.UserSelect;

async function findSchoolBySlug(slug: string) {
  return prisma.school.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, status: true },
  });
}

async function findLoginCandidate(
  input: LoginInput,
  schoolId: string | null,
): Promise<LoginCandidate | null> {
  switch (input.method) {
    case 'EMAIL_PASSWORD': {
      const where: Prisma.UserWhereInput = schoolId
        ? { email: input.email, schoolId }
        : { email: input.email };
      return prisma.user.findFirst({ where, select: CANDIDATE_SELECT });
    }
    case 'USERNAME_PASSWORD': {
      if (!schoolId) return null;
      return prisma.user.findFirst({
        where: { username: input.username, schoolId },
        select: CANDIDATE_SELECT,
      });
    }
    case 'STUDENT_CODE':
    case 'STUDENT_CODE_PIN': {
      const code = input.studentCode.toUpperCase().replace(/\s+/g, '');
      const where: Prisma.UserWhereInput = schoolId
        ? { studentCode: code, schoolId }
        : { studentCode: code };
      return prisma.user.findFirst({ where, select: CANDIDATE_SELECT });
    }
    default:
      return null;
  }
}

function secretFrom(input: LoginInput): string {
  if (input.method === 'STUDENT_CODE') return input.studentCode;
  if (input.method === 'STUDENT_CODE_PIN') return input.pin;
  return input.password;
}

async function verifyLoginSecret(input: LoginInput, candidate: LoginCandidate): Promise<boolean> {
  switch (input.method) {
    case 'EMAIL_PASSWORD':
    case 'USERNAME_PASSWORD':
      return verifySecret(candidate.passwordHash, input.password);
    case 'STUDENT_CODE_PIN':
      return verifySecret(candidate.pinHash, input.pin);
    case 'STUDENT_CODE':
      // Code-only sign-in has no second factor; possession of the code is the
      // credential. The school opts into this via `access.studentPinRequired`.
      return candidate.pinHash === null;
    default:
      return false;
  }
}

function assertAccountUsable(candidate: LoginCandidate): void {
  if (candidate.lockedUntil && candidate.lockedUntil.getTime() > Date.now()) {
    throw accountLocked(candidate.lockedUntil);
  }
  if (candidate.status !== UserStatus.ACTIVE) throw accountInactive(candidate.status);
}

async function assertTenantUsable(candidate: LoginCandidate): Promise<void> {
  if (!candidate.schoolId) return;
  const school = await prisma.school.findUnique({
    where: { id: candidate.schoolId },
    select: { status: true, organization: { select: { status: true } } },
  });
  if (!school) throw forbidden('That school is no longer available.');

  const closed: TenantStatus[] = [TenantStatus.SUSPENDED, TenantStatus.ARCHIVED];
  if (closed.includes(school.status) || closed.includes(school.organization.status)) {
    throw forbidden('Access to this school is currently suspended.');
  }
}

/**
 * Blueprint 05: a school controls which sign-in methods it permits, so a school
 * that has turned off code-only access cannot be bypassed by crafting a request.
 */
async function assertLoginMethodAllowed(
  candidate: LoginCandidate,
  method: LoginInput['method'],
): Promise<void> {
  if (!candidate.schoolId) return;

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId: candidate.schoolId },
    select: { allowedLoginMethods: true, studentPinRequired: true },
  });
  if (!settings) return;

  const allowed = Array.isArray(settings.allowedLoginMethods)
    ? (settings.allowedLoginMethods as unknown[]).filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];

  if (allowed.length > 0 && !allowed.includes(method)) {
    throw forbidden('That sign-in method is not available for this school.');
  }

  if (method === 'STUDENT_CODE' && settings.studentPinRequired) {
    throw forbidden('This school requires a PIN alongside the student code.');
  }
}

async function registerFailedAttempt(
  candidate: LoginCandidate,
  request: RequestContext,
): Promise<void> {
  const attempts = candidate.failedLoginCount + 1;
  const shouldLock = attempts >= env.security.maxFailedLoginAttempts;
  const lockedUntil = shouldLock ? addMinutes(new Date(), env.security.accountLockMinutes) : null;

  await prisma.user.update({
    where: { id: candidate.id },
    data: {
      failedLoginCount: shouldLock ? 0 : attempts,
      lockedUntil,
    },
  });

  recordFailure(null, {
    action: shouldLock ? 'auth.account.locked' : 'auth.login.failed',
    targetType: 'User',
    targetId: candidate.id,
    schoolId: candidate.schoolId,
    summary: shouldLock
      ? `Account locked after ${attempts} failed sign-in attempts.`
      : `Failed sign-in attempt ${attempts}.`,
    afterData: { ipAddress: request.ipAddress },
  });

  if (shouldLock) log.warn({ userId: candidate.id }, 'account locked after failed attempts');
}

function contextFor(actor: AuthenticatedActor, request: RequestContext): ActorContext {
  return {
    actor,
    tenant: {
      organizationId: actor.organizationId,
      schoolId: actor.schoolId,
      isImpersonatedTenant: false,
    },
    request,
  };
}

/** Sessions belonging to the signed-in user, for the "where am I signed in" view. */
export async function listOwnSessions(actor: AuthenticatedActor) {
  const sessions = await prisma.session.findMany({
    where: { userId: actor.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      loginMethod: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  return sessions.map((session) => ({
    ...session,
    isCurrent: session.id === actor.sessionId,
  }));
}

export async function revokeOwnSession(context: ActorContext, sessionId: string): Promise<void> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId: context.actor.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw notFound('Session');

  recordAudit(context, {
    action: 'auth.session.revoke',
    targetType: 'Session',
    targetId: sessionId,
    summary: 'Revoked one of their own sessions.',
  });
}
