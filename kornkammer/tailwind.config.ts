import type { Config } from 'tailwindcss'

/**
 * Die Farb- und Typo-Werte leben als CSS-Variablen in app/globals.css.
 * Tailwind greift sie hier nur ab, damit es genau eine Quelle gibt.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './data/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        soil: 'var(--soil)',
        soilDeep: 'var(--soil-deep)',
        soilLift: 'var(--soil-lift)',
        paper: 'var(--paper)',
        paperWarm: 'var(--paper-warm)',
        wheat: 'var(--wheat)',
        wheatSoft: 'var(--wheat-soft)',
        clay: 'var(--clay)',
        field: 'var(--field)',
        stone: 'var(--stone)',
        hair: 'var(--hair)',
        hairDark: 'var(--hair-dark)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
        utility: 'var(--font-utility)',
      },
      fontSize: {
        mono: ['var(--fs-mono)', { lineHeight: '1.4', letterSpacing: '0.18em' }],
        body: ['var(--fs-body)', { lineHeight: '1.6' }],
        lead: ['var(--fs-lead)', { lineHeight: '1.45' }],
        h4: ['var(--fs-h4)', { lineHeight: '1.2' }],
        h3: ['var(--fs-h3)', { lineHeight: '1.12' }],
        h2: ['var(--fs-h2)', { lineHeight: '1.02' }],
        display: ['var(--fs-display)', { lineHeight: '0.92' }],
        colossal: ['var(--fs-colossal)', { lineHeight: '0.86' }],
      },
      maxWidth: {
        measure: 'var(--measure)',
        measureLead: 'var(--measure-lead)',
        shell: 'var(--shell)',
      },
      transitionTimingFunction: {
        expo: 'var(--ease-expo)',
        soft: 'var(--ease-soft)',
        swift: 'var(--ease-swift)',
      },
    },
  },
  plugins: [],
}

export default config
