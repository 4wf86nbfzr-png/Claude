'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LogoBild } from '@/components/ui/Logo'
import FieldLine from '@/components/ui/FieldLine'
import { HAUPT, istAktiv } from '@/data/navigation'

/**
 * DIE APP-LEISTE (nur auf dem Telefon)
 *
 * Sie steht fest am unteren Rand, weil dort der Daumen liegt. Links das
 * Logo, rechts daneben die Reiter.
 *
 * Das Logo ist zugleich der Umschalter: ein Tipp darauf faehrt eine Liste
 * mit allen Bereichen aus. Die Reiter in der Leiste zeigen davon nur so
 * viele, wie nebeneinander passen — der Rest ist ueber den Umschalter
 * erreichbar, und die Reihe laesst sich zusaetzlich schieben.
 *
 * Warum das Logo so breit ist: die Wortmarke ist eine Rastergrafik. Unter
 * etwa 130 Pixeln zerfaellt der Schriftzug. Lieber ein breiter Knopf als
 * ein unleserliches Markenzeichen.
 */
export default function AppBar() {
  const pfad = usePathname()
  const [offen, setOffen] = useState(false)

  /* Aktiv-Markierung erst nach dem Einhaengen, siehe Kommentar in Nav.tsx:
     `usePathname` weicht zwischen Server und Browser ab, sobald die Seite
     nicht unter `/` liegt. */
  const [bereit, setBereit] = useState(false)
  useEffect(() => setBereit(true), [])
  const leiste = useRef<HTMLDivElement>(null)
  const reihe = useRef<HTMLDivElement>(null)

  /* Beim Seitenwechsel schliessen. */
  useEffect(() => setOffen(false), [pfad])

  /* Escape schliesst, wie im Menue auch. */
  useEffect(() => {
    if (!offen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOffen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [offen])

  /* Den aktiven Reiter ins Bild schieben, sonst steht man vor einer
     Reihe, in der der eigene Bereich unsichtbar links liegt. */
  useEffect(() => {
    const r = reihe.current
    if (!r) return
    const aktiv = r.querySelector('[data-aktiv="true"]') as HTMLElement | null
    if (!aktiv) return
    // Abstand echt messen statt ueber offsetLeft: dessen Bezugspunkt ist der
    // naechste positionierte Vorfahr — das ist die fixierte Leiste samt Logo,
    // nicht die Reihe. Damit scrollte sie um die Logobreite zu weit.
    const versatz = aktiv.getBoundingClientRect().left - r.getBoundingClientRect().left
    r.scrollTo({ left: Math.max(0, r.scrollLeft + versatz - 12), behavior: 'smooth' })
  }, [pfad])

  const aktuell = bereit ? HAUPT.find((e) => istAktiv(e.href, pfad)) : undefined

  return (
    <>
      {/* Umschalter. Faehrt ueber der Leiste aus. */}
      <div
        id="bereichswechsel"
        className="fixed inset-x-0 bottom-0 z-[70] lg:hidden"
        style={{
          transform: offen ? 'translateY(0)' : 'translateY(101%)',
          transition: 'transform .5s var(--ease-expo)',
          pointerEvents: offen ? 'auto' : 'none',
          paddingBottom: 'calc(var(--leiste) + env(safe-area-inset-bottom, 0px))',
        }}
        aria-hidden={!offen}
      >
        <div className="border-t border-[var(--hair)] bg-soilDeep px-[var(--gutter)] pb-5 pt-6">
          <p className="u-mono text-[color:var(--stone)]">Bereich wechseln</p>
          <ul className="mt-4 flex flex-col">
            {HAUPT.map((e) => {
              const aktiv = bereit && istAktiv(e.href, pfad)
              return (
                <li key={e.href} className="border-b border-[var(--hair)] last:border-b-0">
                  <Link
                    href={e.href}
                    tabIndex={offen ? 0 : -1}
                    aria-current={aktiv ? 'page' : undefined}
                    className="flex items-baseline justify-between gap-4 py-3.5"
                    style={{ color: aktiv ? 'var(--wheat)' : undefined }}
                  >
                    <span className="font-display text-h4 leading-none">{e.label}</span>
                    {aktiv && <span className="u-mono text-wheat">hier</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
          <FieldLine className="mt-5" animate={false} tone="wheat" />
        </div>
      </div>

      {/* Die Leiste selbst */}
      <div
        ref={leiste}
        className="fixed inset-x-0 bottom-0 z-[80] border-t border-[var(--hair)] bg-soilDeep lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <nav
          aria-label="Bereiche, Leiste am unteren Rand"
          className="flex items-center gap-1"
          style={{ height: 'var(--leiste)' }}
        >
          {/* Logo als Umschalter */}
          <button
            type="button"
            onClick={() => setOffen((v) => !v)}
            aria-expanded={offen}
            aria-controls="bereichswechsel"
            className="flex shrink-0 items-center gap-2 border-r border-[var(--hair)] py-2 pl-[var(--gutter)] pr-3"
          >
            <span className="block w-[112px] min-[360px]:w-[132px]">
              <LogoBild breite={132} priority fluid />
            </span>
            <span className="sr-only">
              {offen ? 'Bereichswechsel schließen' : 'Bereich wechseln'}
            </span>
            <span
              aria-hidden
              className="block text-[color:var(--stone)] transition-transform duration-300 ease-[var(--ease-swift)]"
              style={{ transform: offen ? 'rotate(180deg)' : 'none', fontSize: '0.7rem' }}
            >
              ▲
            </span>
          </button>

          {/* Reiter */}
          <div
            ref={reihe}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-[var(--gutter)]"
            style={{ scrollbarWidth: 'none' }}
          >
            {HAUPT.filter((e) => e.href !== '/').map((e) => {
              const aktiv = bereit && istAktiv(e.href, pfad)
              return (
                <Link
                  key={e.href}
                  href={e.href}
                  data-aktiv={aktiv}
                  aria-current={aktiv ? 'page' : undefined}
                  className="relative shrink-0 whitespace-nowrap px-3 py-3 text-[0.82rem] leading-none transition-colors duration-300"
                  style={{ color: aktiv ? 'var(--wheat)' : 'var(--chrome, var(--paper))' }}
                >
                  {e.kurz}
                  <span
                    aria-hidden
                    className="absolute inset-x-3 bottom-1.5 block h-px origin-left transition-transform duration-300 ease-[var(--ease-swift)]"
                    style={{
                      background: 'var(--wheat)',
                      transform: aktiv ? 'scaleX(1)' : 'scaleX(0)',
                    }}
                  />
                </Link>
              )
            })}
          </div>
        </nav>
      </div>

      {/* Nur fuer Vorlesewerkzeuge: wo bin ich gerade? */}
      <span className="sr-only" aria-live="polite">
        {aktuell ? `Bereich ${aktuell.label}` : ''}
      </span>
    </>
  )
}
