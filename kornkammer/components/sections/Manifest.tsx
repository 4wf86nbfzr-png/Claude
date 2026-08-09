import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'

/**
 * Eine grosse editoriale Aussage, Zeile fuer Zeile enthuellt.
 * Der Beistelltext erklaert die Marke in einem Atemzug.
 */
export default function Manifest() {
  return (
    <section className="section relative bg-soil">
      <div className="shell">
        <Eyebrow items={['Bioland Betrieb', 'Witten an der Ruhr']} />

        <SplitLines
          as="h2"
          className="optical mt-10 text-h2 leading-[0.98] tracking-[-0.03em]"
          stagger={0.1}
        >
          Zwischen Autobahn und Zeche liegt Ackerland. Wir bewirtschaften es so, dass der Boden
          davon lebt und nicht davon zehrt.
        </SplitLines>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_auto_0.85fr]">
          <div />
          <div aria-hidden className="hidden w-px bg-[var(--hair)] lg:block" />
          <Reveal className="flex flex-col gap-6" stagger>
            <p className="text-lead u-italic">
              Landwirtschaft mitten im Revier ist kein Idyll. Sie ist eine Entscheidung.
            </p>
            <p className="text-[color:var(--stone)]">
              Wir arbeiten ohne chemisch synthetischen Pflanzenschutz und ohne leicht löslichen
              Mineraldünger. Was dem Bestand fehlt, holt er sich aus einer Fruchtfolge, die darauf
              ausgelegt ist. Das dauert länger und verlangt, dass man zum richtigen Zeitpunkt auf
              dem Feld steht.
            </p>
            <p className="text-[color:var(--stone)]">
              Was hier wächst, verarbeiten wir zunehmend selbst: zu Mehl, Öl, Nudeln und Senf. So
              bleibt nachvollziehbar, wo ein Produkt herkommt.
            </p>
          </Reveal>
        </div>

        <FieldLine className="mt-[clamp(4rem,9vh,7rem)]" />
      </div>
    </section>
  )
}
