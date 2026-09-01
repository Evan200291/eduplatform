import { PERMISSIONS, type ActorProfile, type SchoolRef } from '@/auth';
import type { AgeMode } from '@/types/enums';
import {
  SCHOOL_ADMIN_PERMISSIONS,
  STUDENT_PERMISSIONS,
  TEACHER_PERMISSIONS,
} from './preview-roles';

/**
 * Signed-in users for the dev preview harness.
 *
 * The backend is not always running while the UI is being built, and every screen
 * sits behind `RequireAuth`. These fixtures let the three surfaces be opened and
 * reviewed in a browser without an API, using the same `ActorProfile` shape the
 * real `GET /auth/me` returns — so what you see is what a real user of that role
 * would see, menu gating included.
 *
 * DEV ONLY. `src/dev/` is imported behind an `import.meta.env.DEV` guard in
 * `main.tsx`, so none of it reaches a production bundle. No credential, token or
 * real personal data belongs in this file.
 */

export const PREVIEW_PERSONAS = ['student', 'teacher', 'admin', 'platform'] as const;
export type PreviewPersona = (typeof PREVIEW_PERSONAS)[number];

const SCHOOL: SchoolRef = {
  id: 'preview-school',
  name: 'Northgate Academy',
  slug: 'northgate',
  code: 'NGA',
  status: 'ACTIVE',
  defaultAgeMode: 'LOWER_SECONDARY',
  timezone: 'Europe/London',
  locale: 'en-GB',
};

interface PersonaSeed {
  label: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  primaryRole: ActorProfile['primaryRole'];
  ageMode: AgeMode | null;
  permissions: readonly string[];
  isPlatformStaff: boolean;
}

const SEEDS: Record<PreviewPersona, PersonaSeed> = {
  student: {
    label: 'Student',
    firstName: 'Amara',
    lastName: 'Okafor',
    nickname: 'Amara',
    primaryRole: 'STUDENT',
    ageMode: 'PRIMARY',
    permissions: STUDENT_PERMISSIONS,
    isPlatformStaff: false,
  },
  teacher: {
    label: 'Teacher',
    firstName: 'Priya',
    lastName: 'Raman',
    nickname: null,
    primaryRole: 'TEACHER',
    ageMode: 'ADULT',
    permissions: TEACHER_PERMISSIONS,
    isPlatformStaff: false,
  },
  admin: {
    label: 'School admin',
    firstName: 'Daniel',
    lastName: 'Whitfield',
    nickname: null,
    primaryRole: 'SCHOOL_ADMIN',
    ageMode: 'ADULT',
    permissions: SCHOOL_ADMIN_PERMISSIONS,
    isPlatformStaff: false,
  },
  platform: {
    label: 'Platform ops',
    firstName: 'Sam',
    lastName: 'Ellery',
    nickname: null,
    primaryRole: 'PLATFORM_OPS_ADMIN',
    ageMode: 'ADULT',
    permissions: PERMISSIONS,
    isPlatformStaff: true,
  },
};

export function isPreviewPersona(value: string | null): value is PreviewPersona {
  return value !== null && (PREVIEW_PERSONAS as readonly string[]).includes(value);
}

export function personaLabel(persona: PreviewPersona): string {
  return SEEDS[persona].label;
}

export function previewProfile(persona: PreviewPersona): ActorProfile {
  const seed = SEEDS[persona];

  return {
    id: `preview-${persona}`,
    displayName: `${seed.firstName} ${seed.lastName}`,
    firstName: seed.firstName,
    lastName: seed.lastName,
    nickname: seed.nickname,
    email: seed.isPlatformStaff ? 'ops@midas.example' : `${persona}@northgate.example`,
    primaryRole: seed.primaryRole,
    status: 'ACTIVE',
    ageMode: seed.ageMode,
    locale: 'en-GB',
    timezone: 'Europe/London',
    avatarUrl: null,
    mustChangePassword: false,
    organization: { id: 'preview-org', name: 'Northgate Trust', slug: 'northgate-trust' },
    school: seed.isPlatformStaff ? null : SCHOOL,
    roles: [
      {
        roleKey: seed.primaryRole,
        scopeType: seed.isPlatformStaff ? 'PLATFORM' : 'SCHOOL',
        schoolId: seed.isPlatformStaff ? null : SCHOOL.id,
        gradeId: null,
        classId: null,
        subjectId: null,
      },
    ],
    permissions: [...seed.permissions].sort(),
    isPlatformStaff: seed.isPlatformStaff,
  };
}
