import type { Config } from 'tailwindcss';

/**
 * Tailwind consumes the server-compiled `--midas-*` custom properties instead of
 * defining its own palette or scale. A school's branding is injected as CSS
 * variables before first paint (see `src/theme`), so every utility resolves to
 * live tenant tokens rather than hard-coded indigo, and age-mode scaling flows
 * through the same variables without new classes.
 *
 * Variable names below MUST match `backend/src/modules/theme/theme.tokens.ts`
 * (`tokensToCss` emits `--midas-{color,font,space,radius,shadow,motion,x}-{key}`).
 * Note the doubled segment in `--midas-font-font-body` — that is the real name,
 * because the typography group key is itself `font-body`.
 *
 * Caveat: token colours are opaque hex from the server, so Tailwind's slash
 * opacity modifiers (`bg-primary/50`) do not work on them. Use a `*-soft` /
 * `*-muted` token instead — that is what they exist for.
 */
const color = (key: string) => `var(--midas-color-${key})`;
const font = (key: string) => `var(--midas-font-${key})`;
const space = (key: string) => `var(--midas-space-${key})`;
const radius = (key: string) => `var(--midas-radius-${key})`;

/** The five brand families all expose the same derived ramp. */
const brandFamily = (name: string) => ({
  DEFAULT: color(name),
  soft: color(`${name}-soft`),
  muted: color(`${name}-muted`),
  strong: color(`${name}-strong`),
  contrast: color(`${name}-contrast`),
});

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: brandFamily('primary'),
        secondary: brandFamily('secondary'),
        accent: brandFamily('accent'),
        success: brandFamily('success'),
        warning: brandFamily('warning'),
        danger: brandFamily('danger'),
        surface: {
          DEFAULT: color('surface'),
          raised: color('surface-raised'),
          sunken: color('surface-sunken'),
        },
        canvas: color('background'),
        ink: {
          DEFAULT: color('text-body'),
          muted: color('text-muted'),
          'on-brand': color('text-on-brand'),
        },
        line: {
          DEFAULT: color('border'),
          strong: color('border-strong'),
        },
        focus: color('focus'),
        overlay: color('overlay'),
        /**
         * The fixed decorative set (see tokens.css). Use for rotating through
         * colours across a list of tiles, subject cards, avatars — anywhere the
         * colour is there to differentiate and delight rather than to carry
         * meaning. Never use these for state: success/warning/danger above are
         * the semantic tones, and a learner must not have to guess whether pink
         * means something.
         */
        play: {
          1: color('play-1'),
          '1-soft': color('play-1-soft'),
          2: color('play-2'),
          '2-soft': color('play-2-soft'),
          3: color('play-3'),
          '3-soft': color('play-3-soft'),
          4: color('play-4'),
          '4-soft': color('play-4-soft'),
          5: color('play-5'),
          '5-soft': color('play-5-soft'),
          6: color('play-6'),
          '6-soft': color('play-6-soft'),
        },
      },
      fontFamily: {
        sans: font('font-body'),
        heading: font('font-heading'),
      },
      fontSize: {
        xs: font('size-xs'),
        sm: font('size-sm'),
        base: font('size-base'),
        md: font('size-md'),
        lg: font('size-lg'),
        xl: font('size-xl'),
        '2xl': font('size-2xl'),
        '3xl': font('size-3xl'),
      },
      fontWeight: {
        normal: font('weight-body'),
        medium: font('weight-medium'),
        bold: font('weight-heading'),
      },
      lineHeight: {
        body: font('line-height-body'),
        heading: font('line-height-heading'),
      },
      letterSpacing: {
        heading: font('letter-spacing-heading'),
      },
      // Overrides Tailwind's fixed rem steps with density-scaled tokens, so
      // `p-4` tightens for ADULT and loosens for EARLY_YEARS automatically.
      spacing: {
        0: space('0'),
        1: space('1'),
        2: space('2'),
        3: space('3'),
        4: space('4'),
        6: space('6'),
        8: space('8'),
        12: space('12'),
        16: space('16'),
        gutter: space('page-gutter'),
        touch: space('touch-target'),
      },
      borderRadius: {
        none: radius('none'),
        sm: radius('sm'),
        DEFAULT: radius('md'),
        md: radius('md'),
        lg: radius('lg'),
        full: radius('pill'),
      },
      boxShadow: {
        sm: 'var(--midas-shadow-sm)',
        DEFAULT: 'var(--midas-shadow-md)',
        md: 'var(--midas-shadow-md)',
        lg: 'var(--midas-shadow-lg)',
      },
      transitionDuration: {
        fast: 'var(--midas-motion-duration-fast)',
        DEFAULT: 'var(--midas-motion-duration-base)',
        base: 'var(--midas-motion-duration-base)',
        slow: 'var(--midas-motion-duration-slow)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--midas-motion-easing-standard)',
        standard: 'var(--midas-motion-easing-standard)',
        emphasis: 'var(--midas-motion-easing-emphasis)',
      },
      minHeight: { touch: space('touch-target') },
      minWidth: { touch: space('touch-target') },
      outlineColor: { focus: color('focus') },
      ringColor: { focus: color('focus') },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
};

export default config;
