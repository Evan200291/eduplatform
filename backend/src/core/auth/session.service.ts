// ─────────────────────────────────────────────────────────────────────────────
// Session lifecycle
// Blueprint 05: access is tied to an account and a tenant context, and both must
// be revocable. A session row is therefore the authority: deleting or revoking it
// ends access on the next request, regardless of any token the client still holds.
//
// Refresh tokens rotate on every use. Presenting a token that has already been
// rotated is treated as theft and revokes the whole family, which is the standard
// mitigation for a stolen refresh token being replayed.
// ─────────────────────────────────────────────────────────────────────────────

import { RoleScopeType, UserStatus, type LoginMethod, type Session } from '@prisma/client';
import { accountInactive, sessionExpired, unauthenticated } from '../http/errors';
import { logger } from '../logger';
import { prisma } from '../prisma';
import type { ActorRoleScope, AuthenticatedActor } from '../context';
import { permissionsForRoles, type Permission } from '../rbac/permissions';
import {
  ACCESS_TTL_MS,
  REFRESH_TTL_MS,
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from './tokens';

const log = logger.child({ module: 'session' });

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  loginMethod: LoginMethod;
  activeSchoolId: string | null;
  activeOrganizationId: string | null;
  userAgent?: string;
  ipAddress?: string;
}

export async function createSession(input: CreateSessionInput): Promise<IssuedSession> {
  const refresh = createRefreshToken();
  const now = Date.now();
  const refreshTokenExpiresAt = new Date(now + REFRESH_TTL_MS);

  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      refreshTokenHash: refresh.hash,
      loginMethod: input.loginMethod,
      activeSchoolId: input.activeSchoolId,
      activeOrganizationId: input.activeOrganizationId,
      userAgent: input.userAgent?.slice(0, 400),
      ipAddress: input.ipAddress?.slice(0, 64),
      expiresAt: refreshTokenExpiresAt,
    },
    select: { id: true },
  });

  const accessToken = signAccessToken({
    sub: input.userId,
    sid: session.id,
    sch: input.activeSchoolId ?? undefined,
    org: input.activeOrganizationId ?? undefined,
  });

  return {
    sessionId: session.id,
    accessToken,
    refreshToken: refresh.token,
    accessTokenExpiresAt: new Date(now + ACCESS_TTL_MS),
    refreshTokenExpiresAt,
  };
}

/**
 * Exchanges a refresh token for a new pair. The presented token is revoked and
 * linked to its successor so a replay is detectable.
 */
export async function rotateSession(
  presentedToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<IssuedSession> {
  const presentedHash = hashRefreshToken(presentedToken);

  const existing = await prisma.session.findUnique({
    where: { refreshTokenHash: presentedHash },
    select: {
      id: true,
      userId: true,
      loginMethod: true,
      activeSchoolId: true,
      activeOrganizationId: true,
      expiresAt: true,
      revokedAt: true,
      replacedBySessionId: true,
    },
  });

  if (!existing) throw sessionExpired('Please sign in again.');

  if (existing.revokedAt || existing.replacedBySessionId) {
    // A rotated token being presented a second time means the token leaked.
    // Ending every session for the user is the safe response.
    log.warn({ userId: existing.userId, sessionId: existing.id }, 'refresh token reuse detected');
    await revokeAllSessionsForUser(existing.userId, 'refresh token reuse detected');
    throw sessionExpired('Please sign in again.');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.session.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    throw sessionExpired('Your session has expired. Please sign in again.');
  }

  await assertUserActive(existing.userId);

  const issued = await createSession({
    userId: existing.userId,
    loginMethod: existing.loginMethod,
    activeSchoolId: existing.activeSchoolId,
    activeOrganizationId: existing.activeOrganizationId,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  await prisma.session.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      replacedBySessionId: issued.sessionId,
      lastUsedAt: new Date(),
    },
  });

  return issued;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSessionByToken(presentedToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { refreshTokenHash: hashRefreshToken(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string, reason?: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (reason) log.info({ userId, count: result.count, reason }, 'sessions revoked');
  return result.count;
}

export async function listActiveSessions(userId: string): Promise<Session[]> {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
}

/** Removes long-dead session rows. Called by the maintenance job. */
export async function pruneExpiredSessions(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const result = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}

async function assertUserActive(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) throw unauthenticated('That account no longer exists.');
  if (user.status !== UserStatus.ACTIVE) throw accountInactive(user.status);
}

/**
 * Loads the actor for an authenticated request.
 *
 * Permissions are recomputed here on every request rather than being read from
 * the token, so revoking a role takes effect immediately — which is what
 * blueprint 05's "access can be withdrawn" requirement means in practice.
 */
export async function loadActor(userId: string, sessionId: string): Promise<AuthenticatedActor> {
  const now = new Date();

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true },
  });

  if (!session || session.userId !== userId) throw unauthenticated('Please sign in again.');
  if (session.revokedAt) throw sessionExpired('That session has been signed out.');
  if (session.expiresAt.getTime() <= now.getTime()) throw sessionExpired();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      primaryRole: true,
      organizationId: true,
      schoolId: true,
      displayName: true,
      email: true,
      roleAssignments: {
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          roleKey: true,
          scopeType: true,
          organizationId: true,
          schoolId: true,
          gradeId: true,
          classId: true,
          subjectId: true,
        },
      },
    },
  });

  if (!user) throw unauthenticated('That account no longer exists.');
  if (user.status !== UserStatus.ACTIVE) throw accountInactive(user.status);

  const roles: ActorRoleScope[] = user.roleAssignments.map((grant) => ({
    roleKey: grant.roleKey,
    scopeType: grant.scopeType,
    organizationId: grant.organizationId,
    schoolId: grant.schoolId,
    gradeId: grant.gradeId,
    classId: grant.classId,
    subjectId: grant.subjectId,
  }));

  // A user with no live grants keeps their primary role only as a fallback so a
  // mis-seeded account cannot silently escalate; the permission set stays empty
  // unless a grant exists.
  const roleKeys = roles.map((grant) => grant.roleKey);
  const permissions: ReadonlySet<Permission> = permissionsForRoles(roleKeys);

  // Touch the session so idle-timeout reporting and the sessions list are useful.
  void prisma.session
    .update({ where: { id: sessionId }, data: { lastUsedAt: now } })
    .catch((error: unknown) => log.debug({ err: error }, 'session touch failed'));

  return {
    userId: user.id,
    sessionId,
    primaryRole: user.primaryRole,
    organizationId: user.organizationId,
    schoolId: user.schoolId,
    displayName: user.displayName,
    email: user.email,
    roles,
    permissions,
    isPlatformStaff: roles.some((grant) => grant.scopeType === RoleScopeType.PLATFORM),
  };
}
