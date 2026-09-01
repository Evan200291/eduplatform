import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  BulkStudentResult,
  CreatedCredentials,
  CreatedInvitation,
  InvitationListQuery,
  InvitationRow,
  RoleAssignmentRow,
  UserDetail,
  UserGroupDetail,
  UserGroupSummary,
  UserListQuery,
  UserSummary,
} from './users.types';

/** Mirrors `backend/src/modules/users` — users, roles, invitations, groups. */

// ── Users ───────────────────────────────────────────────────────────────────

export function fetchUsers(query?: UserListQuery): Promise<Paginated<UserSummary>> {
  return apiGetPaged<UserSummary>('/users', query);
}
export function fetchUser(id: string): Promise<UserDetail> {
  return apiGet<UserDetail>(`/users/${encodeURIComponent(id)}`);
}
export function createUser(
  input: Record<string, unknown>,
): Promise<{ user: { id: string; displayName: string }; credentials: CreatedCredentials }> {
  return apiPost('/users', input);
}
export function bulkCreateStudents(input: Record<string, unknown>): Promise<BulkStudentResult[]> {
  return apiPost<BulkStudentResult[]>('/users/bulk-students', input);
}
export function updateUser(id: string, input: Record<string, unknown>): Promise<UserSummary> {
  return apiPatch<UserSummary>(`/users/${encodeURIComponent(id)}`, input);
}
export function setUserStatus(id: string, status: string, reason: string): Promise<UserSummary> {
  return apiPost<UserSummary>(`/users/${encodeURIComponent(id)}/status`, { status, reason });
}
/** How a school admin resets a password or PIN — there is no self-serve reset. */
export function resetUserCredentials(
  id: string,
  input: Record<string, unknown>,
): Promise<CreatedCredentials> {
  return apiPost<CreatedCredentials>(`/users/${encodeURIComponent(id)}/credentials`, input);
}

// ── Roles ───────────────────────────────────────────────────────────────────

export function assignRole(
  userId: string,
  input: Record<string, unknown>,
): Promise<RoleAssignmentRow> {
  return apiPost<RoleAssignmentRow>(`/users/${encodeURIComponent(userId)}/roles`, input);
}
export function revokeRole(assignmentId: string, reason: string): Promise<void> {
  return apiDelete(`/users/roles/${encodeURIComponent(assignmentId)}`, { data: { reason } });
}

// ── Invitations ─────────────────────────────────────────────────────────────

export function fetchInvitations(query?: InvitationListQuery): Promise<Paginated<InvitationRow>> {
  return apiGetPaged<InvitationRow>('/invitations', query);
}
export function createInvitation(input: Record<string, unknown>): Promise<CreatedInvitation> {
  return apiPost<CreatedInvitation>('/invitations', input);
}
export function revokeInvitation(id: string): Promise<void> {
  return apiDelete(`/invitations/${encodeURIComponent(id)}`);
}

// ── User groups ─────────────────────────────────────────────────────────────

export function fetchUserGroups(query?: { search?: string }): Promise<Paginated<UserGroupSummary>> {
  return apiGetPaged<UserGroupSummary>('/user-groups', query);
}
export function fetchUserGroup(id: string): Promise<UserGroupDetail> {
  return apiGet<UserGroupDetail>(`/user-groups/${encodeURIComponent(id)}`);
}
export function createUserGroup(input: Record<string, unknown>): Promise<UserGroupSummary> {
  return apiPost<UserGroupSummary>('/user-groups', input);
}
export function updateUserGroup(
  id: string,
  input: Record<string, unknown>,
): Promise<UserGroupSummary> {
  return apiPatch<UserGroupSummary>(`/user-groups/${encodeURIComponent(id)}`, input);
}
export function addGroupMembers(id: string, userIds: string[]): Promise<{ added: number }> {
  return apiPost<{ added: number }>(`/user-groups/${encodeURIComponent(id)}/members`, { userIds });
}
export function removeGroupMembers(id: string, userIds: string[]): Promise<void> {
  return apiDelete(`/user-groups/${encodeURIComponent(id)}/members`, { data: { userIds } });
}

/**
 * The signed-in user's own profile (`PATCH /users/me`, `self.profile.update`).
 *
 * Separate from `updateUser` because it is a different permission and a much
 * narrower field set: a learner may change their own nickname and access
 * preferences, not their role, status or the school they belong to.
 */
export function updateOwnProfile(input: {
  nickname?: string;
  locale?: string;
  timezone?: string;
  fontScale?: number;
  dyslexiaFont?: boolean;
  reduceMotion?: boolean;
  highContrast?: boolean;
  audioSupport?: boolean;
  captionsPreferred?: boolean;
}): Promise<UserSummary> {
  return apiPatch<UserSummary>('/users/me', input);
}
