import Link from 'next/link'
import SplitLines from '@/components/motion/SplitLines'
import Reveal from '@/components/motion/Reveal'
import Eyebrow from '@/components/ui/Eyebrow'
import FieldLine from '@/components/ui/FieldLine'
import { CERTIFICATIONS } from '@/data/certifications'

/**
 * Bio verstehen.
 *
 * Der wichtigste Punkt steht zuerst: Bioland geht ueber die gesetzlichen
 * Mindeststandards hinaus. Alles hier ist belegbar formuliert — keine
 * Wertungen, die sich nicht halten lassen.
 */
export default function BioCerts() {
  return (
    <section className="section on-paper" aria-labelledby="bio-titel">
      <div className="shell">
        <Eyebrow items={['Bio verstehen']} />
        <SplitLines
          as="h2"
          id="bio-titel"
          className="optical mt-8 max-w-[17ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Bio ist nicht gleich Bio. Der Unterschied steht im Regelwerk.
        </SplitLines>

        <div className="mt-16 flex flex-col">
          {CERTIFICATIONS.map((cert) => (
            <Reveal key={cert.name} as="article">
              <div className="border-t border-[var(--hair)] py-[clamp(2rem,5vh,3.5rem)]">
                <div className="grid grid-cols-1 gap-[clamp(1.5rem,4vw,3.5rem)] lg:grid-cols-[0.85fr_1.15fr]">
                  <div>
                    {cert.logo ? (
                      <img
                        src={cert.logo}
                        alt={cert.name}
                        width={112}
                        height={112}
                        loading="lazy"
                        decoding="async"
                        style={{ width: 112, height: 112 }}
                      />
                    ) : (
                      <h3
                        className="text-h2 leading-[0.98] tracking-[-0.03em]"
                        style={{ fontVariationSettings: "'SOFT' 30" }}
                      >
                        {cert.name}
                      </h3>
                    )}
                    {cert.logo && (
                      <h3 className="mt-5 text-h3 leading-[1] tracking-[-0.03em]">{cert.name}</h3>
                    )}
                    <p className="u-mono mt-4 text-[color:var(--clay)]">{cert.kind}</p>
                  </div>

                  <div>
                    <p className="text-lead u-italic max-w-[28ch]">{cert.claim}</p>
                    <p className="mt-6 max-w-measure text-[color:var(--stone)]">{cert.body}</p>
                    <ul className="mt-7 flex flex-col gap-3">
                      {cert.points.map((point) => (
                        <li key={point} className="flex items-baseline gap-4">
                          <span aria-hidden className="mt-2 block h-px w-6 shrink-0 bg-[var(--clay)]" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <FieldLine className="mt-4" tone="wheat" />

        <Link
          href="/bio"
          className="u-mono mt-12 inline-flex items-center gap-3 border-b border-[var(--hair-dark-strong)] pb-2 transition-colors hover:border-current"
        >
          Ausführlich nachlesen
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  )
}
