import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import { FARM } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Angaben gemäß § 5 DDG.',
  alternates: { canonical: '/impressum' },
  robots: { index: false, follow: true },
}

/**
 * ACHTUNG · UNVOLLSTAENDIG
 * Vertretungsberechtigte, Umsatzsteuer-Identifikationsnummer, zuständige
 * Aufsichtsbehörde und Berufsangaben liegen nicht belegt vor. Sie sind unten
 * sichtbar als offen markiert. Vor dem Livegang ergänzen und den Text
 * rechtlich prüfen lassen.
 */
const OFFEN = 'bitte ergänzen'

export default function ImpressumPage() {
  return (
    <>
      <PageHeader eyebrow={['Rechtliches']} title="Impressum" tone="paper" />

      <section className="section on-paper">
        <div className="shell measure-lead flex flex-col gap-10">
          <p className="u-mono inline-block w-fit border border-[var(--hair-dark-strong)] px-4 py-3 text-[color:var(--clay)]">
            Dieser Text ist noch nicht vollständig
          </p>

          <div>
            <h2 className="text-h4">Angaben gemäß § 5 DDG</h2>
            <address className="mt-4 not-italic leading-relaxed">
              {FARM.legalName}
              <br />
              {FARM.address.street}
              <br />
              {FARM.address.zip}&nbsp;{FARM.address.city}
            </address>
          </div>

          <div>
            <h2 className="text-h4">Vertreten durch</h2>
            <p className="mt-4">{OFFEN}</p>
          </div>

          <div>
            <h2 className="text-h4">Kontakt</h2>
            <p className="mt-4">
              Telefon{' '}
              <a href={FARM.phone.href} className="underline underline-offset-4">
                {FARM.phone.display}
              </a>
              <br />
              E-Mail{' '}
              <a href={FARM.email.href} className="underline underline-offset-4">
                {FARM.email.display}
              </a>
            </p>
          </div>

          <div>
            <h2 className="text-h4">Registereintrag</h2>
            <p className="mt-4">Registergericht und Registernummer: {OFFEN}</p>
          </div>

          <div>
            <h2 className="text-h4">Umsatzsteuer</h2>
            <p className="mt-4">
              Umsatzsteuer-Identifikationsnummer gemäß § 27&nbsp;a UStG: {OFFEN}
            </p>
          </div>

          <div>
            <h2 className="text-h4">Aufsichtsbehörde</h2>
            <p className="mt-4">Zuständige Landwirtschaftskammer und Öko-Kontrollstelle: {OFFEN}</p>
          </div>

          <div>
            <h2 className="text-h4">Verantwortlich für den Inhalt</h2>
            <p className="mt-4">Nach § 18 Abs.&nbsp;2 MStV: {OFFEN}</p>
          </div>

          <div>
            <h2 className="text-h4">Streitbeilegung</h2>
            <p className="mt-4">
              Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Bildnachweis</h2>
            <p className="mt-4">{OFFEN}</p>
          </div>

          <p className="text-[color:var(--stone)]">
            Der Betrieb wirtschaftet seit {FARM.since} nach den Richtlinien des Bioland Verbands.
          </p>
        </div>
      </section>
    </>
  )
}
