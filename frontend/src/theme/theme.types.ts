import type { AgeMode } from '@/types/enums';

/**
 * Theme wire types, mirrored from `backend/src/modules/theme/theme.tokens.ts`.
 *
 * The server compiles a school's brand into a token tree *and* the matching CSS
 * text. The client prefers the CSS (one string, applied atomically, no risk of
 * the two halves disagreeing) and uses the tree only where a value is needed in
 * JavaScript — chart colours, for instance.
 */

export interface TokenTree {
  meta: {
    themeKey: string;
    ageMode: AgeMode | null;
    generatedAt: string;
    tokenVersion: number;
  };
  color: Record<string, string>;
  typography: Record<string, string | number>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
  extra: Record<string, string>;
  overrides: Record<string, unknown> | null;
}

/** `GET /public/schools/:slug/theme` and `GET /themes/active`. */
export interface ResolvedTheme {
  themeId?: string | null;
  themeKey: string;
  tokens: TokenTree;
  css: string;
  /** True when the school has no published theme and the platform default is in use. */
  isFallback: boolean;
}

export interface ContrastWarning {
  pair: string;
  ratio: number;
  required: number;
  advice: string;
}

/** `POST /themes/preview` — compiles without persisting, for the editor. */
export interface ThemePreview {
  tokens: TokenTree;
  css: string;
  warnings: ContrastWarning[];
}

// ── Authoring (admin Branding screen) ───────────────────────────────────────

export type ThemeStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** The Theme row, mirrored from `backend/src/modules/theme/theme.service.ts` (`THEME_SELECT`). */
export interface ThemeRow {
  id: string;
  schoolId: string | null;
  name: string;
  key: string;
  description: string | null;
  status: ThemeStatus;
  isSystem: boolean;
  ageMode: AgeMode | null;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorSuccess: string;
  colorWarning: string;
  colorDanger: string;
  colorSurface: string;
  colorBackground: string;
  colorTextBody: string;
  colorTextMuted: string;
  fontHeading: string;
  fontBody: string;
  fontBaseSize: number;
  radiusScale: string;
  densityScale: string;
  reduceMotion: boolean;
  highContrast: boolean;
  tokens: TokenTree | null;
  logoMediaId: string | null;
  faviconMediaId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  createdById: string | null;
}

/** A theme plus everything the UI needs to render and judge it — the shape every theme endpoint returns. */
export interface ThemeDetail {
  theme: ThemeRow;
  /** A platform base theme (`schoolId === null`) — readable by every school, editable by none. */
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

export interface ThemeVersionRow {
  id: string;
  themeId: string;
  version: number;
  status: ThemeStatus;
  changeSummary: string | null;
  createdAt: string;
  publishedAt: string | null;
  createdById: string | null;
}

export interface PublishResult {
  theme: ThemeRow;
  version: ThemeVersionRow;
  tokens: TokenTree;
  css: string;
  warnings: ContrastWarning[];
  activated: boolean;
}
