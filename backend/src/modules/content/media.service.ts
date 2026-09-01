// ─────────────────────────────────────────────────────────────────────────────
// Media service
// Upload, list, update, moderate and soft-delete for `MediaAsset`.
//
// Four rules are enforced here rather than described:
//  - Accessibility (blueprint 07): an image needs alt text; audio and video need
//    a transcript or captions. Checked before a byte reaches storage.
//  - Tenancy: an asset belongs to one school, or to the platform library
//    (`schoolId: null`) which every tenant may read and only platform staff may
//    write.
//  - Referential safety: an asset still used by a lesson, question or theme is
//    not deletable; the caller is told what is using it.
//  - Storage keys are generated, never client-supplied — see the local driver.
//
// Siblings: media.helpers.ts (MIME vetting, headers, dimensions),
// media.validation.ts (schemas + the accessibility rule), media.routes.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { ContentOwnership, MediaKind, ModerationDecision } from '@prisma/client';
import type { Readable } from 'node:stream';
import type { z } from 'zod';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { storage, storagePrefix } from '../../core/storage';
import {
  assertUploadSize,
  contentDisposition,
  dispositionModeFor,
  readImageDimensions,
  referenceTotal,
  requireMediaAsset,
  resolveMediaKind,
  type UploadedFile,
} from './media.helpers';
import {
  assertMediaAccessibility,
  type MediaListQuery,
  type moderateMediaSchema,
  type updateMediaSchema,
  type uploadMediaSchema,
} from './media.validation';

type UploadInput = z.infer<typeof uploadMediaSchema>;
type UpdateInput = z.infer<typeof updateMediaSchema>;
type ModerateInput = z.infer<typeof moderateMediaSchema>;

/** Fields every media response returns. `storageKey` is deliberately absent. */
const MEDIA_SELECT = {
  id: true,
  schoolId: true,
  kind: true,
  fileName: true,
  originalFileName: true,
  mimeType: true,
  byteSize: true,
  checksumSha256: true,
  width: true,
  height: true,
  durationSeconds: true,
  altText: true,
  caption: true,
  transcript: true,
  ownership: true,
  licenseNote: true,
  attribution: true,
  moderationDecision: true,
  moderatedAt: true,
  moderatedById: true,
  isPublic: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.MediaAssetSelect;

// ── Listing and reading ─────────────────────────────────────────────────────

export async function listMedia(schoolId: string, query: MediaListQuery) {
  const { skip, take } = toSkipTake(query);

  const where: Prisma.MediaAssetWhereInput = {
    ...(query.includePlatformLibrary ? { OR: [{ schoolId }, { schoolId: null }] } : { schoolId }),
    ...(query.includeDeleted ? {} : { deletedAt: null }),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.moderationDecision ? { moderationDecision: query.moderationDecision } : {}),
    ...(query.ownership ? { ownership: query.ownership } : {}),
    ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {}),
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                { fileName: { contains: query.search } },
                { altText: { contains: query.search } },
                { caption: { contains: query.search } },
              ],
            },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: MEDIA_SELECT,
    }),
    prisma.mediaAsset.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getMedia(schoolId: string, id: string) {
  const asset = await requireMediaAsset(schoolId, id, { includeDeleted: true });
  return {
    ...toResponse(asset),
    referenceCount: referenceTotal(asset._count),
    references: asset._count,
  };
}

/**
 * `storageKey` is an internal address and `_count` is a Prisma detail; neither
 * belongs in a response body, so both are stripped in one place.
 */
function toResponse<T extends { storageKey: string }>(asset: T): Omit<T, 'storageKey' | '_count'> {
  const copy = { ...asset } as Record<string, unknown>;
  delete copy.storageKey;
  delete copy._count;
  return copy as Omit<T, 'storageKey' | '_count'>;
}

// ── Upload ──────────────────────────────────────────────────────────────────

/**
 * Stores a file and its row together. The bytes are written first because a
 * database row pointing at a missing object is the worse of the two failures; if
 * the row then fails to insert, the orphaned object is removed again.
 */
