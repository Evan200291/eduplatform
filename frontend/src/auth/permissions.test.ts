import { describe, expect, it } from 'vitest';
import { EMPTY_PERMISSIONS, PermissionSet, accessibleSurfaces, homeSurfaceFor } from './permissions';
import type { ActorProfile } from './auth.types';

/**
 * Client-side permission handling.
 *
 * These guards are not a security boundary — the API re-checks every request —
 * but they decide what a person is shown, and getting them wrong means either
 * offering a door that will not open or hiding one that should. The surface
 * mapping in particular decides where somebody lands after sign-in.
 */

function profile(overrides: Partial<ActorProfile> = {}): ActorProfile {
  return {
    id: 'user_1',
    displayName: 'Test Person',
    primaryRole: 'TEACHER',
    roles: [{ roleKey: 'TEACHER' }],
    permissions: [],
    ...overrides,
  } as ActorProfile;
}

describe('PermissionSet', () => {
  it('answers for a permission it holds and one it does not', () => {
    const set = new PermissionSet(['class.read', 'user.read']);
    expect(set.has('class.read')).toBe(true);
    expect(set.has('school.create')).toBe(false);
  });

  it('hasAny is true when one matches, hasAll only when every one does', () => {
    const set = new PermissionSet(['class.read']);
    expect(set.hasAny(['class.read', 'school.create'])).toBe(true);
    expect(set.hasAll(['class.read', 'school.create'])).toBe(false);
    expect(set.hasAll(['class.read'])).toBe(true);
  });

  it('an empty set grants nothing and hasAll of nothing is vacuously true', () => {
    expect(EMPTY_PERMISSIONS.size).toBe(0);
    expect(EMPTY_PERMISSIONS.has('class.read')).toBe(false);
    expect(EMPTY_PERMISSIONS.hasAny([])).toBe(false);
    // Guards pass an empty `anyOf` to mean "no extra requirement", so this must
    // not accidentally lock a screen nobody restricted.
    expect(EMPTY_PERMISSIONS.hasAll([])).toBe(true);
  });

  it('deduplicates, so a repeated grant does not inflate the count', () => {
    expect(new PermissionSet(['class.read', 'class.read']).size).toBe(1);
  });
});

describe('homeSurfaceFor', () => {
  it('sends each staff role to the surface it works in', () => {
    expect(homeSurfaceFor(profile({ primaryRole: 'PLATFORM_OWNER' }))).toBe('admin');
    expect(homeSurfaceFor(profile({ primaryRole: 'SCHOOL_ADMIN' }))).toBe('admin');
    expect(homeSurfaceFor(profile({ primaryRole: 'TEACHER' }))).toBe('teacher');
    expect(homeSurfaceFor(profile({ primaryRole: 'CURRICULUM_MANAGER' }))).toBe('teacher');
    expect(homeSurfaceFor(profile({ primaryRole: 'STUDENT' }))).toBe('student');
  });

  it('lands a parent on the student surface rather than a fourth app', () => {
    expect(homeSurfaceFor(profile({ primaryRole: 'PARENT' }))).toBe('student');
  });
});

describe('accessibleSurfaces', () => {
  it('puts home first', () => {
    const surfaces = accessibleSurfaces(
      profile({ primaryRole: 'TEACHER', roles: [{ roleKey: 'TEACHER' }] } as Partial<ActorProfile>),
    );
    expect(surfaces[0]).toBe('teacher');
  });

  it('includes a second surface for someone holding two roles', () => {
    const surfaces = accessibleSurfaces(
      profile({
        primaryRole: 'TEACHER',
        roles: [{ roleKey: 'TEACHER' }, { roleKey: 'SCHOOL_ADMIN' }],
      } as Partial<ActorProfile>),
    );
    expect(surfaces).toContain('teacher');
    expect(surfaces).toContain('admin');
  });

  it('does not repeat home when a second role maps to the same surface', () => {
    const surfaces = accessibleSurfaces(
      profile({
        primaryRole: 'TEACHER',
        roles: [{ roleKey: 'TEACHER' }, { roleKey: 'CONTENT_REVIEWER' }],
      } as Partial<ActorProfile>),
    );
    expect(surfaces).toEqual(['teacher']);
  });
});
