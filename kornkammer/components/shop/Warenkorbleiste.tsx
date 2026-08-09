'use client'

import { useEffect, useRef, useState } from 'react'
import { useWarenkorb } from '@/lib/warenkorb'
import { preisText } from '@/data/shop'

/**
 * Die Leiste, die den Korb sichtbar haelt.
 *
 * Sie erscheint erst, wenn etwas drin liegt, und sitzt ueber der App-Leiste
 * des Telefons — deshalb der Abstand nach unten ueber `--leiste`. Bei jedem
 * Hinzufuegen macht sie einen kurzen Satz nach oben: das ist die Rueckmeldung,
 * die sonst fehlt, wenn der Knopf weit oben auf der Seite liegt.
 */
export default function Warenkorbleiste() {
  const { anzahlGesamt, summeCent, ohnePreis, oeffnen, bereit, puls } = useWarenkorb()
  const knopf = useRef<HTMLButtonElement>(null)
  const [huepft, setHuepft] = useState(false)

  useEffect(() => {
    if (puls === 0) return
    setHuepft(true)
    const timer = window.setTimeout(() => setHuepft(false), 420)
    return () => window.clearTimeout(timer)
  }, [puls])

  /* Vor dem Einlesen des gespeicherten Standes bleibt die Leiste weg. Sonst
     unterscheidet sich der erste Client-Renderdurchgang vom Server. */
  const sichtbar = bereit && anzahlGesamt > 0

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[85] flex justify-center px-4"
      style={{
        bottom: 'calc(var(--leiste) + env(safe-area-inset-bottom) + 0.75rem)',
      }}
    >
      <button
        ref={knopf}
        type="button"
        onClick={oeffnen}
        tabIndex={sichtbar ? 0 : -1}
        aria-hidden={!sichtbar}
        className="pointer-events-auto flex items-center gap-5 rounded-full bg-paper py-3.5 pl-6 pr-4 leading-none text-soil shadow-[0_10px_36px_rgba(0,0,0,0.45)] transition-[transform,opacity] duration-[420ms] ease-[var(--ease-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--wheat)]"
        style={{
          opacity: sichtbar ? 1 : 0,
          transform: sichtbar
            ? huepft
              ? 'translate3d(0,-0.5rem,0) scale(1.03)'
              : 'translate3d(0,0,0) scale(1)'
            : 'translate3d(0,1.5rem,0) scale(0.96)',
          pointerEvents: sichtbar ? 'auto' : 'none',
        }}
      >
        <span className="u-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
          Warenkorb
        </span>
        <span aria-hidden className="h-4 w-px bg-[rgba(20,16,9,0.25)]" />
        <span className="flex items-center gap-3">
          <span
            className="grid h-7 min-w-7 place-items-center rounded-full bg-soil px-2 text-[0.85rem] text-paper"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {anzahlGesamt}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {summeCent > 0 ? `${preisText(summeCent)}${ohnePreis ? ' +' : ''}` : 'ansehen'}
          </span>
        </span>
      </button>
    </div>
  )
}
