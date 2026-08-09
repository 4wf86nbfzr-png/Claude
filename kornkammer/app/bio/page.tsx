import type { Metadata } from 'next'
import PageHeader from '@/components/ui/PageHeader'
import BioCerts from '@/components/sections/BioCerts'
import Reveal from '@/components/motion/Reveal'
import SplitLines from '@/components/motion/SplitLines'

export const metadata: Metadata = {
  title: 'Bio verstehen',
  description:
    'EU Bio, Bioland und GlobalGAP im Vergleich: was die Siegel jeweils regeln und warum der Bioland Verband über die gesetzlichen Mindeststandards hinausgeht.',
  alternates: { canonical: '/bio' },
}

export default function BioPage() {
  return (
    <>
      <PageHeader
        eyebrow={['Bio verstehen']}
        title="Was hinter den Siegeln steht"
        lead="Drei Regelwerke greifen ineinander. Eines ist Gesetz, eines ist ein Verband, eines regelt die Nachweisführung."
      />

      <section className="section bg-soil">
        <div className="shell">
          <SplitLines
            as="h2"
            className="optical max-w-[20ch] text-h3 u-italic leading-[1.05]"
          >
            Der häufigste Irrtum: dass alle Biosiegel dasselbe bedeuten.
          </SplitLines>

          <Reveal className="mt-10 flex flex-col gap-6">
            <p className="measure-lead text-lead">
              Die EU Rechtsvorschriften legen fest, was Bio mindestens heißt. Ein Anbauverband wie
              Bioland setzt darauf eigene, engere Richtlinien.
            </p>
            <p className="measure text-[color:var(--stone)]">
              Der praktisch wichtigste Unterschied betrifft den Betrieb als Ganzes: Verbandsbetriebe
              wirtschaften vollständig ökologisch. Nach EU Recht ist es dagegen zulässig, nur einen
              Teil der Flächen ökologisch zu bewirtschaften und den Rest konventionell.
            </p>
          </Reveal>
        </div>
      </section>

      <BioCerts />
    </>
  )
}
