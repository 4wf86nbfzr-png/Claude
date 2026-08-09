import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import Button from '@/components/ui/Button'
import { FARM, ROUTE_URL } from '@/data/farm'

/**
 * Die Lage.
 *
 * Bewusst kein eingebetteter Kartendienst: eine Einbettung laedt beim
 * Seitenaufruf Kacheln von einem Dritten und uebermittelt dabei die IP jedes
 * Besuchers, ohne dass jemand darum gebeten haette. Fuer eine deutsche
 * Firmenseite ist das die Stelle, an der es teuer wird. Stattdessen ein
 * statischer Kartenausschnitt im Haus und ein Knopf, der die Route erst auf
 * Klick bei Google Maps oeffnet — dann ist es eine Entscheidung des Besuchers.
 *
 * Der Ausschnitt stammt aus OpenStreetMap, die Namensnennung steht sichtbar
 * darunter. Das verlangt die Lizenz (ODbL) und es kostet nichts.
 */
export default function Lage() {
  const { address } = FARM

  return (
    <section className="section bg-soil" aria-labelledby="lage-titel">
      <div className="shell">
        <Eyebrow items={['Wo wir sind', `${address.city} an der Ruhr`]} />
        <SplitLines
          as="h2"
          id="lage-titel"
          className="optical mt-8 max-w-[17ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Felder im Ruhrtal, Stadt am Rand des Schlages.
        </SplitLines>

        <div className="mt-14 grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-[1.25fr_0.75fr]">
          <Reveal>
            <figure className="m-0">
              <a
                href={ROUTE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group block overflow-hidden rounded-[2px] border border-[var(--hair-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--wheat)]"
              >
                <img
                  src="/images/lage/witten-osm.webp"
                  alt={`Kartenausschnitt von ${address.city} an der Ruhr. Der Betrieb liegt südöstlich der Innenstadt, jenseits der Ruhr an der Wetterstraße, und ist rot markiert.`}
                  width={2112}
                  height={1812}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full transition-transform duration-[900ms] ease-[var(--ease-soft)] group-hover:scale-[1.015]"
                />
              </a>
              <figcaption className="u-mono mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[color:var(--stone)]">
                <span>Kartendaten © OpenStreetMap Mitwirkende</span>
                <span aria-hidden className="h-3 w-px bg-[var(--hair-strong)]" />
                <span>Karte anklicken öffnet die Route</span>
              </figcaption>
            </figure>
          </Reveal>

          <Reveal delay={0.06} className="flex flex-col justify-center gap-8">
            <div>
              <p className="u-mono text-[color:var(--stone)]">Anschrift</p>
              <address className="mt-4 not-italic text-lead leading-snug">
                {FARM.legalName}
                <br />
                {address.street}
                <br />
                {address.zip}&nbsp;{address.city}
              </address>
            </div>

            <p className="max-w-measure text-[color:var(--stone)]">
              Die Zufahrt liegt südlich der Ruhr, oberhalb der Wetterstraße. Wer aus Witten kommt,
              fährt über die Ruhrbrücke und dann den Hang hinauf. Ab der Abzweigung ist es ein
              Wirtschaftsweg, das letzte Stück fährt sich langsam.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button href={ROUTE_URL} external>
                Route bei Google Maps
              </Button>
              <Button href="/kontakt" variant="ghost">
                Kontakt
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
