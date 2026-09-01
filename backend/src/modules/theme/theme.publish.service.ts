// ─────────────────────────────────────────────────────────────────────────────
// Theme publishing, versions, activation and rollback
// Blueprint 07: a school's branding is versioned, and every published version can be
// returned to.
//
// Three rules hold this together.
//
// 1. **Publishing is the only thing that changes what a learner sees.** It compiles the
//    working copy once, writes that tree to `Theme.tokens` — the field the public
//    sign-in endpoint reads — and records the identical tree as an immutable
//    `ThemeVersion`. Editing colours afterwards does not touch either.
//
// 2. **Versions are append-only, so a rollback is a publish of an older tree**, not a
//    deletion of newer ones. The history of what a school was showing in March stays
//    intact even after they change their mind twice.
//
// 3. **A school cannot activate a platform base theme.** `School.activeThemeId` is
//    `@unique` in the schema, so a theme can be active for at most one school; pointing
//    two schools at the shared indigo would fail at the database, and pointing one
//    school at it would take it away from another. Copy, then publish, then activate.
//
// Publishing is also where accessibility stops being advisory. Three contrast failures
// block a publish outright — body text you cannot read on the page, and a button label
// you cannot read on the button. The rest are returned as warnings, because a school
// may have a considered reason for a pale caption and we are not the last word on it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma} from '@prisma/client';
import { ThemeStatus } from '@prisma/client';
import type { z } from 'zod';

import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { conflict, forbidden, notFound, preconditionFailed } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import type { PaginationQuery } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';

import type { ThemeShape } from './theme.presets';
import { compileDraft, loadTheme, shapeOf } from './theme.service';
import type { ThemeRow } from './theme.service';
import { contrastWarnings, isTokenTree, tokensToCss } from './theme.tokens';
import type { ContrastWarning, TokenTree } from './theme.tokens';
import type { publishThemeSchema, rollbackThemeSchema } from './theme.validation';

type PublishInput = z.infer<typeof publishThemeSchema>;
type RollbackInput = z.infer<typeof rollbackThemeSchema>;

/**
 * A version row carries the compiled tree *and* the working-copy values it came from,
 * so a rollback can restore the editor as well as the rendering. Without `source`, a
 * school that rolled back would see old colours on screen and new colours in the form.
 */
interface VersionPayload extends TokenTree {
  source: ThemeShape;
}

const VERSION_SELECT = {
  id: true,
  themeId: true,
  version: true,
  status: true,
  changeSummary: true,
  createdAt: true,
  publishedAt: true,
  createdById: true,
} satisfies Prisma.ThemeVersionSelect;

export type ThemeVersionRow = Prisma.ThemeVersionGetPayload<{ select: typeof VERSION_SELECT }>;

/** The pairs a school is not allowed to publish through. */
const BLOCKING_PAIRS = new Set([
  'text-body on surface',
  'text-body on background',
  'primary-contrast on primary',
]);

function splitWarnings(warnings: ContrastWarning[]): {
  blocking: ContrastWarning[];
  advisory: ContrastWarning[];
} {
  return {
    blocking: warnings.filter((warning) => BLOCKING_PAIRS.has(warning.pair)),
    advisory: warnings.filter((warning) => !BLOCKING_PAIRS.has(warning.pair)),
  };
}

function assertSchoolOwned(theme: ThemeRow): void {
  if (theme.schoolId === null) {
    throw forbidden(
      'This is a platform base theme, shared by every school. Copy it with basedOnThemeId, then publish the copy.',
    );
  }
  if (theme.isSystem) {
    throw forbidden('This theme is managed by the platform and cannot be published here.');
  }
  if (theme.status === ThemeStatus.ARCHIVED) {
    throw conflict('This theme is archived. Restore it before publishing.');
  }
}

export interface PublishResult {
  theme: ThemeRow;
  version: ThemeVersionRow;
  tokens: TokenTree;
  css: string;
  warnings: ContrastWarning[];
  activated: boolean;
}