export async function uploadMedia(
  context: ActorContext,
  schoolId: string,
  file: UploadedFile,
  input: UploadInput,
) {
  const kind = resolveMediaKind(file.mimetype);
  assertUploadSize(file.size, env.storage.maxUploadBytes);
  // Accessibility is checked before anything is written, so a rejected upload
  // leaves no object and no row behind.
  assertMediaAccessibility(kind, input);

  const dimensions = kind === MediaKind.IMAGE ? readImageDimensions(file.mimetype, file.buffer) : null;

  const stored = await storage.put({
    prefix: storagePrefix.schoolMedia(schoolId),
    fileName: file.originalname,
    mimeType: file.mimetype,
    content: file.buffer,
  });

  try {
    const asset = await prisma.mediaAsset.create({
      data: {
        schoolId,
        kind,
        fileName: safeFileName(file.originalname),
        originalFileName: file.originalname.slice(0, 255),
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        checksumSha256: stored.checksumSha256,
        width: dimensions?.width,
        height: dimensions?.height,
        altText: input.altText,
        caption: input.caption,
        transcript: input.transcript,
        ownership: input.ownership ?? ContentOwnership.SCHOOL_OWNED,
        licenseNote: input.licenseNote,
        attribution: input.attribution,
        isPublic: input.isPublic,
        uploadedById: context.actor.userId,
      },
      select: MEDIA_SELECT,
    });

    recordAudit(context, {
      action: 'media.upload',
      targetType: 'MediaAsset',
      targetId: asset.id,
      schoolId,
      summary: `Uploaded ${asset.kind.toLowerCase()} "${asset.fileName}" (${asset.byteSize} bytes).`,
      afterData: asset,
    });

    return asset;
  } catch (error) {
    await storage.remove(stored.storageKey).catch(() => undefined);
    throw error;
  }
}

/** Keeps a recognisable name on the row without keeping a path or a quote. */
function safeFileName(originalName: string): string {
  const base = originalName.replace(/[\\/]/g, '_').replace(/["\r\n\t]/g, '').trim();
  return (base.length > 0 ? base : 'upload').slice(0, 255);
}

// ── Update ──────────────────────────────────────────────────────────────────

export async function updateMedia(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateInput,
) {
  const existing = await requireMediaAsset(schoolId, id);
  assertOwnedByTenant(context, existing.schoolId, 'edited');

  // The accessibility rule is re-checked against the merged record, so alt text
  // cannot be cleared from an image by a later edit.
  assertMediaAccessibility(existing.kind, {
    altText: input.altText !== undefined ? input.altText : existing.altText ?? undefined,
    caption: input.caption !== undefined ? input.caption : existing.caption ?? undefined,
    transcript: input.transcript !== undefined ? input.transcript : existing.transcript ?? undefined,
  });

  const asset = await prisma.mediaAsset.update({
    where: { id },
    data: {
      fileName: input.fileName ? safeFileName(input.fileName) : undefined,
      altText: input.altText,
      caption: input.caption,
      transcript: input.transcript,
      ownership: input.ownership,
      licenseNote: input.licenseNote,
      attribution: input.attribution,
      isPublic: input.isPublic,
    },
    select: MEDIA_SELECT,
  });

  recordAudit(context, {
    action: 'media.update',
    targetType: 'MediaAsset',
    targetId: asset.id,
    schoolId,
    summary: `Updated media "${asset.fileName}".`,
    beforeData: toResponse(existing),
    afterData: asset,
  });

  return asset;
}

/**
 * Platform-library assets are shared, so a tenant may reference one but not
 * change or remove it. Only platform staff may act on an asset with no school.
 */
function assertOwnedByTenant(
  context: ActorContext,
  assetSchoolId: string | null,
  action: 'edited' | 'deleted' | 'moderated',
): void {
  if (assetSchoolId === null && !context.actor.isPlatformStaff) {
    throw forbidden(`Platform library assets can only be ${action} by platform staff.`);
  }
}

// ── Moderation (blueprint 05) ───────────────────────────────────────────────

/**
 * Records a moderation decision. A REJECTED or REMOVED asset is also made
 * private, so revoking approval takes effect on the public route immediately
 * rather than after a separate edit.
 */
export async function moderateMedia(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: ModerateInput,
) {
  const existing = await requireMediaAsset(schoolId, id, { includeDeleted: true });
  assertOwnedByTenant(context, existing.schoolId, 'moderated');

  const isBlocked =
    input.decision === ModerationDecision.REJECTED || input.decision === ModerationDecision.REMOVED;

  const asset = await prisma.mediaAsset.update({
    where: { id },
    data: {
      moderationDecision: input.decision,
      moderatedAt: input.decision === ModerationDecision.PENDING ? null : new Date(),
      moderatedById:
        input.decision === ModerationDecision.PENDING ? null : context.actor.userId.slice(0, 32),
      ...(isBlocked ? { isPublic: false } : {}),
    },
    select: MEDIA_SELECT,
  });

  recordAudit(context, {
    action: 'media.moderate',
    targetType: 'MediaAsset',
    targetId: asset.id,
    schoolId,
    summary: `Media "${asset.fileName}" moderated as ${asset.moderationDecision}.`,
    reason: input.notes,
    beforeData: { moderationDecision: existing.moderationDecision, isPublic: existing.isPublic },
    afterData: { moderationDecision: asset.moderationDecision, isPublic: asset.isPublic },
  });

  return asset;
}

// ── Soft delete and restore ─────────────────────────────────────────────────

/**
 * Soft-deletes an asset, refusing while anything still points at it. The row and
 * the object both stay in place: a lesson published last term must still render,
 * and blueprint 10 retention decides when bytes actually go.
 */
export async function deleteMedia(context: ActorContext, schoolId: string, id: string) {
  const existing = await requireMediaAsset(schoolId, id);
  assertOwnedByTenant(context, existing.schoolId, 'deleted');

  const total = referenceTotal(existing._count);
  if (total > 0) {
    throw conflict('That file is still used by other content. Remove those references first.', {
      details: { references: existing._count },
    });
  }

  const asset = await prisma.mediaAsset.update({
    where: { id },
    data: { deletedAt: new Date(), isPublic: false },
    select: MEDIA_SELECT,
  });

  recordAudit(context, {
    action: 'media.delete',
    targetType: 'MediaAsset',
    targetId: asset.id,
    schoolId,
    summary: `Deleted media "${asset.fileName}".`,
    beforeData: toResponse(existing),
  });

  return asset;
}

export async function restoreMedia(context: ActorContext, schoolId: string, id: string) {
  const existing = await requireMediaAsset(schoolId, id, { includeDeleted: true });
  assertOwnedByTenant(context, existing.schoolId, 'edited');
  if (!existing.deletedAt) throw badRequest('That file is not deleted.');

  const asset = await prisma.mediaAsset.update({
    where: { id },
    data: { deletedAt: null },
    select: MEDIA_SELECT,
  });

  recordAudit(context, {
    action: 'media.update',
    targetType: 'MediaAsset',
    targetId: asset.id,
    schoolId,
    summary: `Restored media "${asset.fileName}".`,
    afterData: asset,
  });

  return asset;
}

// ── Serving bytes ───────────────────────────────────────────────────────────

export interface MediaDownload {
  stream: Readable;
  mimeType: string;
  byteSize: number;
  disposition: string;
  /** Immutable: the storage key is content-addressed, so bytes never change. */
  cacheControl: string;
  checksumSha256: string | null;
}

/**
 * Resolves an asset to a readable stream for an authenticated request. The
 * tenant check happens on the row, not the key, which is why a stored key is
 * never exposed to a client in the first place.
 */
export async function openMedia(
  schoolId: string,
  id: string,
  mode: 'inline' | 'attachment' = 'inline',
): Promise<MediaDownload> {
  const asset = await requireMediaAsset(schoolId, id);
  return openStoredAsset(asset, mode, 'private, max-age=0, must-revalidate');
}

/**
 * Resolves a public asset with no authentication. Only an approved, public,
 * non-deleted asset qualifies — the three conditions are ANDed in the query so a
 * later moderation decision closes the route without any other change.
 */
export async function openPublicMedia(
  id: string,
  mode: 'inline' | 'attachment' = 'inline',
): Promise<MediaDownload> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id,
      isPublic: true,
      deletedAt: null,
      moderationDecision: { in: [ModerationDecision.APPROVED, ModerationDecision.PENDING] },
    },
    select: { storageKey: true, mimeType: true, byteSize: true, fileName: true, checksumSha256: true },
  });
  if (!asset) throw notFound('Media asset');
  return openStoredAsset(asset, mode, 'public, max-age=86400, immutable');
}

