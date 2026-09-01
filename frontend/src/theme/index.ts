export { ThemeProvider } from './ThemeProvider';
export { ThemeContext, useAgeMode, useTheme, type ThemeContextValue } from './theme-context';
export {
  AGE_MODE_LABELS,
  DEFAULT_AGE_MODE,
  ageAtLeast,
  ageBelow,
  applyAgeMode,
  isAgeMode,
  isYoungLearner,
  itemsPerRow,
} from './age-mode';
export { chartSeriesColors, readColor, readPx, readToken } from './css-var';
export {
  TEXT_SCALES,
  TEXT_SCALE_LABELS,
  applyPreferences,
  usePreferences,
  type MotionPreference,
  type Preferences,
  type TextScale,
} from './preferences';
export { rememberSchoolSlug, resolveSchoolSlug } from './school-slug';
export { applyThemeCss, clearThemeCss, loadThemeStylesheet, themeStylesheetUrl } from './stylesheet';
export {
  fetchActiveTheme,
  fetchPublicTheme,
  fetchThemeOptions,
  previewTheme,
  tokenColor,
  type ThemeOptions,
} from './theme.api';
export type {
  ContrastWarning,
  ResolvedTheme,
  ThemePreview,
  TokenTree,
} from './theme.types';
