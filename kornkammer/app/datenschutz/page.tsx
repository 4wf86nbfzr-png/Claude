import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import { FARM } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Datenschutz',
  description: 'Informationen zur Verarbeitung personenbezogener Daten auf dieser Website.',
  alternates: { canonical: '/datenschutz' },
  robots: { index: false, follow: true },
}

/**
 * ACHTUNG · UNVOLLSTAENDIG
 * Der Text beschreibt den technischen Stand dieser Seite korrekt (keine
 * Analyse, keine Aufrufe an Dritte, Schriften selbst ausgeliefert). Hoster,
 * Auftragsverarbeiter und ein etwaiger Datenschutzbeauftragter fehlen und
 * sind unten als offen markiert. Vor dem Livegang ergaenzen und anwaltlich
 * pruefen lassen.
 */
const OFFEN = 'bitte ergänzen'

export default function DatenschutzPage() {
  return (
    <>
      <PageHeader eyebrow={['Rechtliches']} title="Datenschutz" tone="paper" />

      <section className="section on-paper">
        <div className="shell measure-lead flex flex-col gap-10">
          <p className="u-mono inline-block w-fit border border-[var(--hair-dark-strong)] px-4 py-3 text-[color:var(--clay)]">
            Dieser Text ist noch nicht vollständig
          </p>

          <div>
            <h2 className="text-h4">Verantwortliche Stelle</h2>
            <address className="mt-4 not-italic leading-relaxed">
              {FARM.legalName}
              <br />
              {FARM.address.street}
              <br />
              {FARM.address.zip}&nbsp;{FARM.address.city}
              <br />
              <a href={FARM.email.href} className="underline underline-offset-4">
                {FARM.email.display}
              </a>
            </address>
          </div>

          <div>
            <h2 className="text-h4">Aufruf dieser Website</h2>
            <p className="mt-4">
              Beim Aufruf werden technisch notwendige Daten verarbeitet, die Ihr Browser übermittelt:
              IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browsertyp und Betriebssystem. Rechtsgrundlage
              ist Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;f DSGVO, unser berechtigtes Interesse am sicheren
              und störungsfreien Betrieb.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Hosting</h2>
            <p className="mt-4">
              Anbieter und Serverstandort: {OFFEN}. Mit dem Anbieter besteht ein Vertrag zur
              Auftragsverarbeitung nach Art.&nbsp;28 DSGVO.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Schriften und externe Inhalte</h2>
            <p className="mt-4">
              Die verwendeten Schriften werden von unserem eigenen Server ausgeliefert. Es wird
              keine Verbindung zu Google Fonts oder einem anderen Schriftendienst aufgebaut, und
              damit auch keine IP-Adresse dorthin übertragen.
            </p>
            <p className="mt-4">
              Es sind keine Analysedienste, keine Werbenetzwerke und keine Karten- oder
              Videodienste Dritter eingebunden. Das Video auf der Startseite liegt auf demselben
              Server wie die Website.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Cookies</h2>
            <p className="mt-4">
              Diese Website setzt keine Cookies zu Analyse- oder Werbezwecken. Eine
              Einwilligungsabfrage ist deshalb nicht erforderlich.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Verlinkte Angebote</h2>
            <p className="mt-4">
              Der Onlineshop und das Instagram-Profil liegen bei fremden Anbietern. Sobald Sie
              diesen Links folgen, gelten deren Datenschutzbestimmungen. Eine Übertragung findet
              erst mit dem Klick statt, nicht schon beim Aufruf dieser Seite.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Kontaktaufnahme</h2>
            <p className="mt-4">
              Wenn Sie uns anrufen oder schreiben, verarbeiten wir Ihre Angaben zur Bearbeitung der
              Anfrage nach Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b beziehungsweise lit.&nbsp;f DSGVO.
              Wir löschen sie, sobald sie nicht mehr benötigt werden und keine Aufbewahrungspflicht
              entgegensteht.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Ihre Rechte</h2>
            <p className="mt-4">
              Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
              Verarbeitung, Datenübertragbarkeit und Widerspruch. Außerdem können Sie sich bei einer
              Aufsichtsbehörde beschweren, in Nordrhein-Westfalen bei der Landesbeauftragten für
              Datenschutz und Informationsfreiheit.
            </p>
          </div>

          <div>
            <h2 className="text-h4">Datenschutzbeauftragter</h2>
            <p className="mt-4">{OFFEN}</p>
          </div>
        </div>
      </section>
    </>
  )
}