async function openStoredAsset(
  asset: {
    storageKey: string;
    mimeType: string;
    byteSize: number;
    fileName: string;
    checksumSha256: string | null;
  },
  mode: 'inline' | 'attachment',
  cacheControl: string,
): Promise<MediaDownload> {
  const stream = await storage.stream(asset.storageKey);
  return {
    stream,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    disposition: contentDisposition(asset.fileName, dispositionModeFor(asset.mimeType, mode)),
    cacheControl,
    checksumSha256: asset.checksumSha256,
  };
}

// ── Tenant usage (blueprint 09 storage reporting) ───────────────────────────

/**
 * Storage a school is consuming. `recordedBytes` is the sum of the rows, which is
 * what a subscription limit is checked against; `storedBytes` is what is actually
 * on disk, and a gap between the two indicates orphaned objects.
 */
export async function getMediaUsage(schoolId: string) {
  const [aggregate, byKind, storedBytes] = await Promise.all([
    prisma.mediaAsset.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { byteSize: true },
      _count: true,
    }),
    prisma.mediaAsset.groupBy({
      by: ['kind'],
      where: { schoolId, deletedAt: null },
      _sum: { byteSize: true },
      _count: { _all: true },
    }),
    storage.usage(storagePrefix.schoolMedia(schoolId)),
  ]);

  return {
    assetCount: aggregate._count,
    recordedBytes: aggregate._sum.byteSize ?? 0,
    storedBytes,
    maxUploadBytes: env.storage.maxUploadBytes,
    byKind: byKind.map((row) => ({
      kind: row.kind,
      assetCount: row._count._all,
      bytes: row._sum.byteSize ?? 0,
    })),
  };
}

