// ─────────────────────────────────────────────────────────────────────────────
// Storage driver contract
// Uploaded media is addressed by an opaque `storageKey`, never by a URL. The API
// resolves a key to bytes on request, which is what makes blueprint 10's access
// rules enforceable: a learner's work is not retrievable just because someone
// guessed a path.
//
// `local` is the shipped driver. The interface exists so an object-store driver
// can be added later without touching any calling module.
// ─────────────────────────────────────────────────────────────────────────────

import type { Readable } from 'node:stream';

export interface StoredObject {
  /** Opaque key, unique per object, safe to persist. */
  storageKey: string;
  byteSize: number;
  mimeType: string;
  checksumSha256: string;
}

export interface PutObjectInput {
  /** Logical folder, e.g. `schools/<schoolId>/media`. Never client-controlled. */
  prefix: string;
  /** Original file name, used only to derive an extension. */
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface StorageDriver {
  readonly name: string;
  put(input: PutObjectInput): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  stream(storageKey: string): Promise<Readable>;
  exists(storageKey: string): Promise<boolean>;
  remove(storageKey: string): Promise<void>;
  /** Bytes currently stored under a prefix, used for tenant usage reporting. */
  usage(prefix: string): Promise<number>;
}

/** Upload types the platform accepts, grouped to match `MediaKind`. */
export const ALLOWED_MIME_TYPES: Readonly<Record<string, string[]>> = {
  IMAGE: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  AUDIO: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4'],
  VIDEO: ['video/mp4', 'video/webm', 'video/ogg'],
  DOCUMENT: [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  ANIMATION: ['image/gif', 'application/json'],
  ARCHIVE: ['application/zip'],
};

export const ALL_ALLOWED_MIME_TYPES: readonly string[] = Object.values(ALLOWED_MIME_TYPES).flat();

/** Maps a MIME type to the `MediaKind` it should be stored as. */
export function mediaKindForMime(mimeType: string): keyof typeof ALLOWED_MIME_TYPES | null {
  for (const [kind, types] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (types.includes(mimeType)) return kind;
  }
  return null;
}
