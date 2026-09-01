// ─────────────────────────────────────────────────────────────────────────────
// Theme service — the working copy
// Blueprint 07: "Theme system — tokens, not hard-coded values."
//
// The single most important rule in this module: **editing a theme does not change what
// learners see.** The columns on the Theme row are a working copy. `Theme.tokens` holds
// the last *published* compiled tree, and that is the field the unauthenticated sign-in
// endpoint reads (tenancy.service.ts → publicSchoolProfile). So an administrator can
// spend a fortnight nudging a green, and nothing changes on a child's screen until
// somebody presses publish.
//
// Publishing, versioning, activating and rolling back all live in
// theme.publish.service.ts. This file is the working copy: list, read, create, update,
// preview, and the one read the rest of the platform uses (`resolveSchoolTheme`).
//
// Platform base themes (schoolId = null) are readable by every school and writable by
// nobody through these routes. A school copies one — `basedOnThemeId` — and owns the
// copy. That is why there is no "edit the platform theme" path: one school's brand
// tweak must not repaint every other school on the box.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, ThemeStatus } from '@prisma/client';
import type { z } from 'zod';

import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { diffRecords } from '../../core/audit/audit.service';

import { THEME_DEFAULTS, THEME_PRESETS, findPreset, withDefaults } from './theme.presets';
import type { ThemeShape } from './theme.presets';
import {
  applyOverlay,
  compileTokens,
  contrastWarnings,
  isTokenTree,
  tokensToCss,
} from './theme.tokens';
import type { ContrastWarning, TokenTree } from './theme.tokens';
import type {
  createThemeSchema,
  previewThemeSchema,
  themeListQuery,
  updateThemeSchema,
} from './theme.validation';

type CreateInput = z.infer<typeof createThemeSchema>;
type UpdateInput = z.infer<typeof updateThemeSchema>;
type PreviewInput = z.infer<typeof previewThemeSchema>;
type ListQuery = z.infer<typeof themeListQuery>;

export const THEME_SELECT = {
  id: true,
  schoolId: true,
  name: true,
  key: true,
  description: true,
  status: true,
  isSystem: true,
  ageMode: true,
  colorPrimary: true,
  colorSecondary: true,
  colorAccent: true,
  colorSuccess: true,
  colorWarning: true,
  colorDanger: true,
  colorSurface: true,
  colorBackground: true,
  colorTextBody: true,
  colorTextMuted: true,
  fontHeading: true,
  fontBody: true,
  fontBaseSize: true,
  radiusScale: true,
  densityScale: true,
  reduceMotion: true,
  highContrast: true,
  tokens: true,
  logoMediaId: true,
  faviconMediaId: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  archivedAt: true,
  createdById: true,
} satisfies Prisma.ThemeSelect;

export type ThemeRow = Prisma.ThemeGetPayload<{ select: typeof THEME_SELECT }>;

/** A theme plus everything a UI needs to render and judge it. */
export interface ThemeDetail {
  theme: ThemeRow;
  isPlatformTheme: boolean;
  isEditable: boolean;
  isActiveForSchool: boolean;
  /** Compiled from the working copy — what publishing would produce right now. */
  draft: TokenTree;
  /** The last published tree, or null if this theme has never been published. */
  published: TokenTree | null;
  hasUnpublishedChanges: boolean;
  warnings: ContrastWarning[];
}

/** Pulls the compiler's inputs off a row. */
export function shapeOf(theme: ThemeRow): ThemeShape {
  return {
    colorPrimary: theme.colorPrimary,
    colorSecondary: theme.colorSecondary,
    colorAccent: theme.colorAccent,
    colorSuccess: theme.colorSuccess,
    colorWarning: theme.colorWarning,
    colorDanger: theme.colorDanger,
    colorSurface: theme.colorSurface,
    colorBackground: theme.colorBackground,
    colorTextBody: theme.colorTextBody,
    colorTextMuted: theme.colorTextMuted,
    fontHeading: theme.fontHeading,
    fontBody: theme.fontBody,
    fontBaseSize: theme.fontBaseSize,
    radiusScale: theme.radiusScale,
    densityScale: theme.densityScale,
    reduceMotion: theme.reduceMotion,
    highContrast: theme.highContrast,
    ageMode: theme.ageMode,
  };
}

/**
 * Compiles the working copy. The overlay is read back out of the last published tree
 * so it survives a publish and a rollback without needing a column of its own.
 */
