// ─────────────────────────────────────────────────────────────────────────────
// Authentication routes
// The refresh token is set as an httpOnly cookie and is never readable by
// JavaScript; the access token is returned in the body and held in memory by the
// SPA. That split is what stops an XSS bug from becoming a persistent session
// takeover.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, type CookieOptions, type Response } from 'express';
import { env } from '../../config/env';
import { asyncHandler } from '../../core/http/async-handler';
import { noContent, ok } from '../../core/http/respond';
import { validate } from '../../core/http/validate';
import {
  authenticate,
  authenticateOptional,
  getContext,
} from '../../core/middleware/authenticate';
import { authRateLimit } from '../../core/middleware/rate-limit';
import { tenantContext } from '../../core/middleware/tenant-context';
import { sessionExpired } from '../../core/http/errors';
import * as authService from './auth.service';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  loginSchema,
  revokeSessionSchema,
} from './auth.validation';

const router = Router();

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: env.cookie.path,
    expires: expiresAt,
  };
}

function issue(res: Response, result: authService.LoginResult): void {
  res.cookie(
    env.cookie.refreshName,
    result.session.refreshToken,
    refreshCookieOptions(result.session.refreshTokenExpiresAt),
  );
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.cookie.refreshName, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: env.cookie.path,
  });
}

router.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body, req.context);
    issue(res, result);
    ok(res, {
      accessToken: result.session.accessToken,
      expiresAt: result.session.accessTokenExpiresAt,
      user: await authService.profileFor(result.actor),
    });
  }),
);

router.post(
  '/refresh',
  authRateLimit,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.cookie.refreshName] as string | undefined;
    if (!token) throw sessionExpired('Please sign in again.');

    const result = await authService.refresh(token, req.context);
    issue(res, result);
    ok(res, {
      accessToken: result.session.accessToken,
      expiresAt: result.session.accessTokenExpiresAt,
      user: await authService.profileFor(result.actor),
    });
  }),
);

router.post(
  '/accept-invitation',
  authRateLimit,
  validate({ body: acceptInvitationSchema }),
  asyncHandler(async (req, res) => {
    const { token, password, firstName, lastName } = req.body;
    const result = await authService.acceptInvitation(
      token,
      password,
      { firstName, lastName },
      req.context,
    );
    issue(res, result);
    ok(res, {
      accessToken: result.session.accessToken,
      expiresAt: result.session.accessTokenExpiresAt,
      user: await authService.profileFor(result.actor),
    });
  }),
);

router.post(
  '/logout',
  authenticateOptional,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[env.cookie.refreshName] as string | undefined;
    // Logout is deliberately tolerant: an expired access token must still be
    // able to clear the cookie rather than trapping the user in a signed-in UI.
    await authService.logout(token, req.actor ? getContext(req) : null);
    clearRefreshCookie(res);
    noContent(res);
  }),
);

router.get(
  '/me',
  authenticate,
  tenantContext,
  asyncHandler(async (req, res) => {
    const context = getContext(req);
    ok(res, await authService.profileFor(context.actor), {
      tenant: context.tenant,
    });
  }),
);

router.post(
  '/change-password',
  authenticate,
  tenantContext,
  authRateLimit,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.changePassword(
      getContext(req),
      req.body.currentPassword,
      req.body.newPassword,
    );
    clearRefreshCookie(res);
    noContent(res);
  }),
);

router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    ok(res, await authService.listOwnSessions(getContext(req).actor));
  }),
);

router.delete(
  '/sessions/:sessionId',
  authenticate,
  tenantContext,
  validate({ params: revokeSessionSchema }),
  asyncHandler(async (req, res) => {
    await authService.revokeOwnSession(getContext(req), req.params.sessionId);
    noContent(res);
  }),
);

export const authRouter = router;
