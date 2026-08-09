'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/motion'
import FullscreenMenu from './FullscreenMenu'
import Logo from '@/components/ui/Logo'
import { HAUPT, istAktiv } from '@/data/navigation'

/**
 * Die Kopfzeile.
 *
 * Links die Wortmarke, in der Mitte die Hauptbereiche, rechts der Schalter
 * fuer alles Weitere. Beim Abwaertsscrollen faehrt sie weg, beim
 * Aufwaertsscrollen kommt sie zurueck — im Hero soll nichts vor dem Bild
 * stehen.
 *
 * Auf dem Telefon bleibt hier nur der Schalter: die Wortmarke steht dort
 * dauerhaft unten in der App-Leiste, zweimal waere sie zu viel.
 *
 * Zur Farbe: der Text liegt im Differenzmodus, damit er sowohl ueber dem
 * dunklen Video als auch ueber den hellen Abschnitten lesbar bleibt. Das
 * Logo ist davon ausgenommen — im Differenzmodus wuerde es seine Farben
 * verlieren. Es traegt ohnehin eine helle Fuellung mit dunkler Kontur und
 * steht auf beiden Untergruenden.
 */
export default function Nav() {
  const [offen, setOffen] = useState(false)
  const bar = useRef<HTMLElement>(null)
  const pfad = usePathname()

  /* Die Markierung des aktiven Bereichs erscheint erst nach dem Einhaengen.
     Grund: `usePathname` liefert auf dem Server den Routenpfad, im Browser
     dagegen die tatsaechliche Adresse. Liegt die Seite nicht unter `/` —
     etwa in einem Unterverzeichnis oder als einzelne Datei — weichen beide
     voneinander ab, und React verwirft den ganzen Teilbaum. */
  const [bereit, setBereit] = useState(false)
  useEffect(() => setBereit(true), [])

  useEffect(() => setOffen(false), [pfad])

  useEffect(() => {
    const el = bar.current
    if (!el || prefersReducedMotion()) return

    let letzte = window.scrollY
    let versteckt = false

    const onScroll = () => {
      const y = window.scrollY
      const runter = y > letzte && y > window.innerHeight * 0.4
      letzte = y

      if (runter && !versteckt) {
        versteckt = true
        gsap.to(el, { yPercent: -120, duration: 0.45, ease: 'power3.out' })
      } else if (!runter && versteckt) {
        versteckt = false
        gsap.to(el, { yPercent: 0, duration: 0.45, ease: 'power3.out' })
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header ref={bar} className="fixed inset-x-0 top-0 z-[90]">
        <div className="shell flex items-center justify-between gap-6 py-4">
          <div className="hidden lg:block">
            <Logo breite={168} priority />
          </div>

          <nav aria-label="Bereiche" className="hidden lg:block">
            <ul className="flex items-center gap-7">
              {HAUPT.filter((e) => e.href !== '/').map((e) => {
                const aktiv = bereit && istAktiv(e.href, pfad)
                return (
                  <li key={e.href}>
                    <Link
                      href={e.href}
                      aria-current={aktiv ? 'page' : undefined}
                      className="group relative block py-1 text-[0.95rem] mix-blend-difference"
                      style={{ color: 'var(--paper)' }}
                    >
                      {e.label}
                      <span
                        aria-hidden
                        className="absolute inset-x-0 -bottom-0.5 block h-px origin-left bg-current transition-transform duration-300 ease-[var(--ease-swift)] group-hover:scale-x-100"
                        style={{ transform: aktiv ? 'scaleX(1)' : 'scaleX(0)' }}
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Auf dem Telefon steht der Schalter allein rechts */}
          <div className="ml-auto lg:ml-0">
            <button
              type="button"
              onClick={() => setOffen((v) => !v)}
              aria-expanded={offen}
              aria-controls="hauptmenue"
              className="u-mono flex items-center gap-3 py-2 mix-blend-difference"
              style={{ color: 'var(--paper)' }}
            >
              <span>{offen ? 'Schließen' : 'Menü'}</span>
              <span aria-hidden className="relative block h-3 w-6">
                <span
                  className="absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-[var(--ease-swift)]"
                  style={{ top: 3, transform: offen ? 'translateY(3px) rotate(45deg)' : 'none' }}
                />
                <span
                  className="absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-[var(--ease-swift)]"
                  style={{ top: 9, transform: offen ? 'translateY(-3px) rotate(-45deg)' : 'none' }}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <FullscreenMenu open={offen} onClose={() => setOffen(false)} />
    </>
  )
}
