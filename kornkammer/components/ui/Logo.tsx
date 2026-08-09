import Link from 'next/link'

/**
 * Die Wortmarke.
 *
 * Sie ist eine Rastergrafik mit Brot und Ähren, kein Schriftzug, den man
 * nachbauen koennte. Unterhalb von etwa 130 Pixeln Breite wird sie
 * matschig — deshalb ist `breite` bewusst ein Pflichtwert und nicht
 * beliebig klein zu waehlen.
 *
 * Das Original ist 600 × 186. Das Seitenverhaeltnis steht fest im
 * `height`-Attribut, damit beim Laden nichts springt.
 */

const VERHAELTNIS = 186 / 600

export function LogoBild({
  breite,
  className,
  priority = false,
  fluid = false,
}: {
  breite: number
  className?: string
  priority?: boolean
  /** Breite kommt vom Elternelement. `breite` bleibt als Seitenmass erhalten. */
  fluid?: boolean
}) {
  return (
    <img
      src="/logo/logo.webp"
      alt="Team Kornkammer"
      width={breite}
      height={Math.round(breite * VERHAELTNIS)}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={className}
      style={fluid ? { width: '100%', height: 'auto' } : { width: breite, height: 'auto' }}
    />
  )
}

/** Wortmarke als Verweis auf die Startseite. */
export default function Logo({
  breite = 168,
  className,
  priority = false,
}: {
  breite?: number
  className?: string
  priority?: boolean
}) {
  return (
    <Link
      href="/"
      aria-label="Team Kornkammer, zur Startseite"
      className={`inline-block transition-opacity duration-300 hover:opacity-80 ${className ?? ''}`}
    >
      <LogoBild breite={breite} priority={priority} />
    </Link>
  )
}
