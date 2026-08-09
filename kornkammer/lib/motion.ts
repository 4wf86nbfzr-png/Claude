/**
 * Ein Motion-System fuer die ganze Seite.
 * Keine Sektion definiert eigene Dauern oder Kurven — sonst laufen sie
 * auseinander und die Seite wirkt zusammengesetzt statt komponiert.
 */

export const MOTION = {
  /** Reveals: lang genug, dass die Bewegung Gewicht bekommt */
  reveal: { duration: 1.05, ease: 'expo.out' },
  /** Deckkraft laeuft weicher als Bewegung, sonst blitzt es */
  fade: { duration: 0.9, ease: 'power2.out' },
  /** Zeilenweise Staffelung */
  stagger: 0.09,
  staggerTight: 0.045,
  /** Bild: startet leicht zu gross und beruhigt sich */
  imageScale: { from: 1.08, to: 1 },
  /** Parallax bleibt unter zwoelf Prozent Versatz */
  parallax: 0.1,
  /** Seitenwechsel bleibt kurz */
  page: { duration: 0.55, ease: 'expo.inOut' },
  /** Bedienelemente */
  ui: { duration: 0.4, ease: 'power3.out' },
} as const

/** Einheitliche Startpunkte fuer ScrollTrigger */
export const TRIGGER = {
  /** Standard: das Element ist zu einem guten Teil im Bild */
  enter: 'top 82%',
  enterLate: 'top 70%',
  /** Fuer gepinnte Abschnitte */
  pinStart: 'top top',
} as const

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
