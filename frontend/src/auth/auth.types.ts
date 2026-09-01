import type { AgeMode, LoginMethod, RoleKey, RoleScopeType, UserStatus } from '@/types/enums';

/**
 * Auth wire types, mirrored from `backend/src/modules/auth/`.
 * `ActorProfile` is the single source of identity, tenant and permissions for
 * the whole client — nothing else should model "the current user".
 */

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'PENDING';

export interface OrganizationRef {
  id: string;
  name: string;
  slug: string;
}

export interface SchoolRef {
  id: string;
  name: string;
  slug: string;
  code: string;
  status: TenantStatus;
  defaultAgeMode: AgeMode;
  timezone: string;
  locale: string;
}

export interface RoleAssignment {
  roleKey: RoleKey;
  scopeType: RoleScopeType;
  schoolId: string | null;
  gradeId: string | null;
  classId: string | null;
  subjectId: string | null;
}

export interface ActorProfile {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  email: string | null;
  primaryRole: RoleKey;
  status: UserStatus;
  /** Falls back to the school default server-side; may still be null. */
  ageMode: AgeMode | null;
  locale: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  /** When true the app must route to the change-password screen and nowhere else. */
  mustChangePassword: boolean;
  organization: OrganizationRef | null;
  school: SchoolRef | null;
  roles: RoleAssignment[];
  /** Flat permission strings, sorted. All UI gating reads these. */
  permissions: string[];
  isPlatformStaff: boolean;
}

/** `meta.tenant` on `GET /auth/me`. */
export interface TenantContext {
  organizationId: string | null;
  schoolId: string | null;
  schoolSlug: string | null;
}

/** Body of `POST /auth/login` — one endpoint, discriminated on `method`. */
export type LoginCredentials =
  | { method: Extract<LoginMethod, 'EMAIL_PASSWORD'>; email: string; password: string; schoolSlug?: string }
  | {
      method: Extract<LoginMethod, 'USERNAME_PASSWORD'>;
      username: string;
      password: string;
      /** Required for this method — usernames are only unique within a school. */
      schoolSlug: string;
    }
  | { method: Extract<LoginMethod, 'STUDENT_CODE'>; studentCode: string; schoolSlug?: string }
  | {
      method: Extract<LoginMethod, 'STUDENT_CODE_PIN'>;
      studentCode: string;
      /** 4–8 digits. */
      pin: string;
      schoolSlug?: string;
    };

/** Shared by login, refresh and accept-invitation. */
export interface AuthSessionResponse {
  accessToken: string;
  expiresAt: string;
  user: ActorProfile;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ActiveSession {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}
