/**
 * Eine Quelle fuer alle Navigationen: Kopfzeile, App-Leiste, Umschalter,
 * Menue und Fusszeile greifen hier zu. Sonst laufen sie auseinander.
 */

export type Eintrag = {
  href: string
  /** Voller Name, im Umschalter und im Menue */
  label: string
  /** Kurzform fuer die App-Leiste, wo wenig Platz ist */
  kurz: string
}

/** Die Hauptbereiche. Sie liegen in der App-Leiste und im Umschalter. */
export const HAUPT: Eintrag[] = [
  { href: '/', label: 'Startseite', kurz: 'Start' },
  { href: '/hof', label: 'Der Hof', kurz: 'Hof' },
  { href: '/produkte', label: 'Produkte', kurz: 'Produkte' },
  { href: '/bio', label: 'Bio verstehen', kurz: 'Bio' },
  { href: '/hofladen', label: 'Direkt vom Hof', kurz: 'Hofladen' },
  { href: '/galerie', label: 'Galerie', kurz: 'Galerie' },
]

/** Alles Weitere. Das steckt hinter dem Menue. */
export const NEBEN: Eintrag[] = [
  { href: '/team', label: 'Team', kurz: 'Team' },
  { href: '/kontakt', label: 'Kontakt', kurz: 'Kontakt' },
  { href: '/referenzen', label: 'Referenzen', kurz: 'Referenzen' },
]

/** Rechtliches, nur in der Fusszeile und am Fuss des Menues. */
export const RECHTLICHES: Eintrag[] = [
  { href: '/impressum', label: 'Impressum', kurz: 'Impressum' },
  { href: '/datenschutz', label: 'Datenschutz', kurz: 'Datenschutz' },
]

/** Welcher Eintrag ist gerade offen? Unterseiten zaehlen zum Oberpunkt. */
export function istAktiv(href: string, pfad: string) {
  if (href === '/') return pfad === '/'
  return pfad === href || pfad.startsWith(href + '/')
}
