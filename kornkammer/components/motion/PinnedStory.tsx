'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/motion'
import type { Station } from '@/data/stations'
import MediaFrame from '@/components/ui/MediaFrame'

/**
 * „Vom Boden auf den Teller".
 *
 * Links bleibt das Medium stehen, rechts laufen die Stationen durch.
 * Die Szene links wechselt mit jeder Station, eine Furchenlinie zeigt den
 * Fortschritt. Ordnung entsteht ueber Wortmarken, nicht ueber Ziffern.
 */
export default function PinnedStory({ stations }: { stations: Station[] }) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = root.current
    const list = track.current
    if (!el || !list) return
    if (prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      const steps = gsap.utils.toArray<HTMLElement>('[data-station]', list)

      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        // Jede Station bekommt eine Bildschirmhoehe Scrollweg.
        end: () => `+=${window.innerHeight * steps.length}`,
        pin: true,
        pinSpacing: true,
        scrub: true,
        onUpdate: (self) => {
          const i = Math.min(steps.length - 1, Math.floor(self.progress * steps.length))
          setActive(i)
        },
      })

      // Textbloecke laufen mit dem Fortschritt durch.
      gsap.to(steps, {
        yPercent: -100 * (steps.length - 1),
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: () => `+=${window.innerHeight * steps.length}`,
          scrub: 0.6,
        },
      })

      return () => st.kill()
    }, el)

    return () => ctx.revert()
  }, [stations.length])

  return (
    <section
      ref={root}
      aria-label="Vom Boden auf den Teller"
      className="relative min-h-[100svh] overflow-hidden bg-soilDeep"
    >
      <div className="shell grid h-[100svh] grid-cols-1 items-center gap-[var(--gutter)] py-[clamp(4rem,10vh,8rem)] lg:grid-cols-[1.05fr_0.95fr]">
        {/* Fixiertes Medium. Die Hoehe steht explizit: in einem zentrierten
            Grid loest `height:100%` sonst gegen die Inhaltshoehe auf und die
            absolut gesetzten Ebenen fallen auf null zusammen. */}
        <div className="relative hidden h-[68svh] self-center lg:block">
          {/* Die Ebene wird hier positioniert, nicht im MediaFrame: dessen
              eigenes `relative` wuerde ein `absolute` von aussen schlagen. */}
          {stations.map((s, i) => (
            <div
              key={s.mark}
              className="absolute inset-0"
              style={{
                opacity: i === active ? 1 : 0,
                transform: `scale(${i === active ? 1 : 1.06})`,
                transition: 'opacity .8s var(--ease-soft), transform 1.2s var(--ease-soft)',
              }}
              aria-hidden={i !== active}
            >
              <MediaFrame
                src={s.media}
                alt={s.mediaAlt}
                className="h-full w-full"
                reveal={false}
                sizes="50vw"
              />
            </div>
          ))}
          {/* Furchenlinie als Fortschritt */}
          <div className="absolute -bottom-6 left-0 right-0 h-px bg-[var(--hair)]">
            <div
              className="h-px bg-wheat transition-[width] duration-700 ease-[var(--ease-soft)]"
              style={{ width: `${((active + 1) / stations.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Laufende Stationen */}
        <div className="relative h-[52svh] overflow-hidden lg:h-[60svh]">
          <div ref={track} className="absolute inset-0">
            {stations.map((s) => (
              <article
                key={s.mark}
                data-station
                className="flex h-full flex-col justify-center"
                aria-hidden={false}
              >
                <p className="u-mono text-wheat">{s.mark}</p>
                <h3 className="mt-5 text-h3 u-italic max-w-[18ch]">{s.title}</h3>
                <p className="mt-6 max-w-measure text-[color:var(--stone)]">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
