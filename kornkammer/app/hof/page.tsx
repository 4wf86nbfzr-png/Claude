import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import Reveal from '@/components/motion/Reveal'
import Parallax from '@/components/motion/Parallax'
import MediaFrame from '@/components/ui/MediaFrame'
import SplitLines from '@/components/motion/SplitLines'
import CropRotation from '@/components/sections/CropRotation'
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
        title="Ackerland mitten im Revier"
        lead="Wer die Zufahrt hochkommt, sieht auf der einen Seite Felder und auf der anderen die Stadt. Diese Lage erklärt fast alles, was wir tun."
      />

      <section className="section bg-soil">
        <div className="shell">
          <div className="grid grid-cols-1 gap-[clamp(2rem,5vw,4.5rem)] lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal className="flex flex-col gap-6">
              <p className="text-lead measure-lead">
                Böden, die zwischen Straßen und Siedlung liegen, bekommen keine zweite Chance.
              </p>
              <p className="measure text-[color:var(--stone)]">
                Der Betrieb wirtschaftet seit {FARM.since} nach den Richtlinien des Bioland
                Verbands. Umgestellt wurde nicht eine Fläche, sondern der ganze Hof. Das ist der
                Unterschied zwischen einem Verbandsbetrieb und einem Betrieb mit ein paar Bioflächen.
              </p>
              <p className="measure text-[color:var(--stone)]">
                Ohne chemisch synthetischen Pflanzenschutz und ohne leicht löslichen Mineraldünger
                verschiebt sich die Arbeit nach vorn: in die Planung der Fruchtfolge und in den
                richtigen Termin auf dem Feld. Ein verpasster Striegeltermin lässt sich später mit
                nichts mehr aufholen.
              </p>
            </Reveal>

            <Parallax amount={0.06}>
              <MediaFrame
                src="/images/hof/hofstelle.jpg"
                alt="Die Hofstelle mit Scheune und Zufahrt"
                className="aspect-[4/5] w-full"
              />
            </Parallax>
          </div>
        </div>
      </section>

      <section className="section bg-soilDeep">
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
    </>
  )
}
