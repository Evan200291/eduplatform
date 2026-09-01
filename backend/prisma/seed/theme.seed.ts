// ─────────────────────────────────────────────────────────────────────────────
// Seed — themes
// Blueprint 07: "tokens, not hard-coded values". The six presets in
// src/modules/theme/theme.presets.ts are the starting points a school picks
// from, so the seed writes each one as a platform-level `Theme` (schoolId null,
// isSystem true) with its compiled token tree already stored.
//
// Compiling here rather than on first read means a fresh install can serve
// /api/v1/theme before anybody has opened the admin panel, and the tokens in the
// database are always the output of the same compiler the publish path uses.
//
// `School.activeThemeId` is a one-to-one relation, so a school cannot point at a
// shared platform preset — it owns its theme row. `seedSchoolTheme` creates that
// row for the demo school, which is also the shortest illustration of the
// white-label path: same components, different tokens.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, ThemeStatus } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { THEME_PRESETS, withDefaults, type ThemeShape } from '../../src/modules/theme/theme.presets';
import { compileTokens, type ThemeInput } from '../../src/modules/theme/theme.tokens';
import { log, step } from './helpers';

/** Key of the preset a school starts from unless it chooses another. */
export const BASE_THEME_KEY = 'midas-default';

/** Key used for the theme a school owns. One per school, so it never collides. */
export const SCHOOL_THEME_KEY = 'school-brand';

interface ThemeMeta {
  name: string;
  description: string;
  isSystem: boolean;
}

/**
 * Maps a compiler input onto the Theme columns. The first-class colour and type
 * columns exist so an admin panel can render a form without parsing the token
 * tree; `tokens` is the compiled output the client actually consumes. Both are
 * written from the same source here so they cannot disagree.
 */
function themeColumns(input: ThemeInput, meta: ThemeMeta, now: Date) {
  return {
    name: meta.name,
    description: meta.description,
    status: ThemeStatus.PUBLISHED,
    isSystem: meta.isSystem,
    ageMode: input.ageMode,
    colorPrimary: input.colorPrimary,
    colorSecondary: input.colorSecondary,
    colorAccent: input.colorAccent,
    colorSuccess: input.colorSuccess,
    colorWarning: input.colorWarning,
    colorDanger: input.colorDanger,
    colorSurface: input.colorSurface,
    colorBackground: input.colorBackground,
    colorTextBody: input.colorTextBody,
    colorTextMuted: input.colorTextMuted,
    fontHeading: input.fontHeading,
    fontBody: input.fontBody,
    fontBaseSize: input.fontBaseSize,
    radiusScale: input.radiusScale,
    densityScale: input.densityScale,
    reduceMotion: input.reduceMotion,
    highContrast: input.highContrast,
    tokens: compileTokens(input, now) as unknown as Prisma.InputJsonValue,
    publishedAt: now,
  };
}

/**
 * `@@unique([schoolId, key])` spans a nullable column and Prisma cannot express
 * `null` inside a compound unique `where`, so the row is located with findFirst
 * and then written by primary key. Version 1 is published alongside it, because
 * blueprint 17 wants every published theme to be evidenced by a version row.
 */
async function ensureTheme(
  scope: { schoolId: string | null; key: string },
  input: ThemeInput,
  meta: ThemeMeta,
  now: Date,
): Promise<string> {
  const columns = themeColumns(input, meta, now);
  const existing = await prisma.theme.findFirst({
    where: { schoolId: scope.schoolId, key: scope.key },
    select: { id: true },
  });

  const themeId = existing
    ? (await prisma.theme.update({ where: { id: existing.id }, data: columns })).id
    : (await prisma.theme.create({ data: { ...columns, schoolId: scope.schoolId, key: scope.key } }))
        .id;

  await prisma.themeVersion.upsert({
    where: { themeId_version: { themeId, version: 1 } },
    update: { tokens: columns.tokens, status: ThemeStatus.PUBLISHED, publishedAt: now },
    create: {
      themeId,
      version: 1,
      status: ThemeStatus.PUBLISHED,
      tokens: columns.tokens,
      changeSummary: 'Initial version written by the seed.',
      publishedAt: now,
    },
  });

  return themeId;
}

export async function seedBaseThemes(now: Date): Promise<void> {
  step('Base themes (blueprint 07)');
  for (const preset of THEME_PRESETS) {
    await ensureTheme(
      { schoolId: null, key: preset.key },
      { key: preset.key, ...preset.shape },
      { name: preset.name, description: preset.description, isSystem: false },
      now,
    );
  }
  // isSystem is set below rather than above so the flag lives in one statement:
  // every platform preset is read-only for tenants, without exception.
  await prisma.theme.updateMany({ where: { schoolId: null }, data: { isSystem: true } });
  log(`${THEME_PRESETS.length} system themes compiled and published`);
}

/** The demo school's own theme, derived from a preset with its brand colours. */
export async function seedSchoolTheme(
  schoolId: string,
  overrides: Partial<ThemeShape>,
  meta: ThemeMeta,
  now: Date,
): Promise<string> {
  const input = withDefaults(overrides, SCHOOL_THEME_KEY);
  return ensureTheme({ schoolId, key: SCHOOL_THEME_KEY }, input, meta, now);
}
