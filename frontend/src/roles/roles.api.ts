import { apiGet } from '@/api';
import type { RolePermissions } from './roles.types';

/** Mirrors `backend/src/modules/rbac/roles.routes.ts` — the read-only role/permission catalogue. */
export function fetchRolePermissions(): Promise<RolePermissions[]> {
  return apiGet<RolePermissions[]>('/roles');
}
