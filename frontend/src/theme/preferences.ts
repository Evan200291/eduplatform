import { create } from 'zustand';

/**
 * Per-user accessibility preferences.
 *
 * These sit *on top of* the school's theme: the school decides the brand, the
 * learner decides how big the text is and whether things move. Stored in
 * `localStorage` because they are display preferences, not credentials — no
 * token or profile data goes near this key.
 *
 * Each preference is applied as a CSS variable or a `data-*` attribute on
 * `<html>`, so styling reacts through the cascade instead of prop threading.
 */

export const TEXT_SCALES = [1, 1.15, 1.3, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export type MotionPreference = 'system' | 'reduced' | 'full';

export interface Preferences {
  textScale: TextScale;
  motion: MotionPreference;
  highContrast: boolean;
}

const STORAGE_KEY = 'midas.preferences.v1';

const DEFAULTS: Preferences = {
  textScale: 1,
  motion: 'system',
  highContrast: false,
};

function read(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      textScale: TEXT_SCALES.includes(parsed.textScale as TextScale)
        ? (parsed.textScale as TextScale)
        : DEFAULTS.textScale,
      motion:
        parsed.motion === 'reduced' || parsed.motion === 'full' ? parsed.motion : DEFAULTS.motion,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    // A corrupt or blocked storage entry must never stop the app from rendering.
    return DEFAULTS;
  }
}

function persist(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing or a full quota: the session still works, it just forgets.
  }
}

/** Writes preferences into the document so CSS can respond. */
export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.style.setProperty('--midas-user-text-scale', String(preferences.textScale));
  root.dataset.motion = preferences.motion;
  root.dataset.contrast = preferences.highContrast ? 'high' : 'normal';
}

interface PreferencesState extends Preferences {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
}

export const usePreferences = create<PreferencesState>((setState, getState) => {
  const initial = read();
  applyPreferences(initial);

  return {
    ...initial,

    set(key, value) {
      setState({ [key]: value } as Partial<PreferencesState>);
      const { textScale, motion, highContrast } = getState();
      const next = { textScale, motion, highContrast };
      applyPreferences(next);
      persist(next);
    },

    reset() {
      setState({ ...DEFAULTS });
      applyPreferences(DEFAULTS);
      persist(DEFAULTS);
    },
  };
});

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  1: 'Default',
  1.15: 'Large',
  1.3: 'Larger',
  1.5: 'Largest',
};
