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
 * Die Reihenfolge ist hier der Inhalt: Klee gibt ab, Weizen holt sich das,
 * Dinkel kommt mit dem Rest aus. Deshalb steht die Position in der Folge als
 * Zahl in der Zeile — das ist keine Zierziffer, sondern die Aussage selbst.
 *
 * Wer mit Zeiger oder Tastatur auf eine Zeile geht, bekommt Erklaerung und,
 * wo vorhanden, das Foto dazu. Keine Prozentwerte, keine Kreisdiagramme:
 * dazu liegen keine belastbaren Flaechenzahlen vor.
 */
export default function CropRotation() {
  const [active, setActive] = useState(0)
  const aktuell = CROPS[active]

  return (
    <section className="section on-paper" aria-labelledby="fruchtfolge-titel">
      <div className="shell">
        <Eyebrow items={['Fruchtfolge', 'Sechs Glieder']} />
        <SplitLines
          as="h2"
          id="fruchtfolge-titel"
          className="optical mt-8 max-w-[18ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Kein Schlag trägt zweimal hintereinander dasselbe.
        </SplitLines>

        <div className="mt-14 grid grid-cols-1 gap-[clamp(2rem,5vw,4rem)] lg:grid-cols-[1.15fr_0.85fr]">
          {/* Die Glieder der Folge */}
          <Reveal>
            <ol className="flex flex-col">
              {CROPS.map((crop, i) => {
                const isActive = i === active
                return (
                  <li
                    key={`${crop.name}-${i}`}
                    className="border-t border-[var(--hair)] last:border-b"
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      aria-current={isActive}
                      className="flex w-full items-baseline gap-4 py-4 text-left transition-opacity duration-300 sm:gap-6"
                      style={{ opacity: isActive ? 1 : 0.5 }}
                    >
                      <span className="u-mono w-[2ch] shrink-0 text-[color:var(--clay)]">
                        {i + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className="block text-h3 leading-[1.05] transition-transform duration-500 ease-[var(--ease-soft)]"
                          style={{
                            fontFamily: 'var(--font-display)',
                            transform: isActive ? 'translateX(0.4rem)' : 'none',
                            fontStyle: isActive ? 'italic' : 'normal',
                          }}
                        >
                          {crop.name}
                        </span>
                        {/* „oder“ statt Schrägstrich: gesprochen ergibt das einen
                            Satz, ein Schrägstrich ergibt Rauschen. Eigene Zeile,
                            damit die Alternativen nicht in die Rolle laufen. */}
                        {crop.auch && (
                          <span className="u-mono mt-2 block text-[color:var(--stone)]">
                            oder {crop.auch.join(', oder ')}
                          </span>
                        )}
                      </span>

                      <span className="u-mono hidden shrink-0 text-[color:var(--stone)] sm:block">
                        {crop.role}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </Reveal>

          {/* Die Erklaerung */}
          <div className="lg:sticky lg:top-[18vh] lg:self-start">
            <div aria-live="polite">
              {aktuell.image && (
                <img
                  key={aktuell.image}
                  src={aktuell.image}
                  alt={aktuell.imageAlt ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="mb-8 aspect-[3/2] w-full object-cover"
                  style={{ animation: 'ff-bild 0.7s var(--ease-out) both' }}
                />
              )}
              <p className="u-mono text-[color:var(--clay)] sm:hidden">{aktuell.role}</p>
              <p className="u-mono hidden text-[color:var(--clay)] sm:block">
                Glied {active + 1} von {CROPS.length}
              </p>
              <p key={`${aktuell.name}-${active}`} className="mt-6 min-h-[9rem] text-lead">
                {aktuell.note}
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
