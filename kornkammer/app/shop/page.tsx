import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'
import Button from '@/components/ui/Button'
import Sortiment from '@/components/shop/Sortiment'
import { FARM, ROUTE_URL } from '@/data/farm'
import { PREISE_GEPFLEGT } from '@/data/shop'

export const metadata: Metadata = {
  title: 'Shop',
  description: `Kartoffeln, Getreide und Mehle, Speiseöle, Nudeln und Senf aus eigener Erzeugung. Abholung am Hof in ${FARM.address.city} oder Versand über den Onlineshop.`,
  alternates: { canonical: '/shop' },
}

export default function ShopPage() {
  const { hofladen } = FARM

  return (
    <>
      <PageHeader
        eyebrow={['Shop', 'Aus eigener Erzeugung']}
        title="Was gewachsen ist, können Sie mitnehmen"
        lead="Alles hier stammt aus derselben Fruchtfolge. Zusammenstellen, abholen oder über den Onlineshop versenden lassen."
      />

      <section className="section bg-soil" aria-labelledby="sortiment-titel">
        <div className="shell">
          <h2 id="sortiment-titel" className="sr-only">
            Sortiment
          </h2>

          {/* Solange keine Preise gepflegt sind, gehoert das an die erste
              Stelle. Es ist keine Fehlermeldung, sondern eine Ansage: der
              Korb funktioniert, die Zahlen fehlen noch. */}
          {!PREISE_GEPFLEGT && (
            <Reveal>
              <div className="mb-12 border-y border-[var(--hair-strong)] py-6">
                <p className="u-mono text-[color:var(--clay)]">Preise werden nachgetragen</p>
                <p className="mt-4 max-w-measure text-[color:var(--stone)]">
                  Preise und Gebindegrößen stehen hier noch nicht. Wir tragen keine Zahlen ein, die
                  wir nicht geprüft haben. Stellen Sie sich Ihre Bestellung trotzdem zusammen: Sie
                  bekommen die Preise mit der Antwort auf Ihre Anfrage, bevor etwas zurückgelegt
                  wird.
                </p>
              </div>
            </Reveal>
          )}

          <Sortiment />
        </div>
      </section>

      {/* Wie es weitergeht */}
      <section className="section bg-soilDeep" aria-labelledby="wege-titel">
        <div className="shell">
          <Eyebrow items={['Zwei Wege']} tone="wheat" />
          <h2 id="wege-titel" className="optical mt-8 max-w-[16ch] text-h2 leading-[0.98]">
            Abholen oder schicken lassen
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-2">
            <Reveal>
              <div className="flex h-full flex-col border-t border-[var(--hair)] pt-6">
                <h3 className="text-h4 leading-[1.15]">Abholung am Hof</h3>
                <p className="mt-4 max-w-measure flex-1 text-[color:var(--stone)]">
                  Der Korb wird zu einer Bestellmail, die Sie selbst abschicken. Wir melden uns mit
                  Preis und Termin zurück und legen zurück, bis Sie da sind.
                </p>
                <p className="mt-6 text-lead">
                  {hofladen.day}, {hofladen.from} bis {hofladen.to}&nbsp;Uhr
                </p>
                <p className="mt-3 max-w-[32ch] text-[color:var(--stone)]">
                  {hofladen.holidayRule}
                </p>
                {hofladen.unbestaetigt && (
                  <p className="u-mono mt-5 inline-block self-start border border-[var(--hair-strong)] px-3 py-2 text-[color:var(--clay)]">
                    Zeiten bitte bestätigen
                  </p>
                )}
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button href={ROUTE_URL} external variant="ghost">
                    Route
                  </Button>
                  <Button href="/hofladen" variant="ghost">
                    Direkt vom Hof
                  </Button>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.06}>
              <div className="flex h-full flex-col border-t border-[var(--hair)] pt-6">
                <h3 className="text-h4 leading-[1.15]">Versand</h3>
                <p className="mt-4 max-w-measure flex-1 text-[color:var(--stone)]">
                  Was verschickt werden kann, steht im bestehenden Onlineshop. Der Versand läuft
                  dort, mit eigenem Zahlungsweg und eigener Widerrufsbelehrung.
                </p>
                <div className="mt-8">
                  <Button href={FARM.shop} external>
                    Zum Onlineshop
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>

          <FieldLine className="mt-[clamp(3rem,8vh,5rem)]" tone="wheat" />

          <p className="mt-10 max-w-measure text-[color:var(--stone)]">
            Für größere Mengen, Gastronomie und Bäckereien rufen Sie am besten an:{' '}
            <a href={FARM.phone.href} className="text-paper underline underline-offset-4">
              {FARM.phone.display}
            </a>
            .
          </p>
        </div>
      </section>
    </>
  )
}
