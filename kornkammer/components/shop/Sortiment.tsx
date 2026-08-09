'use client'

import { useMemo, useState } from 'react'
import Reveal from '@/components/motion/Reveal'
import { ARTIKEL, GRUPPEN } from '@/data/shop'
import ArtikelKarte from './ArtikelKarte'

/**
 * Das Sortiment mit Filter.
 *
 * Der Filter arbeitet ohne Nachladen und ohne Sprung: die Liste wird nicht
 * ausgetauscht, sondern gefiltert, und die verbleibenden Karten treten mit
 * kurzem Versatz wieder ein. Deshalb der Schluessel am Gitter — er stoesst
 * die Eintrittsanimation bei jedem Wechsel neu an.
 */
export default function Sortiment() {
  const [gruppe, setGruppe] = useState<string | null>(null)

  const liste = useMemo(
    () => (gruppe ? ARTIKEL.filter((a) => a.gruppe === gruppe) : ARTIKEL),
    [gruppe],
  )

  const filter = [{ label: 'Alles', wert: null }, ...GRUPPEN.map((g) => ({ label: g, wert: g }))]

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Sortiment nach Gruppe filtern">
        {filter.map((f) => {
          const aktiv = f.wert === gruppe
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setGruppe(f.wert)}
              aria-pressed={aktiv}
              className={`u-mono rounded-full border px-4 py-2.5 transition-colors duration-300 ease-[var(--ease-swift)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--wheat)] ${
                aktiv
                  ? 'border-transparent bg-paper text-soil'
                  : 'border-[var(--hair-strong)] hover:border-current'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <p className="u-mono mt-6 text-[color:var(--stone)]" aria-live="polite">
        {liste.length} Artikel
      </p>

      <div
        key={gruppe ?? 'alles'}
        className="mt-8 grid grid-cols-1 gap-x-[clamp(1.5rem,4vw,3rem)] gap-y-[clamp(2.5rem,6vw,4rem)] sm:grid-cols-2 lg:grid-cols-3"
      >
        {liste.map((artikel, i) => (
          <Reveal key={artikel.slug} delay={Math.min(i, 5) * 0.05}>
            <ArtikelKarte artikel={artikel} />
          </Reveal>
        ))}
      </div>
    </div>
  )
}
