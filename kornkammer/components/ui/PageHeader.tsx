import SplitLines from '@/components/motion/SplitLines'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'

/**
 * Kopf einer Unterseite. Immer gleich aufgebaut, damit die Seiten als
 * eine Familie lesbar bleiben: Utility-Zeile, Titel, Vorspann, Furche.
 */
export default function PageHeader({
  eyebrow,
  title,
  lead,
  tone = 'soil',
}: {
  eyebrow: string | string[]
  title: string
  lead?: string
  tone?: 'soil' | 'paper'
}) {
  return (
    <header
      className={
        'relative pb-[clamp(2rem,6vh,4rem)] pt-[clamp(8rem,18vh,13rem)] ' +
        (tone === 'paper' ? 'on-paper' : 'bg-soil')
      }
    >
      <div className="shell">
        <Eyebrow items={eyebrow} />
        <SplitLines
          as="h1"
          immediate
          delay={0.1}
          className="optical mt-8 max-w-[16ch] text-display leading-[0.9] tracking-[-0.032em]"
        >
          {title}
        </SplitLines>
        {lead && (
          <p className="measure-lead mt-9 text-lead u-italic text-[color:var(--stone)]">{lead}</p>
        )}
        <FieldLine className="mt-[clamp(3rem,7vh,5rem)]" />
      </div>
    </header>
  )
}
