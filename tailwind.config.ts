import type { Config } from 'tailwindcss';

/**
 * Kindora — Tailwind config
 * v1.1 · Reads from tokens.css. Don't hardcode brand values here.
 * If you need a new color/size, add it to tokens.css first, then expose it below.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1280px', // cap at content-max — no ultrawide blowout
      },
    },
    extend: {
      colors: {
        // Brand
        clover: {
          DEFAULT: 'var(--color-clover)',
          dark:    'var(--color-clover-dark)',
          soft:    'var(--color-clover-soft)',
        },
        apricot: 'var(--color-apricot)',

        // Neutrals
        ink:     'var(--color-ink)',
        shell:   'var(--color-shell)',
        surface: 'var(--color-surface)',
        line:    'var(--color-line)',
        mute:    'var(--color-mute)',

        // Semantic
        bg: {
          page:    'var(--bg-page)',
          surface: 'var(--bg-surface)',
          brand:   'var(--bg-brand)',
          'brand-soft': 'var(--bg-brand-soft)',
          accent:  'var(--bg-accent)',
        },
        fg: {
          DEFAULT:     'var(--fg-default)',
          muted:       'var(--fg-muted)',
          'on-brand':  'var(--fg-on-brand)',
          'on-accent': 'var(--fg-on-accent)',
          brand:       'var(--fg-brand)',
          accent:      'var(--fg-accent)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          focus:   'var(--border-focus)',
        },
        status: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          error:   'var(--color-error)',
          info:    'var(--color-info)',
        },

        // Legacy compatibility aliases (Famly-era names). Previously
        // undefined — bg-sage/bg-sky/bg-gold/bg-terra etc. emitted NO CSS,
        // which made primary CTAs invisible. Mapped onto the Clover family
        // via tokens.css. Don't use in new code; don't mass-refactor old
        // usages (Phase 6 cleanup).
        sage: {
          DEFAULT: 'var(--sage)',
          light:   'var(--sage-light)',
          pale:    'var(--sage-pale)',
        },
        sky: {
          DEFAULT: 'var(--sky)',
          light:   'var(--sky-light)',
          pale:    'var(--sky-pale)',
        },
        gold: {
          DEFAULT: 'var(--gold)',
          dark:    'var(--gold-dark)',
          pale:    'var(--gold-pale)',
        },
        terra: {
          DEFAULT: 'var(--terra)',
          light:   'var(--terra-light)',
          pale:    'var(--terra-pale)',
        },
        cream:    'var(--cream)',
        charcoal: 'var(--charcoal)',
        mid:      'var(--mid)',
      },

      fontFamily: {
        display: ['var(--font-display)'],
        sans:    ['var(--font-body)'],
        mono:    ['var(--font-mono)'],
      },

      fontSize: {
        'display-hero': ['var(--text-display-hero)', { lineHeight: 'var(--leading-display)', letterSpacing: 'var(--tracking-display)' }],
        heading: ['var(--text-heading)', { lineHeight: 'var(--leading-heading)' }],
        lg:      ['var(--text-lg)',      { lineHeight: 'var(--leading-body)' }],
        base:    ['var(--text-base)',    { lineHeight: 'var(--leading-body)' }],
        ui:      ['var(--text-ui)',      { lineHeight: 'var(--leading-ui)' }],
        caption: ['var(--text-caption)', { lineHeight: 'var(--leading-caption)' }],
      },

      letterSpacing: {
        display: 'var(--tracking-display)',
        tight:   'var(--tracking-tight)',
        normal:  'var(--tracking-normal)',
        wide:    'var(--tracking-wide)',
      },

      fontWeight: {
        normal:   'var(--weight-regular)',
        medium:   'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold:     'var(--weight-bold)',
      },

      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },

      boxShadow: {
        xs:    'var(--shadow-xs)',
        sm:    'var(--shadow-sm)',
        md:    'var(--shadow-md)',
        lg:    'var(--shadow-lg)',
        xl:    'var(--shadow-xl)',
        focus: 'var(--shadow-focus)',
      },

      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        out:      'var(--ease-out)',
        in:       'var(--ease-in)',
      },

      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },

      maxWidth: {
        'content-narrow': 'var(--content-narrow)',
        'content-base':   'var(--content-base)',
        'content-wide':   'var(--content-wide)',
        'content-max':    'var(--content-max)',
      },

      zIndex: {
        base:    'var(--z-base)',
        sticky:  'var(--z-sticky)',
        overlay: 'var(--z-overlay)',
        modal:   'var(--z-modal)',
        toast:   'var(--z-toast)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise':    { from: { opacity: '0', transform: 'translateY(8px)' },
                     to:   { opacity: '1', transform: 'translateY(0)' } },
        'pop':     { '0%':   { transform: 'scale(0.96)', opacity: '0' },
                     '60%':  { transform: 'scale(1.01)' },
                     '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-base) var(--ease-out) both',
        'rise':    'rise var(--duration-slow) var(--ease-out) both',
        'pop':     'pop var(--duration-base) var(--ease-out) both',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({ strategy: 'class' }),
    require('@tailwindcss/typography'),
  ],
};

export default config;
