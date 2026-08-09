import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Button from '@/components/ui/Button'
import Eyebrow from '@/components/ui/Eyebrow'
import { FARM, ROUTE_URL } from '@/data/farm'

/**
 * Verkauf direkt ab Hof.
 *
 * Auf dem Telefon muss das die am einfachsten zu bedienende Stelle der
 * ganzen Seite sein: Wann, wo, wie hin, wen anrufen — in dieser Reihenfolge.
 */
export default function FarmShop() {
  const { hofladen } = FARM

  return (
    <section className="section relative bg-soil" aria-labelledby="hofladen-titel">
      <div className="shell">
        <Eyebrow items={['Verkauf ab Hof']} tone="wheat" />

        <SplitLines
          as="h2"
          id="hofladen-titel"
          className="optical mt-8 text-display uppercase leading-[0.88] tracking-[-0.032em]"
        >
          Direkt vom Hof
        </SplitLines>

        <div className="mt-16 grid grid-cols-1 gap-x-[clamp(2rem,5vw,4rem)] gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal>
            <p className="u-mono text-[color:var(--stone)]">Wann</p>
            <p className="mt-5 text-h3 leading-[1.04]">{hofladen.day}</p>
            <p className="mt-2 text-lead text-wheatSoft">
              {hofladen.from} bis {hofladen.to}&nbsp;Uhr
            </p>
            <p className="mt-5 max-w-[30ch] text-[color:var(--stone)]">{hofladen.holidayRule}</p>
            {hofladen.unbestaetigt && (
              <p className="u-mono mt-5 inline-block border border-[var(--hair-strong)] px-3 py-2 text-[color:var(--clay)]">
                Zeiten bitte bestätigen
              </p>
            )}
          </Reveal>

          <Reveal delay={0.05}>
            <p className="u-mono text-[color:var(--stone)]">Wo</p>
            <address className="mt-5 not-italic text-lead leading-snug">
              {FARM.address.street}
              <br />
              {FARM.address.zip}&nbsp;{FARM.address.city}
            </address>
            <div className="mt-6">
              <Button href={ROUTE_URL} external variant="ghost">
                Route starten
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="u-mono text-[color:var(--stone)]">Sortiment</p>
            <ul className="mt-5 flex flex-col gap-2 text-lead leading-snug">
              <li>Kartoffeln</li>
              <li>Getreide und Mehle</li>
              <li>Speiseöle</li>
              <li>Nudeln</li>
              <li>Senf</li>
            </ul>
          </Reveal>

          <Reveal delay={0.15}>
            <p className="u-mono text-[color:var(--stone)]">Kontakt</p>
            <p className="mt-5 max-w-[28ch] text-[color:var(--stone)]">
              Größere Mengen und Termine außer der Reihe gehen am besten telefonisch.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <a href={FARM.phone.href} className="text-lead hover:text-wheat">
                {FARM.phone.display}
              </a>
              <a href={FARM.email.href} className="break-all hover:text-wheat">
                {FARM.email.display}
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
