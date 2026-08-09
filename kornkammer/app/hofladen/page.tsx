import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import FarmShop from '@/components/sections/FarmShop'
import Reveal from '@/components/motion/Reveal'
import MediaFrame from '@/components/ui/MediaFrame'
import { FARM } from '@/data/farm'

export const metadata: Metadata = {
  title: 'Direkt vom Hof',
  description: `Hofverkauf in ${FARM.address.city}: Kartoffeln, Getreide und Mehle, Speiseöle, Nudeln und Senf aus eigener Erzeugung. ${FARM.address.street}, ${FARM.address.zip} ${FARM.address.city}.`,
  alternates: { canonical: '/hofladen' },
}

export default function HofladenPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Verkauf ab Hof']}
        title="Einmal die Woche steht die Tür offen"
        lead="Der kürzeste Weg zwischen Feld und Küche führt über die Hofzufahrt."
      />

      <FarmShop />

      <section className="pb-[var(--sec)] bg-soil">
        <div className="shell grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-2">
          <Reveal>
            <MediaFrame
              src="/images/hofladen/verkauf.jpg"
              alt="Der Verkaufsraum am Hof mit Regalen voller Mehl und Öl"
              className="aspect-[4/3] w-full"
            />
          </Reveal>
          <Reveal delay={0.06} className="flex flex-col justify-center gap-6">
            <p className="text-lead u-italic">Bringen Sie Zeit mit, es lohnt sich zu fragen.</p>
            <p className="measure text-[color:var(--stone)]">
              Wer wissen will, auf welchem Schlag sein Mehl gewachsen ist, bekommt hier eine
              Antwort. Das ist der eigentliche Grund, warum wir den Verkauf am Hof machen und nicht
              nur über den Handel.
            </p>
            <p className="measure text-[color:var(--stone)]">
              Für größere Mengen, Gastronomie und Bäckereien rufen Sie am besten vorher an, dann
              legen wir zurück.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}
