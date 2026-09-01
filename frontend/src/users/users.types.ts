import type { ListQuery } from '@/api/types';

/** Mirrors `backend/src/modules/users` — users, roles, invitations, groups. */

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  nickname: string | null;
  email: string | null;
  username: string | null;
  studentCode: string | null;
  primaryRole: string;
  status: string;
  ageMode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  avatarMedia: { storageKey: string; altText: string | null } | null;
  studentProfile?: {
    currentGradeId: string | null;
    onboardingCompletedAt: string | null;
    currentGrade: { id: string; name: string; level: number } | null;
  } | null;
  classMemberships?: Array<{ class: { id: string; name: string; code: string } }>;
}

export interface RoleAssignmentRow {
  id: string;
  roleKey: string;
  scopeType: string;
  schoolId: string | null;
  gradeId: string | null;
  classId: string | null;
  subjectId: string | null;
  grantedAt: string;
  expiresAt: string | null;
  reason: string | null;
}

export interface UserDetail extends UserSummary {
  dateOfBirth: string | null;
  locale: string | null;
  timezone: string | null;
  mustChangePassword: boolean;
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  lockedUntil: string | null;
  roleAssignments: RoleAssignmentRow[];
  classTeachers: Array<{
    isLead: boolean;
    class: { id: string; name: string; code: string };
    subject: { id: string; name: string };
  }>;
  groupMemberships: Array<{ group: { id: string; name: string; key: string } }>;
}

/** Returned once, at creation or reset. Never retrievable afterwards. */
export interface CreatedCredentials {
  temporaryPassword?: string;
  studentCode?: string;
  pin?: string;
}

export interface UserListQuery extends ListQuery {
  role?: string;
  status?: string;
  classId?: string;
  gradeId?: string;
  groupId?: string;
  sort?: 'displayName' | 'createdAt' | 'lastLoginAt';
  order?: 'asc' | 'desc';
}

export interface InvitationRow {
  id: string;
  email: string;
  roleKey: string;
  scopeType: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  message: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: { id: string; displayName: string } | null;
}

export interface InvitationListQuery extends ListQuery {
  status?: InvitationRow['status'];
}

export interface CreatedInvitation {
  id: string;
  email: string;
  expiresAt: string;
  /** No mail transport — hand this link to the invitee through another channel. */
  invitationUrl: string;
}

export interface UserGroupSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  _count: { members: number; entitlements: number };
}

export interface UserGroupDetail extends UserGroupSummary {
  members: Array<{
    addedAt: string;
    user: { id: string; displayName: string; primaryRole: string; status: string; email: string | null };
  }>;
  entitlements: Array<{ id: string; featureKey: string; enabled: boolean; reason: string | null }>;
}

export interface BulkStudentResult {
  id: string;
  displayName: string;
  studentCode: string;
  pin?: string;
}
