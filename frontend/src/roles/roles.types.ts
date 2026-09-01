import type { RoleKey } from '@/types/enums';

/** `GET /roles` — sourced directly from `ROLE_PERMISSIONS` in `backend/src/core/rbac/permissions.ts`. */
export interface RolePermissions {
  role: RoleKey;
  permissions: string[];
}
