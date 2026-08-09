import Link from 'next/link'
import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Parallax from '@/components/motion/Parallax'
import MediaFrame from '@/components/ui/MediaFrame'
import Eyebrow from '@/components/ui/Eyebrow'

/**
 * Der Hof als visuelle Erzaehlung, nicht als Textseite.
 * Die Kernaussagen stehen als ruhige Liste ohne Nummerierung.
 */
const PRINZIPIEN = [
  'Bioland Betrieb',
  'Verzicht auf chemisch synthetische Düngung',
  'Verzicht auf chemisch synthetischen Pflanzenschutz',
  'Mechanische Beikrautregulierung',
  'Fruchtfolge und Zwischenfrüchte',
  'Lebendige Böden',
]

export default function FarmStory() {
  return (
    <section className="section relative overflow-hidden bg-soil">
      <div className="shell">
        <div className="grid grid-cols-1 items-end gap-[clamp(2rem,5vw,5rem)] lg:grid-cols-[0.9fr_1.1fr]">
          <Parallax amount={0.07}>
            <MediaFrame
              src="/images/hof/hof-luft.jpg"
              alt="Luftbild der Hofstelle zwischen Feldern und Siedlung"
              className="aspect-[3/4] w-full"
            />
          </Parallax>

          <div>
            <Eyebrow items={['Der Hof']} />
            <SplitLines
              as="h2"
              className="optical mt-8 text-h2 u-italic leading-[0.98] tracking-[-0.03em]"
            >
              Seit den Anfängen biologische Landwirtschaft, mitten im Ruhrgebiet.
            </SplitLines>
          </div>
        </div>

        <div className="mt-[clamp(3.5rem,8vh,6rem)] grid grid-cols-1 gap-[clamp(2rem,5vw,5rem)] lg:grid-cols-[1fr_0.9fr]">
          <Reveal className="flex flex-col gap-6">
            <p className="text-lead measure-lead">
              Der Betrieb liegt dort, wo das Ruhrtal aufhört, Industrielandschaft zu sein. Wer die
              Zufahrt hochkommt, sieht auf der einen Seite Felder und auf der anderen die Stadt.
            </p>
            <p className="measure text-[color:var(--stone)]">
              Diese Lage ist der Grund, warum wir so arbeiten, wie wir arbeiten. Böden, die zwischen
              Straßen und Siedlung liegen, bekommen keine zweite Chance. Wer sie ausräumt, bekommt
              sie nicht zurück.
            </p>
            <Link
              href="/hof"
              className="u-mono mt-2 inline-flex w-fit items-center gap-3 border-b border-[var(--hair-strong)] pb-2 text-wheat transition-colors hover:border-wheat"
            >
              Mehr über den Hof
              <span aria-hidden>→</span>
            </Link>
          </Reveal>

          <Reveal stagger>
            <ul className="flex flex-col">
              {PRINZIPIEN.map((p) => (
                <li
                  key={p}
                  className="border-t border-[var(--hair)] py-5 text-h4 last:border-b"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