export function compileDraft(theme: ThemeRow, overlay?: Record<string, unknown> | null): TokenTree {
  const stored = isTokenTree(theme.tokens) ? theme.tokens : null;
  const effective = overlay !== undefined ? overlay : (stored?.overrides ?? null);
  return applyOverlay(compileTokens({ key: theme.key, ...shapeOf(theme) }), effective);
}

function publishedTree(theme: ThemeRow): TokenTree | null {
  return isTokenTree(theme.tokens) ? theme.tokens : null;
}

/** `meta.generatedAt` moves on every compile, so it is excluded from the comparison. */
function sameTokens(a: TokenTree, b: TokenTree): boolean {
  const strip = (tree: TokenTree): string =>
    JSON.stringify({ ...tree, meta: { ...tree.meta, generatedAt: null } });
  return strip(a) === strip(b);
}

function detail(theme: ThemeRow, activeThemeId: string | null): ThemeDetail {
  const draft = compileDraft(theme);
  const published = publishedTree(theme);
  return {
    theme,
    isPlatformTheme: theme.schoolId === null,
    isEditable: theme.schoolId !== null && !theme.isSystem && theme.status !== ThemeStatus.ARCHIVED,
    isActiveForSchool: activeThemeId !== null && activeThemeId === theme.id,
    draft,
    published,
    hasUnpublishedChanges: published === null ? true : !sameTokens(draft, published),
    warnings: contrastWarnings(draft),
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function themeOptions() {
  return {
    presets: THEME_PRESETS,
    defaults: THEME_DEFAULTS,
    radiusScales: ['none', 'sm', 'md', 'lg', 'xl', 'full'],
    densityScales: ['compact', 'comfortable', 'spacious'],
    contrastTargets: [
      { pair: 'body text on surface', minimum: 4.5, standard: 'WCAG 2.1 AA' },
      { pair: 'brand colour against surface', minimum: 3, standard: 'WCAG 2.1 AA (UI)' },
    ],
    note:
      "The colours belong to the school. The states derived from them — hover, disabled, focus, the label on a button — are computed, so a school cannot accidentally publish an unreadable button.",
  };
}

export async function listThemes(
  _context: ActorContext,
  schoolId: string,
  query: ListQuery,
): Promise<{ items: ThemeDetail[]; totalItems: number; activeThemeId: string | null }> {
  const { skip, take } = toSkipTake(query);

  const scope: Prisma.ThemeWhereInput[] = [{ schoolId }];
  if (query.includePlatformThemes) scope.push({ schoolId: null });

  const where: Prisma.ThemeWhereInput = { OR: scope };
  if (query.status) where.status = query.status;
  if (query.ageMode) where.ageMode = query.ageMode;
  if (query.systemOnly) where.isSystem = true;
  if (query.search) {
    where.AND = [
      { OR: [{ name: { contains: query.search } }, { key: { contains: query.search } }] },
    ];
  }

  const [rows, totalItems, school] = await Promise.all([
    prisma.theme.findMany({
      where,
      select: THEME_SELECT,
      // A school's own themes first, then the platform library it can copy from.
      orderBy: [{ schoolId: 'desc' }, { status: 'asc' }, { name: 'asc' }],
      skip,
      take,
    }),
    prisma.theme.count({ where }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { activeThemeId: true } }),
  ]);

  const activeThemeId = school?.activeThemeId ?? null;
  const items = rows.map((row) => detail(row, activeThemeId));
  return { items, totalItems, activeThemeId };
}

/** Loads a theme the school is allowed to see: its own, or a platform base theme. */
export async function loadTheme(schoolId: string, themeId: string): Promise<ThemeRow> {
  const theme = await prisma.theme.findFirst({
    where: { id: themeId, OR: [{ schoolId }, { schoolId: null }] },
    select: THEME_SELECT,
  });
  if (!theme) throw notFound('Theme');
  return theme;
}

export async function getTheme(schoolId: string, themeId: string): Promise<ThemeDetail> {
  const [theme, school] = await Promise.all([
    loadTheme(schoolId, themeId),
    prisma.school.findUnique({ where: { id: schoolId }, select: { activeThemeId: true } }),
  ]);
  return detail(theme, school?.activeThemeId ?? null);
}

/**
 * What the school is currently rendering. Falls back to the compiled default rather
 * than to nothing, because a school with no theme still has to have a legible screen.
 */
export async function resolveSchoolTheme(schoolId: string): Promise<{
  themeId: string | null;
  themeKey: string;
  tokens: TokenTree;
  css: string;
  isFallback: boolean;
}> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeTheme: { select: THEME_SELECT } },
  });

  const active = school?.activeTheme ?? null;
  if (!active) {
    const tokens = compileTokens(withDefaults(THEME_DEFAULTS, 'midas-default'));
    return {
      themeId: null,
      themeKey: 'midas-default',
      tokens,
      css: tokensToCss(tokens),
      isFallback: true,
    };
  }

  // Prefer the published tree; fall back to compiling, so a theme activated before
  // this code shipped still renders instead of returning null tokens.
  const tokens = publishedTree(active) ?? compileDraft(active);
  return {
    themeId: active.id,
    themeKey: active.key,
    tokens,
    css: tokensToCss(tokens),
    isFallback: false,
  };
}

