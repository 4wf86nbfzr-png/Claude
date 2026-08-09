'use client'

import { useEffect, useRef } from 'react'
import { useWarenkorb } from '@/lib/warenkorb'
import { preisText, variante } from '@/data/shop'
import { FARM } from '@/data/farm'
import Mengenwahl from './Mengenwahl'
import Artikelbild from './Artikelbild'

/**
 * Der Warenkorb als Schublade.
 *
 * Sie faehrt von rechts ein, auf dem Telefon von unten. Bedienung mit der
 * Tastatur ist Pflicht: Fokus wandert beim Oeffnen hinein, Escape schliesst,
 * und der Fokus bleibt in der Schublade, solange sie offen ist.
 *
 * Der Abschluss ist bewusst kein Bezahlvorgang. Ein Zahlungsweg braucht
 * Impressumspflichten, Widerrufsbelehrung, AGB und einen Zahlungsdienstleister —
 * das kann eine Oberflaeche nicht vortaeuschen. Stattdessen entsteht aus dem
 * Korb eine fertige Bestellmail an den Hof. Wer versenden lassen will, geht
 * ueber den bestehenden Onlineshop; der Knopf dafuer steht daneben.
 */
export default function WarenkorbSchublade() {
  const { positionen, offen, schliessen, setzen, entfernen, leeren, summeCent, ohnePreis } =
    useWarenkorb()
  const panel = useRef<HTMLDivElement>(null)
  const schliesser = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!offen) return
    schliesser.current?.focus()

    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        schliessen()
        return
      }
      if (e.key !== 'Tab') return

      /* Fokusfalle. Ohne sie tabbt man aus der Schublade heraus in eine
         Seite, die man nicht sieht. */
      const el = panel.current
      if (!el) return
      const ziele = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!ziele.length) return
      const erste = ziele[0]
      const letzte = ziele[ziele.length - 1]

      if (e.shiftKey && document.activeElement === erste) {
        e.preventDefault()
        letzte.focus()
      } else if (!e.shiftKey && document.activeElement === letzte) {
        e.preventDefault()
        erste.focus()
      }
    }

    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [offen, schliessen])

  const zeilen = positionen
    .map((p) => {
      const treffer = variante(p.id)
      return treffer ? { ...p, artikel: treffer.artikel, v: treffer.variante } : null
    })
    .filter((z): z is NonNullable<typeof z> => z !== null)

  /* Die Bestellmail. Der Betreff nennt den Hof, der Rumpf listet die Ware in
     einer Form, die man ausdrucken und abhaken kann. */
  const mailto = (() => {
    const zeilenText = zeilen.map((z) => {
      const gebinde = z.v.gebinde ? ` (${z.v.gebinde})` : ''
      return `${z.anzahl} x ${z.artikel.name}${gebinde}`
    })
    const rumpf = [
      'Moin,',
      '',
      'ich möchte Folgendes bestellen:',
      '',
      ...zeilenText,
      '',
      ohnePreis
        ? 'Zu einzelnen Posten ist noch kein Preis hinterlegt. Bitte nennen Sie mir den Preis, bevor Sie zurücklegen.'
        : `Summe nach den Angaben auf der Website: ${preisText(summeCent)}`,
      '',
      'Abholung am Hof:',
      'Name:',
      'Telefon:',
      'Wunschtermin:',
      '',
      'Viele Grüße',
    ].join('\n')

    return `${FARM.email.href}?subject=${encodeURIComponent(
      'Bestellung ab Hof',
    )}&body=${encodeURIComponent(rumpf)}`
  })()

  return (
    <div
      className="fixed inset-0 z-[98]"
      /* `visibility` nimmt die geschlossene Schublade aus der Tabreihenfolge
         und aus dem Vorlesebaum. Erst nach der Ausfahrt, sonst springt sie
         weg statt zu gleiten. `aria-hidden` sagt dasselbe noch einmal
         ausdruecklich — daran erkennt auch die Satzpruefung, dass hier
         nichts verschwunden ist, sondern etwas absichtlich zu ist. */
      aria-hidden={!offen || undefined}
      style={{
        pointerEvents: offen ? 'auto' : 'none',
        visibility: offen ? 'visible' : 'hidden',
        transition: `visibility 0s linear ${offen ? '0s' : '520ms'}`,
      }}
    >
      {/* Verdunklung */}
      <button
        type="button"
        tabIndex={offen ? 0 : -1}
        aria-label="Warenkorb schließen"
        onClick={schliessen}
        className="absolute inset-0 bg-[rgba(8,6,3,0.62)] transition-opacity duration-500 ease-[var(--ease-soft)]"
        style={{ opacity: offen ? 1 : 0 }}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal={offen || undefined}
        aria-label="Warenkorb"
        className="schublade absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col bg-soilDeep text-paper shadow-[0_-24px_60px_rgba(0,0,0,0.5)] transition-transform duration-[520ms] ease-[var(--ease-soft)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(30rem,100vw)] sm:shadow-[-24px_0_60px_rgba(0,0,0,0.5)]"
        style={{ transform: offen ? 'translate3d(0,0,0)' : 'var(--zu)' }}
      >
        {/* Kopf */}
        <div className="flex items-start justify-between gap-6 border-b border-[var(--hair)] px-[clamp(1.25rem,4vw,2rem)] py-6">
          <div>
            <p className="u-mono text-[color:var(--stone)]">Warenkorb</p>
            <p className="mt-2 text-h4 leading-[1.15]">
              {zeilen.length === 0 ? 'Noch nichts drin' : `${zeilen.length} Posten`}
            </p>
          </div>
          <button
            ref={schliesser}
            type="button"
            onClick={schliessen}
            aria-label="Warenkorb schließen"
            className="u-mono -mr-2 -mt-2 grid h-11 w-11 place-items-center transition-colors duration-200 hover:text-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--wheat)]"
          >
            <span aria-hidden className="text-lg leading-none">
              ✕
            </span>
          </button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-[clamp(1.25rem,4vw,2rem)]">
          {zeilen.length === 0 ? (
            <p className="py-10 text-[color:var(--stone)]">
              Legen Sie etwas aus dem Sortiment dazu. Der Korb bleibt erhalten, auch wenn Sie die
              Seite zwischendurch schließen.
            </p>
          ) : (
            <ul className="flex flex-col">
              {zeilen.map((z) => (
                <li
                  key={z.id}
                  className="flex gap-4 border-b border-[var(--hair)] py-5 last:border-b-0"
                >
                  <span className="relative block h-20 w-20 shrink-0 overflow-hidden bg-soil">
                    <Artikelbild
                      src={z.artikel.bild}
                      alt={z.artikel.bildAlt}
                      hinweis={false}
                      className="h-20 w-20 object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">{z.artikel.name}</p>
                    {z.v.gebinde && (
                      <p className="u-mono mt-1 text-[color:var(--stone)]">{z.v.gebinde}</p>
                    )}
                    {typeof z.v.preisCent !== 'number' && (
                      <p className="u-mono mt-1 text-[color:var(--clay)]">Preis auf Anfrage</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                      <Mengenwahl
                        anzahl={z.anzahl}
                        onSetzen={(n) => setzen(z.id, n)}
                        label={z.artikel.name}
                        klein
                      />
                      <button
                        type="button"
                        onClick={() => entfernen(z.id)}
                        className="u-mono text-[color:var(--stone)] underline decoration-[var(--hair-strong)] underline-offset-4 transition-colors hover:text-wheat"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                  {typeof z.v.preisCent === 'number' && (
                    <p
                      className="shrink-0 text-right"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {preisText(z.v.preisCent * z.anzahl)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Fuss */}
        {zeilen.length > 0 && (
          <div className="border-t border-[var(--hair)] px-[clamp(1.25rem,4vw,2rem)] py-6">
            <div className="flex items-baseline justify-between gap-4">
              <p className="u-mono text-[color:var(--stone)]">Summe</p>
              <p className="text-h4" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {summeCent > 0 ? preisText(summeCent) : '—'}
              </p>
            </div>

            {ohnePreis && (
              <p className="u-mono mt-3 text-[color:var(--clay)]">
                Summe unvollständig, es fehlen Preise
              </p>
            )}

            <a
              href={mailto}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-paper px-6 py-4 leading-none text-soil transition-colors duration-300 hover:bg-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--wheat)]"
            >
              Bestellung an den Hof schicken
              <span aria-hidden>→</span>
            </a>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <a
                href={FARM.shop}
                target="_blank"
                rel="noopener noreferrer"
                className="u-mono underline decoration-[var(--hair-strong)] underline-offset-4 transition-colors hover:text-wheat"
              >
                Versand über den Onlineshop
                <span className="sr-only"> (öffnet in einem neuen Tab)</span>
              </a>
              <button
                type="button"
                onClick={leeren}
                className="u-mono text-[color:var(--stone)] transition-colors hover:text-wheat"
              >
                Korb leeren
              </button>
            </div>

            <p className="mt-4 text-[color:var(--stone)]">
              Die Bestellmail öffnet sich in Ihrem Mailprogramm. Abgeschickt wird sie erst von
              Ihnen.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
