import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Button from '@/components/ui/Button'
import FieldLine from '@/components/ui/FieldLine'
import { FARM, ROUTE_URL } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Kontakt',
  description: `Team Kornkammer erreichen: ${FARM.address.street}, ${FARM.address.zip} ${FARM.address.city}. Telefonisch oder per E-Mail.`,
  alternates: { canonical: '/kontakt' },
}

export default function KontaktPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Kontakt']}
        title="Rufen Sie einfach an"
        lead="Für Bestellungen, größere Mengen und alles, was sich schneller besprechen als schreiben lässt."
      />

      <section className="section bg-soil">
        <div className="shell grid grid-cols-1 gap-[clamp(2.5rem,6vw,5rem)] lg:grid-cols-2">
          <Reveal className="flex flex-col gap-10">
            <div>
              <p className="u-mono text-[color:var(--stone)]">Telefon</p>
              <a href={FARM.phone.href} className="mt-4 block text-h3 leading-none hover:text-wheat">
                {FARM.phone.display}
              </a>
            </div>

            <div>
              <p className="u-mono text-[color:var(--stone)]">E-Mail</p>
              <a
                href={FARM.email.href}
                className="mt-4 block break-all text-h4 leading-tight hover:text-wheat"
              >
                {FARM.email.display}
              </a>
            </div>

            <div>
              <p className="u-mono text-[color:var(--stone)]">Anschrift</p>
              <address className="mt-4 not-italic text-lead leading-snug">
                {FARM.legalName}
                <br />
                {FARM.address.street}
                <br />
                {FARM.address.zip}&nbsp;{FARM.address.city}
              </address>
              <div className="mt-6">
                <Button href={ROUTE_URL} external variant="ghost">
                  Route starten
                </Button>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.06} className="flex flex-col gap-8">
            <div>
              <p className="u-mono text-[color:var(--stone)]">Am Hof</p>
              <p className="mt-4 text-lead">
                {FARM.hofladen.day}, {FARM.hofladen.from} bis {FARM.hofladen.to}&nbsp;Uhr
              </p>
              <p className="mt-4 max-w-[34ch] text-[color:var(--stone)]">
                {FARM.hofladen.holidayRule}
              </p>
              {FARM.hofladen.unbestaetigt && (
                <p className="u-mono mt-5 inline-block border border-[var(--hair-strong)] px-3 py-2 text-[color:var(--clay)]">
                  Zeiten bitte bestätigen
                </p>
              )}
            </div>

            <FieldLine animate={false} />

            <div>
              <p className="u-mono text-[color:var(--stone)]">Online</p>
              <p className="mt-4 max-w-[34ch] text-[color:var(--stone)]">
                Ein Teil des Sortiments ist im Onlineshop erhältlich. Der liegt auf einer eigenen
                Plattform, Sie verlassen dabei diese Seite.
              </p>
              <div className="mt-6 flex flex-wrap gap-4">
                <Button href={FARM.shop} external>
                  Zum Onlineshop
                </Button>
                <Button href={FARM.instagram} external variant="ghost">
                  Instagram
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
