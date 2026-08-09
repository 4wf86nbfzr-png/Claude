'use client'

import { useState } from 'react'
import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'
import { CROPS } from '@/data/crops'

/**
 * Die Fruchtfolge als Ausschnitt aus einer Dokumentation, nicht als Diagramm.
 *
 * Jede Kultur ist eine Zeile. Wer mit Zeiger oder Tastatur darauf geht,
 * bekommt die Erklaerung. Keine Prozentwerte, keine Kreisdiagramme —
 * dazu liegen keine belastbaren Flaechenzahlen vor, und Schmuckziffern
 * will die Seite ohnehin nicht.
 */
export default function CropRotation() {
  const [active, setActive] = useState(0)

  return (
    <section className="section on-paper" aria-labelledby="fruchtfolge-titel">
      <div className="shell">
        <Eyebrow items={['Fruchtfolge']} />
        <SplitLines
          as="h2"
          id="fruchtfolge-titel"
          className="optical mt-8 max-w-[18ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Kein Schlag trägt zweimal hintereinander dasselbe.
        </SplitLines>

        <div className="mt-14 grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-[1.15fr_0.85fr]">
          {/* Die Kulturen */}
          <Reveal>
            <ul className="flex flex-col">
              {CROPS.map((crop, i) => {
                const isActive = i === active
                return (
                  <li key={crop.name} className="border-t border-[var(--hair)] last:border-b">
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      aria-current={isActive}
                      className="flex w-full items-baseline justify-between gap-6 py-4 text-left transition-opacity duration-300"
                      style={{ opacity: isActive ? 1 : 0.5 }}
                    >
                      <span
                        className="text-h3 leading-[1.05] transition-transform duration-500 ease-[var(--ease-soft)]"
                        style={{
                          fontFamily: 'var(--font-display)',
                          transform: isActive ? 'translateX(0.4rem)' : 'none',
                          fontStyle: isActive ? 'italic' : 'normal',
                        }}
                      >
                        {crop.name}
                      </span>
                      <span className="u-mono shrink-0 text-[color:var(--stone)]">
                        {crop.season}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Reveal>

          {/* Die Erklaerung */}
          <div className="lg:sticky lg:top-[18vh] lg:self-start">
            <div className="min-h-[14rem]" aria-live="polite">
              <p className="u-mono text-[color:var(--clay)]">{CROPS[active].role}</p>
              <p
                key={CROPS[active].name}
                className="mt-6 text-lead"
                style={{ animation: 'none' }}
              >
                {CROPS[active].note}
              </p>
            </div>
            <FieldLine className="mt-8" animate={false} />
            <p className="mt-6 max-w-[34ch] text-[color:var(--stone)]">
              Die Reihenfolge ist der eigentliche Pflanzenschutz. Wer sie einhält, braucht weniger
              von allem anderen.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
