import { apiDelete, apiGetWithMeta, apiPost, session } from '@/api';
import type {
  AcceptInvitationInput,
  ActiveSession,
  ActorProfile,
  AuthSessionResponse,
  ChangePasswordInput,
  LoginCredentials,
  TenantContext,
} from './auth.types';

/**
 * Auth endpoint bindings. Each function does one call and stores the access
 * token where required; state lives in `auth.store.ts`, not here.
 *
 * Note there is deliberately no self-serve password reset — school admins reset
 * credentials via `POST /users/:id/credentials`.
 */

export async function login(credentials: LoginCredentials): Promise<AuthSessionResponse> {
  const result = await apiPost<AuthSessionResponse>('/auth/login', credentials);
  session.setAccessToken(result.accessToken, result.expiresAt);
  return result;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<AuthSessionResponse> {
  const result = await apiPost<AuthSessionResponse>('/auth/accept-invitation', input);
  session.setAccessToken(result.accessToken, result.expiresAt);
  return result;
}

/** Tolerates an already-expired token so a user is never trapped in a signed-in UI. */
export async function logout(): Promise<void> {
  try {
    await apiPost<void>('/auth/logout');
  } finally {
    session.end('signed-out');
  }
}

export async function fetchProfile(): Promise<{
  profile: ActorProfile;
  tenant: TenantContext | null;
}> {
  const { data, meta } = await apiGetWithMeta<ActorProfile, { tenant: TenantContext }>('/auth/me');
  return { profile: data, tenant: meta?.tenant ?? null };
}

/** Succeeds with 204 and clears the refresh cookie, so the user must sign in again. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await apiPost<void>('/auth/change-password', input);
  session.end('signed-out');
}

export async function listSessions(): Promise<ActiveSession[]> {
  const { data } = await apiGetWithMeta<ActiveSession[], never>('/auth/sessions');
  return data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await apiDelete(`/auth/sessions/${sessionId}`);
}
