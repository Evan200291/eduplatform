// ─────────────────────────────────────────────────────────────────────────────
// Theme validation
//
// Two things are worth noting about the shapes below.
//
// First, `tokens` on a create or update is a *free-form overlay*, not the compiled
// tree. The compiler owns the tree; this field exists so a school can override one
// derived value (a chart palette, a mascot colour) without us adding a column for it.
// It is bounded in size because it is user-supplied JSON that ends up in every page.
//
// Second, publishing takes a change summary rather than nothing. A published theme
// becomes a version row, and a list of versions with no note beside them is a list
// nobody can roll back from with any confidence.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { AgeMode, ThemeStatus } from '@prisma/client';

import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  hexColor,
  idSchema,
  jsonValue,
  keySchema,
  optionalText,
  text,
} from '../../core/http/validate';

/** Matches the RADIUS_SCALE map in theme.tokens.ts. */
export const RADIUS_SCALES = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export const radiusScaleSchema = z.enum(RADIUS_SCALES);

/** Matches the DENSITY_SCALE map in theme.tokens.ts. */
export const DENSITY_SCALES = ['compact', 'comfortable', 'spacious'] as const;
export const densityScaleSchema = z.enum(DENSITY_SCALES);

/** Rejects a font stack smuggled into the family name, which would break the CSS. */
const fontName = text(120, 1).regex(
  /^[A-Za-z0-9 _-]+$/,
  'Use a single font family name: letters, numbers, spaces and dashes only',
);

/** The ten first-class colour columns on the Theme row. */
export const themeColours = z.object({
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorAccent: hexColor,
  colorSuccess: hexColor,
  colorWarning: hexColor,
  colorDanger: hexColor,
  colorSurface: hexColor,
  colorBackground: hexColor,
  colorTextBody: hexColor,
  colorTextMuted: hexColor,
});

/** Everything else the compiler reads. */
export const themePresentation = z.object({
  fontHeading: fontName,
  fontBody: fontName,
  fontBaseSize: z.coerce.number().int().min(12).max(24),
  radiusScale: radiusScaleSchema,
  densityScale: densityScaleSchema,
  reduceMotion: z.boolean(),
  highContrast: z.boolean(),
  ageMode: z.nativeEnum(AgeMode).nullable(),
});

/** The overlay. Depth is not restricted; total size is. */
export const tokenOverlaySchema = z
  .record(jsonValue)
  .refine(
    (value) => JSON.stringify(value).length <= 16_000,
    'Token overrides must be under 16KB — they are sent with every page load',
  );

export const createThemeSchema = z
  .object({
    name: text(120, 2),
    key: keySchema,
    description: optionalText(500),
    tokens: tokenOverlaySchema.optional(),
    logoMediaId: idSchema.optional(),
    faviconMediaId: idSchema.optional(),
    /** Copies every value from an existing theme, so a school starts from something real. */
    basedOnThemeId: idSchema.optional(),
  })
  .merge(themeColours.partial())
  .merge(themePresentation.partial())
  .strict();

export const updateThemeSchema = z
  .object({
    name: text(120, 2).optional(),
    description: optionalText(500),
    tokens: tokenOverlaySchema.nullable().optional(),
    logoMediaId: idSchema.nullable().optional(),
    faviconMediaId: idSchema.nullable().optional(),
  })
  .merge(themeColours.partial())
  .merge(themePresentation.partial())
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');

export const publishThemeSchema = z
  .object({
    changeSummary: text(500, 3),
    /** Publishing and switching the school onto it are usually the same intent. */
    activate: z.boolean().optional(),
  })
  .strict();

export const rollbackThemeSchema = z
  .object({
    version: z.coerce.number().int().min(1),
    changeSummary: optionalText(500),
  })
  .strict();

export const themeListQuery = listQuerySchema.extend({
  status: z.nativeEnum(ThemeStatus).optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  /** Platform base themes a school can copy but not edit. */
  includePlatformThemes: boolQuery(true),
  systemOnly: boolQuery(false),
});

/**
 * A preview compiles tokens without writing anything, so the editor can show the
 * result — and the contrast warnings — before a school commits to it.
 */
export const previewThemeSchema = z
  .object({ key: keySchema.optional(), tokens: tokenOverlaySchema.optional() })
  .merge(themeColours.partial())
  .merge(themePresentation.partial())
  .strict();

export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;
export type PublishThemeInput = z.infer<typeof publishThemeSchema>;
export type RollbackThemeInput = z.infer<typeof rollbackThemeSchema>;
export type PreviewThemeInput = z.infer<typeof previewThemeSchema>;
export type ThemeListQuery = z.infer<typeof themeListQuery>;
