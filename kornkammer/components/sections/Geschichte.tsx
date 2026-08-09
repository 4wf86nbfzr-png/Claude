import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import MediaFrame from '@/components/ui/MediaFrame'
import { GESCHICHTE } from '@/data/geschichte'

/**
 * Betriebsgeschichte.
 *
 * Bewusst keine waagerechte Zeitleiste mit Pfeilen — das ist genau die
 * Praesentationsgrafik, aus der die Angaben stammen, und sie liest sich auf
 * dem Telefon nicht. Stattdessen eine senkrechte Spur: links das Jahr, rechts
 * das Ereignis. Die Jahreszahl ist hier Inhalt und keine Schmuckziffer,
 * deshalb darf sie gross stehen.
 *
 * Wiederholte Jahre (1987 zweimal, 1996 zweimal) bekommen die Zahl nur beim
 * ersten Eintrag. Sonst wirkt es wie ein Fehler statt wie zwei Ereignisse in
 * einem Jahr.
 */
export default function Geschichte() {
  return (
    <section className="section bg-soilDeep" aria-labelledby="geschichte-titel">
      <div className="shell">
        <Eyebrow items={['Betriebsgeschichte']} tone="wheat" />
        <SplitLines
          as="h2"
          id="geschichte-titel"
          className="optical mt-8 max-w-[16ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Aus zehn Hektar wurde ein Verbandsbetrieb.
        </SplitLines>

        <ol className="mt-16 flex flex-col">
          {GESCHICHTE.map((etappe, i) => {
            const gleichesJahr = i > 0 && GESCHICHTE[i - 1].jahr === etappe.jahr

            return (
              <li key={`${etappe.jahr}-${etappe.titel}`}>
                <Reveal delay={0.04}>
                  <div className="grid grid-cols-1 gap-x-[clamp(1.5rem,4vw,3.5rem)] gap-y-6 border-t border-[var(--hair)] py-[clamp(1.75rem,4vh,3rem)] sm:grid-cols-[7rem_1fr] lg:grid-cols-[9rem_1fr_16rem]">
                    <p
                      className="u-mono text-[color:var(--wheat)]"
                      /* Das zweite Ereignis desselben Jahres bekommt keine
                         zweite Zahl, bleibt fuer Vorlesesoftware aber lesbar. */
                      aria-hidden={gleichesJahr || undefined}
                    >
                      {gleichesJahr ? (
                        <span aria-hidden className="block h-3 w-px bg-[var(--hair-strong)]" />
                      ) : (
                        etappe.jahr
                      )}
                    </p>

                    <div>
                      {gleichesJahr && <span className="sr-only">{etappe.jahr}</span>}
                      <h3 className="max-w-[26ch] text-h4 leading-[1.15]">{etappe.titel}</h3>
                      {etappe.note && (
                        <p className="mt-4 max-w-measure text-[color:var(--stone)]">
                          {etappe.note}
                        </p>
                      )}
                    </div>

                    {etappe.image ? (
                      <MediaFrame
                        src={etappe.image}
                        alt={etappe.imageAlt ?? etappe.titel}
                        className="aspect-[4/3] w-full max-w-[16rem]"
                        sizes="(min-width: 1024px) 16rem, 60vw"
                      />
                    ) : (
                      <span aria-hidden />
                    )}
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
        <div className="border-t border-[var(--hair)]" />
      </div>
    </section>
  )
}
