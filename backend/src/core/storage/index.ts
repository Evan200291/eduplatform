// ─────────────────────────────────────────────────────────────────────────────
// Storage entry point
// Modules import `storage` from here and never construct a driver themselves, so
// switching drivers is a one-line change in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../../config/env';
import { LocalStorageDriver } from './local-driver';
import type { StorageDriver } from './storage.types';

const localDriver = new LocalStorageDriver();

export const storage: StorageDriver = localDriver;

/** Prepares the storage backend. Called once during server startup. */
export async function initStorage(): Promise<void> {
  if (env.storage.driver === 'local') await localDriver.init();
}

/** Tenant-scoped prefixes, so one school's media never mixes with another's. */
export const storagePrefix = {
  schoolMedia: (schoolId: string) => `schools/${schoolId}/media`,
  schoolBranding: (schoolId: string) => `schools/${schoolId}/branding`,
  userAvatar: (schoolId: string | null, userId: string) =>
    schoolId ? `schools/${schoolId}/avatars/${userId}` : `platform/avatars/${userId}`,
  platformMedia: () => 'platform/media',
  reportExport: (schoolId: string | null) =>
    schoolId ? `schools/${schoolId}/exports` : 'platform/exports',
  supportAttachment: (schoolId: string | null) =>
    schoolId ? `schools/${schoolId}/support` : 'platform/support',
  dataRequest: (schoolId: string) => `schools/${schoolId}/data-requests`,
};

export * from './storage.types';