/** The working copy as a stylesheet, for an editor preview that has not published yet. */
export function draftCss(detail: ThemeDetail): string {
  return tokensToCss(detail.draft);
}

/**
 * The same read, by slug, for the login screen — which has no token, no school id and
 * still has to be the school's colours rather than ours. An unknown or archived slug
 * gets the default rather than a 404, because leaking which slugs exist is a small
 * gift to somebody enumerating schools.
 */
export async function resolveThemeBySlug(slug: string): Promise<{
  themeKey: string;
  tokens: TokenTree;
  css: string;
  isFallback: boolean;
}> {
  const school = await prisma.school.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!school || school.status === 'ARCHIVED') {
    const tokens = compileTokens(withDefaults(THEME_DEFAULTS, 'midas-default'));
    return { themeKey: 'midas-default', tokens, css: tokensToCss(tokens), isFallback: true };
  }

  const resolved = await resolveSchoolTheme(school.id);
  return {
    themeKey: resolved.themeKey,
    tokens: resolved.tokens,
    css: resolved.css,
    isFallback: resolved.isFallback,
  };
}

/** Compiles an unsaved theme so the editor can show the result and its warnings. */export function previewTheme(input: PreviewInput): {
  tokens: TokenTree;
  css: string;
  warnings: ContrastWarning[];
} {
  const { key, tokens: overlay, ...shape } = input;
  const compiled = applyOverlay(
    compileTokens(withDefaults(shape, key ?? 'preview')),
    (overlay) ?? null,
  );
  return { tokens: compiled, css: tokensToCss(compiled), warnings: contrastWarnings(compiled) };
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function assertKeyFree(schoolId: string, key: string, exceptThemeId?: string): Promise<void> {
  const existing = await prisma.theme.findFirst({
    where: { schoolId, key, ...(exceptThemeId ? { id: { not: exceptThemeId } } : {}) },
    select: { id: true },
  });
  if (existing) throw conflict(`This school already has a theme with the key "${key}"`);
}

async function assertMediaBelongsToSchool(schoolId: string, mediaId: string): Promise<void> {
  const media = await prisma.mediaAsset.findFirst({
    where: { id: mediaId, OR: [{ schoolId }, { schoolId: null }] },
    select: { id: true },
  });
  if (!media) throw notFound('Media asset');
}

export async function createTheme(
  context: ActorContext,
  schoolId: string,
  input: CreateInput,
): Promise<ThemeDetail> {
  await assertKeyFree(schoolId, input.key);

  let base: ThemeShape = { ...THEME_DEFAULTS };
  let overlay: Record<string, unknown> | null = null;

  if (input.basedOnThemeId) {
    const source = await loadTheme(schoolId, input.basedOnThemeId);
    base = shapeOf(source);
    overlay = publishedTree(source)?.overrides ?? null;
  } else {
    // A preset key doubles as a starting palette, which is why the keys match.
    const preset = findPreset(input.key);
    if (preset) base = { ...preset.shape };
  }

  const { key, name, description, tokens, logoMediaId, faviconMediaId, basedOnThemeId, ...supplied } =
    input;
  void basedOnThemeId;

  if (logoMediaId) await assertMediaBelongsToSchool(schoolId, logoMediaId);
  if (faviconMediaId) await assertMediaBelongsToSchool(schoolId, faviconMediaId);

  const shape: ThemeShape = { ...base, ...stripUndefined(supplied) };
  const effectiveOverlay = (tokens) ?? overlay;

  const created = await prisma.theme.create({
    data: {
      schoolId,
      key,
      name,
      description: description ?? null,
      status: ThemeStatus.DRAFT,
      isSystem: false,
      logoMediaId: logoMediaId ?? null,
      faviconMediaId: faviconMediaId ?? null,
      createdById: context.actor.userId,
      ...shape,
      // A draft has never been published, so there is nothing live to record yet.
      // The overlay is carried on the row so it is not lost between now and publish.
      tokens: effectiveOverlay
        ? (({ overrides: effectiveOverlay } as unknown) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    select: THEME_SELECT,
  });

  recordAudit(context, {
    action: 'theme.create',
    targetType: 'Theme',
    targetId: created.id,
    summary: `Created theme "${created.name}"`,
    afterData: { key: created.key, basedOnThemeId: input.basedOnThemeId ?? null },
  });

  return detail(created, null);
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

export async function updateTheme(
  context: ActorContext,
  schoolId: string,
  themeId: string,
  input: UpdateInput,
): Promise<ThemeDetail> {
  const existing = await loadTheme(schoolId, themeId);

  if (existing.schoolId === null) {
    throw forbidden(
      'Platform base themes cannot be edited. Create a copy with basedOnThemeId and edit that — every school on this platform shares this theme.',
    );
  }
  if (existing.isSystem) {
    throw forbidden('This theme is managed by the platform and cannot be edited here.');
  }
  if (existing.status === ThemeStatus.ARCHIVED) {
    throw conflict('This theme is archived. Restore it before editing.');
  }

  const { tokens, logoMediaId, faviconMediaId, name, description, ...supplied } = input;

  if (logoMediaId) await assertMediaBelongsToSchool(schoolId, logoMediaId);
  if (faviconMediaId) await assertMediaBelongsToSchool(schoolId, faviconMediaId);

  // Unchecked, so the two media foreign keys can be set by id rather than by connect.
  const data: Prisma.ThemeUncheckedUpdateInput = { ...stripUndefined(supplied) };
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description ?? null;
  if (logoMediaId !== undefined) data.logoMediaId = logoMediaId;
  if (faviconMediaId !== undefined) data.faviconMediaId = faviconMediaId;

  // The overlay lives inside the stored tree. Rewriting it keeps the published
  // colours untouched until publish rewrites the whole tree.
  if (tokens !== undefined) {
    const stored = publishedTree(existing);
    const nextOverlay = (tokens) ?? null;
    data.tokens = stored
      ? (({ ...stored, overrides: nextOverlay } as unknown) as Prisma.InputJsonValue)
      : nextOverlay
        ? (({ overrides: nextOverlay } as unknown) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
  }

  const updated = await prisma.theme.update({
    where: { id: themeId },
    data,
    select: THEME_SELECT,
  });

  recordAudit(context, {
    action: 'theme.update',
    targetType: 'Theme',
    targetId: themeId,
    summary: `Updated theme "${updated.name}" (draft; not yet published)`,
    beforeData: diffRecords(shapeOf(existing), shapeOf(updated)),
  });

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeThemeId: true },
  });
  return detail(updated, school?.activeThemeId ?? null);
}

export async function setThemeArchived(
  context: ActorContext,
  schoolId: string,
  themeId: string,
  archived: boolean,
): Promise<ThemeDetail> {
  const existing = await loadTheme(schoolId, themeId);
  if (existing.schoolId === null || existing.isSystem) {
    throw forbidden('Platform themes cannot be archived by a school.');
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeThemeId: true },
  });
  if (archived && school?.activeThemeId === themeId) {
    throw badRequest(
      'This theme is the one the school is currently using. Activate a different theme first.',
    );
  }

  const updated = await prisma.theme.update({
    where: { id: themeId },
    data: {
      status: archived
        ? ThemeStatus.ARCHIVED
        : existing.publishedAt
          ? ThemeStatus.PUBLISHED
          : ThemeStatus.DRAFT,
      archivedAt: archived ? new Date() : null,
    },
    select: THEME_SELECT,
  });

  recordAudit(context, {
    action: 'theme.update',
    targetType: 'Theme',
    targetId: themeId,
    summary: archived ? `Archived theme "${updated.name}"` : `Restored theme "${updated.name}"`,
    afterData: { status: updated.status },
  });

  return detail(updated, school?.activeThemeId ?? null);
}
