import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Parallax from '@/components/motion/Parallax'
import MediaFrame from '@/components/ui/MediaFrame'
import SplitLines from '@/components/motion/SplitLines'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'
import CropRotation from '@/components/sections/CropRotation'
import Geschichte from '@/components/sections/Geschichte'
import Lage from '@/components/sections/Lage'
import { FARM } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Der Hof',
  description:
    'Kornkammer Haus Holte bewirtschaftet Flächen mitten im Ruhrgebiet nach Bioland Richtlinien: lebendige Böden, weite Fruchtfolge, mechanische Pflege.',
  alternates: { canonical: '/hof' },
}

export default function HofPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Der Hof', `${FARM.address.city} an der Ruhr`]}
        title="Der Biohof mit einem ganzheitlichen Ansatz"
        lead="Wer die Zufahrt hochkommt, sieht auf der einen Seite Felder und auf der anderen die Stadt. Diese Lage erklärt fast alles, was wir tun."
      />

      {/* Der ganzheitliche Ansatz — Text des Betriebs */}
      <section className="section bg-soil" aria-labelledby="ansatz-titel">
        <div className="shell">
          <Eyebrow items={['Der ganzheitliche Ansatz']} tone="wheat" />

          <div className="mt-10 grid grid-cols-1 gap-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal className="flex flex-col gap-6">
              <p className="text-lead measure-lead">
                Wir sind fest davon überzeugt, dass wir durch eine ganzheitliche Landwirtschaft das
                Land erhalten und verbessern und mit unserer nachhaltigen Bewirtschaftung für
                künftige Generationen erhalten.
              </p>
              <p className="measure text-[color:var(--stone)]">
                Wir arbeiten hart daran, in unseren ausgewählten Bereichen die Besten zu werden und
                streben nach allgemeiner Leistung durch das ständige Engagement unseres kleinen
                Teams.
              </p>
              <p className="measure text-[color:var(--stone)]">
                Als Biohof gründet unsere tägliche Arbeit auf unserem eigenen Land und auf den
                Pachtflächen unserer Verpächter. Unsere Nutzflächen sind unser Kapital. Eine
                nachhaltige und zukunftsorientierte Bewirtschaftung im Sinne aller ist für uns
                selbstverständlich.
              </p>
            </Reveal>

            <Parallax amount={0.06}>
              <MediaFrame
                src="/images/hof/hofstelle.webp"
                alt="Die Hofstelle Witten-Gedern mit Silos und Halle"
                className="aspect-[4/5] w-full"
              />
            </Parallax>
          </div>

          <FieldLine className="mt-[clamp(3rem,8vh,5rem)]" tone="wheat" />

          <Reveal className="mt-[clamp(2.5rem,6vh,4rem)]">
            <p className="text-h3 measure-lead leading-[1.2]">
              Das Team Kornkammer verbindet die Prinzipien des ökologischen Landbaus mit den
              Anforderungen der Landwirtschaft im 21.&nbsp;Jahrhundert.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Was der Verbandsstandard bedeutet */}
      <section className="section bg-soilDeep" aria-labelledby="standard-titel">
        <div className="shell">
          <div className="grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal className="flex flex-col items-start gap-6">
              <img
                src="/logo/bioland.webp"
                alt="Bioland"
                width={104}
                height={104}
                loading="lazy"
                decoding="async"
                style={{ width: 104, height: 'auto' }}
              />
              <img
                src="/logo/eu-bio.webp"
                alt="EU Bio Siegel"
                width={104}
                height={64}
                loading="lazy"
                decoding="async"
                style={{ width: 104, height: 'auto' }}
              />
            </Reveal>

            <div>
              <SplitLines
                as="h2"
                id="standard-titel"
                className="optical max-w-[20ch] text-h2 u-italic leading-[0.98] tracking-[-0.03em]"
              >
                Ein Standard, der über der EU Bio Verordnung liegt.
              </SplitLines>

              <Reveal className="mt-10 flex flex-col gap-6">
                <p className="measure text-[color:var(--stone)]">
                  Als Bioland Betrieb erfüllen wir einen Standard, der weit über den gesetzlichen
                  Vorgaben der EU&nbsp;Bio Verordnung liegt. Die Kornkammer Haus Holte bietet Ihnen
                  ein Höchstmaß an Transparenz und Sicherheit.
                </p>
                <p className="measure text-[color:var(--stone)]">
                  Die strengen Bioland Richtlinien werden von staatlich legitimierten Instituten
                  kontrolliert. Selbstverständlich erfüllen auch unsere Zulieferer und Verarbeiter
                  mindestens die EU&nbsp;Bio Richtlinien und werden lückenlos kontrolliert.
                </p>
                <p className="measure text-[color:var(--stone)]">
                  Der Betrieb wirtschaftet seit&nbsp;{FARM.since} nach diesen Richtlinien.
                  Umgestellt wurde nicht eine Fläche, sondern der ganze Hof. Das ist der Unterschied
                  zwischen einem Verbandsbetrieb und einem Betrieb mit ein paar Bioflächen.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Bodenarbeit */}
      <section className="section bg-soil">
        <div className="shell">
          <SplitLines
            as="h2"
            className="optical max-w-[18ch] text-h2 u-italic leading-[0.98] tracking-[-0.03em]"
          >
            Ein Boden ist ein Bestand, kein Substrat.
          </SplitLines>

          <div className="mt-14 grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-3">
            {[
              {
                title: 'Organisch düngen',
                body: 'Wir führen dem Boden organische Substanz zu, statt Nährstoffe direkt an die Pflanze zu geben. Das Bodenleben macht daraus, was der Bestand braucht.',
              },
              {
                title: 'Bedeckt halten',
                body: 'Zwischenfrüchte decken die Fläche nach der Ernte. Sie verhindern, dass Starkregen die Krume abträgt, und halten die Durchwurzelung aufrecht.',
              },
              {
                title: 'Belüften statt verdichten',
                body: 'Tief wurzelnde Kulturen brechen verdichtete Schichten auf. Was die Wurzel schafft, muss die Maschine nicht reißen.',
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06}>
                <div className="border-t border-[var(--hair)] pt-6">
                  <h3 className="text-h4 leading-[1.15]">{item.title}</h3>
                  <p className="mt-4 text-[color:var(--stone)]">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CropRotation />
      <Geschichte />
      <Lage />
    </>
  )
}
