// ─────────────────────────────────────────────────────────────────────────────
// Role catalogue
//
// Read-only. RBAC is declared in code (`core/rbac/permissions.ts`), not the
// database — see the comment there for why. This route exposes that catalogue
// to the frontend so the admin Roles & access screen can show what a role
// actually grants instead of a hand-written blurb, without duplicating the
// list anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import type { RoleKey } from '@prisma/client';

import { ok } from '../../core/http/respond';
import { authenticate } from '../../core/middleware/authenticate';
import { requirePermission, requireSchoolContext } from '../../core/middleware/require-permission';
import { tenantContext } from '../../core/middleware/tenant-context';
import { ROLE_PERMISSIONS } from '../../core/rbac/permissions';

const router = Router();
router.use(authenticate, tenantContext, requireSchoolContext, requirePermission('user.read'));

router.get('/', (_req, res) => {
  const roles = (Object.keys(ROLE_PERMISSIONS) as RoleKey[]).map((role) => ({
    role,
    permissions: ROLE_PERMISSIONS[role],
  }));
  ok(res, roles);
});

export const roleRouter = router;
