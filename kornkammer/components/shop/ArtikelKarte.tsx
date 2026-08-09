'use client'

import { useState } from 'react'
import { useWarenkorb } from '@/lib/warenkorb'
import { grundpreisText, preisText, type Artikel } from '@/data/shop'
import Mengenwahl from './Mengenwahl'
import Artikelbild from './Artikelbild'

/**
 * Ein Artikel im Sortiment.
 *
 * Kein Kasten mit Schlagschatten und Radius — das ist der Look, den die Seite
 * ueberall sonst vermeidet. Stattdessen Bild, Haarlinie, Text. Was den Artikel
 * anfassbar macht, ist die Bewegung: Das Bild zieht beim Zeigen langsam auf,
 * der Knopf wechselt seine Beschriftung, sobald etwas im Korb liegt.
 *
 * Fehlt der Preis, heisst der Knopf „Auf die Anfrageliste“ statt „In den
 * Warenkorb“. Das ist kein Notbehelf, sondern die ehrliche Beschriftung:
 * ohne Preis kann man nichts kaufen, wohl aber anfragen.
 */
export default function ArtikelKarte({ artikel }: { artikel: Artikel }) {
  const { positionen, hinzu, setzen } = useWarenkorb()
  const [gewaehlt, setGewaehlt] = useState(artikel.varianten[0]?.id ?? '')

  const v = artikel.varianten.find((x) => x.id === gewaehlt) ?? artikel.varianten[0]
  const imKorb = positionen.find((p) => p.id === v?.id)?.anzahl ?? 0
  const preis = preisText(v?.preisCent)
  const grundpreis = v ? grundpreisText(v) : null

  if (!v) return null

  return (
    <article className="group flex flex-col">
      <div className="relative overflow-hidden bg-soilDeep">
        <Artikelbild
          src={artikel.bild}
          alt={artikel.bildAlt}
          className="aspect-[4/3] w-full object-cover transition-transform duration-[900ms] ease-[var(--ease-soft)] group-hover:scale-[1.04]"
        />
        {imKorb > 0 && (
          <p
            className="u-mono absolute right-0 top-0 bg-[var(--wheat)] px-3 py-2 text-[color:var(--soil)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {imKorb} im Korb
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-1 flex-col border-t border-[var(--hair)] pt-5">
        <h3 className="text-h4 leading-[1.15]">{artikel.name}</h3>
        <p className="mt-3 max-w-[34ch] flex-1 text-[color:var(--stone)]">{artikel.kurz}</p>

        {/* Gebinde. Erst ab zwei Groessen ist eine Wahl noetig. */}
        {artikel.varianten.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Gebindegröße">
            {artikel.varianten.map((opt) => {
              const aktiv = opt.id === v.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGewaehlt(opt.id)}
                  aria-pressed={aktiv}
                  className={`u-mono border px-3 py-2 transition-colors duration-200 ${
                    aktiv
                      ? 'border-current bg-[var(--paper)] text-[color:var(--soil)]'
                      : 'border-[var(--hair-strong)] hover:border-current'
                  }`}
                >
                  {opt.gebinde ?? 'Gebinde offen'}
                </button>
              )
            })}
          </div>
        ) : (
          v.gebinde && <p className="u-mono mt-5 text-[color:var(--stone)]">{v.gebinde}</p>
        )}

        {/* Preis */}
        <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-[var(--hair)] pt-4">
          {preis ? (
            <p className="text-lead" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {preis}
            </p>
          ) : (
            <p className="u-mono text-[color:var(--clay)]">Preis auf Anfrage</p>
          )}
          {grundpreis && <p className="u-mono text-[color:var(--stone)]">{grundpreis}</p>}
        </div>

        {/* Handlung */}
        <div className="mt-5">
          {imKorb > 0 ? (
            <Mengenwahl anzahl={imKorb} onSetzen={(n) => setzen(v.id, n)} label={artikel.name} />
          ) : (
            <button
              type="button"
              onClick={() => hinzu(v.id)}
              className="group/knopf inline-flex items-center gap-3 rounded-full bg-paper px-6 py-3 text-[0.95rem] leading-none text-soil transition-colors duration-300 ease-[var(--ease-swift)] hover:bg-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--wheat)]"
            >
              <span>{preis ? 'In den Warenkorb' : 'Auf die Anfrageliste'}</span>
              <span
                aria-hidden
                className="transition-transform duration-300 ease-[var(--ease-swift)] group-hover/knopf:translate-x-1"
              >
                +
              </span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
