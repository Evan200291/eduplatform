import { createContext, useContext } from 'react';
import type { AgeMode } from '@/types/enums';
import { DEFAULT_AGE_MODE } from './age-mode';

export interface ThemeContextValue {
  /** The school whose branding is applied, or null on the platform default. */
  schoolSlug: string | null;
  /** Effective age mode: user override, else school default, else platform default. */
  ageMode: AgeMode;
  /** False until the branding stylesheet has settled, so callers can hold paint. */
  isReady: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  schoolSlug: null,
  ageMode: DEFAULT_AGE_MODE,
  isReady: false,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Convenience for the common case of branching on the learner's age band. */
export function useAgeMode(): AgeMode {
  return useContext(ThemeContext).ageMode;
}