export async function publishTheme(
  context: ActorContext,
  schoolId: string,
  themeId: string,
  input: PublishInput,
): Promise<PublishResult> {
  const existing = await loadTheme(schoolId, themeId);
  assertSchoolOwned(existing);

  const tree = compileDraft(existing);
  const { blocking, advisory } = splitWarnings(contrastWarnings(tree));

  if (blocking.length > 0) {
    const detail = blocking
      .map((warning) => `${warning.pair} is ${warning.ratio}:1 (needs ${warning.required}:1)`)
      .join('; ');
    throw preconditionFailed(
      `This theme cannot be published because text on it is not readable: ${detail}. ${blocking[0].advice}`,
    );
  }

  const payload: VersionPayload = { ...tree, source: shapeOf(existing) };
  const now = new Date();

  const version = await prisma.$transaction(async (tx) => {
    const latest = await tx.themeVersion.findFirst({
      where: { themeId },
      select: { version: true },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    // Exactly one version is PUBLISHED at a time, so "what is live" needs no join.
    await tx.themeVersion.updateMany({
      where: { themeId, status: ThemeStatus.PUBLISHED },
      data: { status: ThemeStatus.ARCHIVED },
    });

    const created = await tx.themeVersion.create({
      data: {
        themeId,
        version: nextVersion,
        status: ThemeStatus.PUBLISHED,
        tokens: payload as unknown as Prisma.InputJsonValue,
        changeSummary: input.changeSummary,
        publishedAt: now,
        createdById: context.actor.userId,
      },
      select: VERSION_SELECT,
    });

    await tx.theme.update({
      where: { id: themeId },
      data: {
        status: ThemeStatus.PUBLISHED,
        publishedAt: now,
        tokens: tree as unknown as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  let activated = false;
  if (input.activate) {
    await prisma.school.update({ where: { id: schoolId }, data: { activeThemeId: themeId } });
    activated = true;
  }

  recordAudit(context, {
    action: 'theme.publish',
    targetType: 'Theme',
    targetId: themeId,
    summary: `Published "${existing.name}" as version ${version.version}${activated ? ' and made it live' : ''}`,
    afterData: {
      version: version.version,
      changeSummary: input.changeSummary,
      activated,
      advisoryWarnings: advisory.map((warning) => warning.pair),
    },
  });

  const theme = await loadTheme(schoolId, themeId);
  return { theme, version, tokens: tree, css: tokensToCss(tree), warnings: advisory, activated };
}

export async function activateTheme(
  context: ActorContext,
  schoolId: string,
  themeId: string,
): Promise<{ activeThemeId: string; tokens: TokenTree; css: string }> {
  const theme = await loadTheme(schoolId, themeId);
  assertSchoolOwned(theme);

  if (theme.status !== ThemeStatus.PUBLISHED || !isTokenTree(theme.tokens)) {
    throw preconditionFailed(
      'This theme has not been published yet. Publish it first — activating a draft would put half-finished colours in front of learners.',
    );
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeThemeId: true },
  });
  if (school?.activeThemeId === themeId) {
    throw conflict('This theme is already the one the school is using.');
  }

  await prisma.school.update({ where: { id: schoolId }, data: { activeThemeId: themeId } });

  recordAudit(context, {
    action: 'theme.activate',
    targetType: 'School',
    targetId: schoolId,
    summary: `Switched the school to theme "${theme.name}"`,
    beforeData: { activeThemeId: school?.activeThemeId ?? null },
    afterData: { activeThemeId: themeId, themeKey: theme.key },
  });

  const tokens = theme.tokens;
  return { activeThemeId: themeId, tokens, css: tokensToCss(tokens) };
}

/**
 * Clears the school's active theme, which returns every screen to the compiled
 * default. Kept because a school that has just discovered its new palette is
 * unreadable on a projector needs one button, not a colour-picking session.
 */
export async function deactivateTheme(
  context: ActorContext,
  schoolId: string,
): Promise<{ activeThemeId: null }> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { activeThemeId: true },
  });
  if (!school?.activeThemeId) {
    throw conflict('This school is already using the platform default.');
  }

  await prisma.school.update({ where: { id: schoolId }, data: { activeThemeId: null } });

  recordAudit(context, {
    action: 'theme.activate',
    targetType: 'School',
    targetId: schoolId,
    summary: 'Reverted the school to the platform default theme',
    beforeData: { activeThemeId: school.activeThemeId },
    afterData: { activeThemeId: null },
  });

  return { activeThemeId: null };
}

// ── Version history ─────────────────────────────────────────────────────────

export async function listVersions(
  schoolId: string,
  themeId: string,
  query: PaginationQuery,
): Promise<{ items: ThemeVersionRow[]; totalItems: number }> {
  await loadTheme(schoolId, themeId);
  const { skip, take } = toSkipTake(query);

  const [items, totalItems] = await Promise.all([
    prisma.themeVersion.findMany({
      where: { themeId },
      select: VERSION_SELECT,
      orderBy: { version: 'desc' },
      skip,
      take,
    }),
    prisma.themeVersion.count({ where: { themeId } }),
  ]);

  return { items, totalItems };
}

async function loadVersion(themeId: string, version: number) {
  const row = await prisma.themeVersion.findFirst({
    where: { themeId, version },
    select: { ...VERSION_SELECT, tokens: true },
  });
  if (!row) throw notFound('Theme version');
  return row;
}

export async function getVersion(
  schoolId: string,
  themeId: string,
  version: number,
): Promise<{ version: ThemeVersionRow; tokens: TokenTree | null; css: string | null }> {
  await loadTheme(schoolId, themeId);
  const row = await loadVersion(themeId, version);
  const { tokens, ...meta } = row;
  const tree = isTokenTree(tokens) ? (tokens as TokenTree) : null;
  return { version: meta, tokens: tree, css: tree ? tokensToCss(tree) : null };
}

/**
 * Rollback republishes an older tree as a new version. Nothing is deleted, and the
 * working copy is restored from the version's `source` so the editor and the screen
 * agree afterwards.
 */
export async function rollbackTheme(
  context: ActorContext,
  schoolId: string,
  themeId: string,
  input: RollbackInput,
): Promise<PublishResult> {
  const existing = await loadTheme(schoolId, themeId);
  assertSchoolOwned(existing);

  const row = await loadVersion(themeId, input.version);
  if (!isTokenTree(row.tokens)) {
    throw conflict('That version was stored in a format this release cannot read.');
  }

  const stored = row.tokens as unknown as VersionPayload;
  const { source, ...tree } = stored;
  const now = new Date();
  const summary = input.changeSummary ?? `Rolled back to version ${input.version}`;

  const version = await prisma.$transaction(async (tx) => {
    const latest = await tx.themeVersion.findFirst({
      where: { themeId },
      select: { version: true },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await tx.themeVersion.updateMany({
      where: { themeId, status: ThemeStatus.PUBLISHED },
      data: { status: ThemeStatus.ARCHIVED },
    });

    const created = await tx.themeVersion.create({
      data: {
        themeId,
        version: nextVersion,
        status: ThemeStatus.PUBLISHED,
        tokens: stored as unknown as Prisma.InputJsonValue,
        changeSummary: summary,
        publishedAt: now,
        createdById: context.actor.userId,
      },
      select: VERSION_SELECT,
    });

    await tx.theme.update({
      where: { id: themeId },
      data: {
        status: ThemeStatus.PUBLISHED,
        publishedAt: now,
        tokens: tree as unknown as Prisma.InputJsonValue,
        // Restore the working copy, when the version recorded one.
        ...(source ?? {}),
      },
    });

    return created;
  });

  recordAudit(context, {
    action: 'theme.publish',
    targetType: 'Theme',
    targetId: themeId,
    summary: `Rolled theme "${existing.name}" back to version ${input.version} (published as ${version.version})`,
    afterData: { restoredFrom: input.version, version: version.version },
  });

  const theme = await loadTheme(schoolId, themeId);
  const restored = tree;
  return {
    theme,
    version,
    tokens: restored,
    css: tokensToCss(restored),
    warnings: splitWarnings(contrastWarnings(restored)).advisory,
    activated: false,
  };
}
