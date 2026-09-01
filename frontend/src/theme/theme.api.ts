import { apiDelete, apiGet, apiGetPaged, apiPatch, apiPost } from '@/api';
import type { Paginated } from '@/api/types';
import type {
  PublishResult,
  ResolvedTheme,
  ThemeDetail,
  ThemePreview,
  ThemeVersionRow,
  TokenTree,
} from './theme.types';

/**
 * Theme endpoints.
 *
 * The public pair needs no token and no `theme.read` permission, which matters:
 * students are not granted `theme.read`, so learner branding must come from the
 * public route. `/themes/*` is the authoring surface for admins.
 */

/** Unauthenticated: the branding for a school slug, platform default if unknown. */
export function fetchPublicTheme(slug: string): Promise<ResolvedTheme> {
  return apiGet<ResolvedTheme>(`/public/schools/${encodeURIComponent(slug)}/theme`);
}

/** Requires `theme.read`. The compiled theme currently live for the school. */
export function fetchActiveTheme(): Promise<ResolvedTheme> {
  return apiGet<ResolvedTheme>('/themes/active');
}

export interface ThemeOptions {
  presets: unknown[];
  defaults: Record<string, unknown>;
  radiusScales: string[];
  densityScales: string[];
  contrastTargets: { pair: string; minimum: number; standard: string }[];
  note: string;
}

/** Requires `theme.read`. Presets, allowed scales and the contrast targets. */
export function fetchThemeOptions(): Promise<ThemeOptions> {
  return apiGet<ThemeOptions>('/themes/options');
}

/**
 * Requires `theme.write`. Compiles without persisting so the editor can show the
 * result *and* its contrast warnings before anyone commits.
 */
export function previewTheme(input: Record<string, unknown>): Promise<ThemePreview> {
  return apiPost<ThemePreview>('/themes/preview', input);
}

/** Reads a token value in JavaScript, for cases CSS cannot cover (chart series). */
export function tokenColor(tokens: TokenTree | null, key: string, fallback = '#4f46e5'): string {
  return tokens?.color[key] ?? fallback;
}

// ── Authoring (admin Branding screen, requires `theme.write`) ──────────────
//
// Every theme endpoint below returns a `ThemeDetail` — the row plus derived flags
// (`isEditable`, `isActiveForSchool`) and the compiled `draft`/`published` trees — not
// a bare row. See `backend/src/modules/theme/theme.service.ts` (`detail()`).

export function fetchThemes(query?: Record<string, unknown>): Promise<Paginated<ThemeDetail>> {
  return apiGetPaged<ThemeDetail>('/themes', query);
}

export function fetchTheme(themeId: string): Promise<ThemeDetail> {
  return apiGet<ThemeDetail>(`/themes/${encodeURIComponent(themeId)}`);
}

/**
 * `name` and `key` are required; colours are the individual `colorPrimary` /
 * `colorSecondary` / … fields (`backend/src/modules/theme/theme.validation.ts`),
 * not a nested overrides object.
 */
export function createTheme(input: Record<string, unknown>): Promise<ThemeDetail> {
  return apiPost<ThemeDetail>('/themes', input);
}

export function updateTheme(themeId: string, input: Record<string, unknown>): Promise<ThemeDetail> {
  return apiPatch<ThemeDetail>(`/themes/${encodeURIComponent(themeId)}`, input);
}

export function archiveTheme(themeId: string): Promise<ThemeDetail> {
  return apiPost<ThemeDetail>(`/themes/${encodeURIComponent(themeId)}/archive`);
}

export function restoreTheme(themeId: string): Promise<ThemeDetail> {
  return apiPost<ThemeDetail>(`/themes/${encodeURIComponent(themeId)}/restore`);
}

/** Moves a draft to Published — pass `activate: true` to also make it the live theme. */
export function publishTheme(
  themeId: string,
  input: { changeSummary: string; activate?: boolean },
): Promise<PublishResult> {
  return apiPost<PublishResult>(`/themes/${encodeURIComponent(themeId)}/publish`, input);
}

/** Makes an already-published theme the school's live one. */
export function activateTheme(
  themeId: string,
): Promise<{ activeThemeId: string; tokens: TokenTree; css: string }> {
  return apiPost(`/themes/${encodeURIComponent(themeId)}/activate`);
}

export function rollbackTheme(
  themeId: string,
  version: number,
  changeSummary?: string,
): Promise<PublishResult> {
  return apiPost<PublishResult>(`/themes/${encodeURIComponent(themeId)}/rollback`, {
    version,
    changeSummary,
  });
}

export function fetchThemeVersions(themeId: string): Promise<Paginated<ThemeVersionRow>> {
  return apiGetPaged<ThemeVersionRow>(`/themes/${encodeURIComponent(themeId)}/versions`);
}

/** Deactivates the school's live theme, falling back to the platform default. */
export function deactivateTheme(): Promise<void> {
  return apiDelete('/themes/active');
}
