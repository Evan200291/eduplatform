// ─────────────────────────────────────────────────────────────────────────────
// Media module internals
// MIME vetting, tenant lookup, reference counting, safe download headers and
// image dimension reading. Kept out of `media.service.ts` so that file reads as
// upload and moderation rules rather than plumbing.
//
// Dimensions are parsed from the bytes already in memory rather than by adding
// an image library: the columns exist so the frontend can reserve layout space,
// and an unknown value is better than an approximated one.
// ─────────────────────────────────────────────────────────────────────────────

import type { MediaKind} from '@prisma/client';
import { type Prisma } from '@prisma/client';
import { badRequest, notFound, payloadTooLarge, unsupportedMediaType } from '../../core/http/errors';
import { prisma } from '../../core/prisma';
import { ALL_ALLOWED_MIME_TYPES, mediaKindForMime } from '../../core/storage';

/** The subset of a multer file this module reads. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Maps an accepted MIME type onto its `MediaKind`, refusing anything else. */
export function resolveMediaKind(mimeType: string): MediaKind {
  const kind = mediaKindForMime(mimeType);
  if (!kind) throw unsupportedMediaType(mimeType, [...ALL_ALLOWED_MIME_TYPES]);
  return kind as MediaKind;
}

/**
 * Multer already enforces the limit, but an upload can also arrive through a
 * different path (a seed, a job), so the rule is restated where it matters.
 */
export function assertUploadSize(byteSize: number, maxBytes: number): void {
  if (byteSize <= 0) throw badRequest('That file appears to be empty.');
  if (byteSize > maxBytes) throw payloadTooLarge(maxBytes);
}

// ── Tenant lookup ───────────────────────────────────────────────────────────

/** Counts of every row that points at an asset, used before a delete. */
export const MEDIA_REFERENCE_COUNT = {
  select: {
    schoolLogos: true,
    userAvatars: true,
    themeLogos: true,
    themeFavicons: true,
    lessonHeroes: true,
    lessonSections: true,
    activityThumbnails: true,
    questionPrompts: true,
    answerOptions: true,
    badgeIcons: true,
    rewardPreviews: true,
  },
} satisfies Prisma.MediaAssetCountOutputTypeDefaultArgs;

/**
 * Loads an asset a request may act on. A school sees its own assets; the
 * platform library (`schoolId: null`) is readable by everyone but only writable
 * by platform staff, which the service checks separately.
 */
export async function requireMediaAsset(
  schoolId: string,
  id: string,
  options: { includeDeleted?: boolean; includePlatformLibrary?: boolean } = {},
) {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
      ...(options.includePlatformLibrary === false
        ? { schoolId }
        : { OR: [{ schoolId }, { schoolId: null }] }),
    },
    include: { _count: MEDIA_REFERENCE_COUNT },
  });
  if (!asset) throw notFound('Media asset');
  return asset;
}

/** Total number of rows referencing an asset, from a `_count` payload. */
export function referenceTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

// ── Download headers ────────────────────────────────────────────────────────

/**
 * A stored file name is echoed in `Content-Disposition`, so it is filtered
 * rather than trusted: quotes, control characters and path separators are
 * removed, and RFC 5987 `filename*` carries the original for modern clients.
 */
export function contentDisposition(fileName: string, mode: 'inline' | 'attachment'): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\/\r\n;]/g, '_') || 'download';
  const encoded = encodeURIComponent(fileName);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * SVG and HTML are served as attachments only. An inline SVG executes script in
 * the origin that served it, which would turn a teacher's upload into a way to
 * read another user's session from the API origin.
 */
const NEVER_INLINE = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml']);

export function dispositionModeFor(mimeType: string, requested: 'inline' | 'attachment') {
  return NEVER_INLINE.has(mimeType) ? 'attachment' : requested;
}

// ── Image dimensions ────────────────────────────────────────────────────────

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Reads pixel dimensions from the file header for the raster formats we accept.
 * Returns null for anything unrecognised (including SVG, whose size is a unit
 * string rather than a pixel count) so the columns stay honestly empty.
 */
export function readImageDimensions(mimeType: string, buffer: Buffer): Dimensions | null {
  try {
    switch (mimeType) {
      case 'image/png':
        return readPngSize(buffer);
      case 'image/gif':
        return readGifSize(buffer);
      case 'image/jpeg':
        return readJpegSize(buffer);
      case 'image/webp':
        return readWebpSize(buffer);
      default:
        return null;
    }
  } catch {
    // A truncated or malformed header is not a reason to refuse the upload.
    return null;
  }
}

function readPngSize(buffer: Buffer): Dimensions | null {
  // 8-byte signature, then an IHDR chunk whose width/height are big-endian.
  if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGifSize(buffer: Buffer): Dimensions | null {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/** Walks JPEG segments to the first Start-Of-Frame marker. */
function readJpegSize(buffer: Buffer): Dimensions | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF15, excluding the four non-frame markers in that range.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker);
    if (isFrame) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  return null;
}

/** Handles the three WebP chunk layouts: lossy VP8, lossless VP8L and VP8X. */
function readWebpSize(buffer: Buffer): Dimensions | null {
  if (buffer.length < 30 || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);

  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }
  return null;
}

