// ─────────────────────────────────────────────────────────────────────────────
// Media request schemas
// Blueprint 07 accessibility is enforced here, not merely documented: an image
// cannot be stored without alt text, and time-based media (audio, video) cannot
// be stored without a transcript or caption. The rule lives in a function
// because the file's `MediaKind` is only known after multer has parsed the
// upload, so a plain object schema cannot see it.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentOwnership, MediaKind, ModerationDecision } from '@prisma/client';
import { z } from 'zod';
import { validationFailed } from '../../core/http/errors';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, optionalText, text } from '../../core/http/validate';

export const mediaListQuery = listQuerySchema.extend({
  kind: z.nativeEnum(MediaKind).optional(),
  moderationDecision: z.nativeEnum(ModerationDecision).optional(),
  ownership: z.nativeEnum(ContentOwnership).optional(),
  isPublic: boolQuery(false).optional(),
  includeDeleted: boolQuery(false),
  /** Platform library assets have no school; staff can include them. */
  includePlatformLibrary: boolQuery(true),
});

/** Metadata accompanying a multipart upload. Sent as ordinary form fields. */
export const uploadMediaSchema = z.object({
  altText: optionalText(500),
  caption: optionalText(500),
  transcript: optionalText(12_000),
  ownership: z.nativeEnum(ContentOwnership).default(ContentOwnership.SCHOOL_OWNED),
  licenseNote: optionalText(500),
  attribution: optionalText(300),
  /** Logos and favicons are served without an auth check; default is private. */
  isPublic: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .default(false),
});

export const updateMediaSchema = z.object({
  fileName: text(255, 1).optional(),
  altText: optionalText(500),
  caption: optionalText(500),
  transcript: optionalText(12_000),
  ownership: z.nativeEnum(ContentOwnership).optional(),
  licenseNote: optionalText(500),
  attribution: optionalText(300),
  isPublic: z.boolean().optional(),
});

export const moderateMediaSchema = z.object({
  decision: z.nativeEnum(ModerationDecision),
  notes: optionalText(4000),
});

export const mediaAccessParams = z.object({ id: idSchema });

/**
 * Blueprint 07: accessibility is a storage precondition, so a school cannot
 * accumulate a library of unusable assets. Throws a 422 with field-level issues,
 * matching the shape `validate()` produces for schema failures.
 */
export function assertMediaAccessibility(
  kind: MediaKind,
  input: { altText?: string; caption?: string; transcript?: string },
): void {
  if (kind === MediaKind.IMAGE && !input.altText) {
    throw validationFailed([
      { path: 'altText', message: 'An image needs alt text describing it for screen readers.' },
    ]);
  }

  if ((kind === MediaKind.AUDIO || kind === MediaKind.VIDEO) && !input.transcript && !input.caption) {
    throw validationFailed([
      {
        path: 'transcript',
        message: 'Audio and video need a transcript or captions before they can be used.',
      },
    ]);
  }
}

export type MediaListQuery = z.infer<typeof mediaListQuery>;
