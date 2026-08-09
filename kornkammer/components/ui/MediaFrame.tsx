'use client'

import { CSSProperties, useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, TRIGGER, prefersReducedMotion } from '@/lib/motion'

type Props = {
  src: string
  alt: string
  className?: string
  style?: CSSProperties
  /** Vorhang-Reveal beim Eintritt */
  reveal?: boolean
  priority?: boolean
  sizes?: string
}

/**
 * Bildrahmen mit Vorhang-Reveal.
 *
 * Solange kein echtes Foto vorliegt, tritt ein beschriftetes Platzhalterbild
 * an seine Stelle. Wichtig ist, dass das ueber einen Quellenwechsel am
 * selben `img` laeuft und nicht ueber ein Ersatz-Element: sonst zeigt der
 * Browser fuer einen Moment sein kaputtes Bildsymbol samt Alternativtext,
 * und genau das sieht nach Fehler aus statt nach Absicht.
 *
 * Die Bewegung ist vollstaendig implementiert. Sobald eine Datei unter dem
 * erwarteten Pfad liegt, greift sie ohne weitere Aenderung.
 */
const PLATZHALTER = '/images/platzhalter.webp'

export default function MediaFrame({
  src,
  alt,
  className,
  style,
  reveal = true,
  priority = false,
  sizes = '(min-width: 1024px) 50vw, 100vw',
}: Props) {
  const root = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [fehlt, setFehlt] = useState(false)

  /* Der Fehler kann fallen, bevor React den Handler haengt: das `img` steht
     schon im ausgelieferten Markup, der Browser versucht es sofort, und
     `onError` kommt zu spaet. Deshalb beim Einhaengen einmal nachsehen. */
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) setFehlt(true)
  }, [])

  useEffect(() => {
    const el = root.current
    const img = imgRef.current
    if (!el || !reveal || prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { clipPath: 'inset(0% 0% 100% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          duration: 1.2,
          ease: MOTION.reveal.ease,
          scrollTrigger: { trigger: el, start: TRIGGER.enter, once: true },
        },
      )
      if (img) {
        gsap.fromTo(
          img,
          { scale: MOTION.imageScale.from },
          {
            scale: MOTION.imageScale.to,
            duration: 1.6,
            ease: MOTION.reveal.ease,
            scrollTrigger: { trigger: el, start: TRIGGER.enter, once: true },
          },
        )
      }
    }, el)

    return () => ctx.revert()
  }, [reveal])

  return (
    <div
      ref={root}
      className={`relative overflow-hidden bg-soilDeep ${className ?? ''}`}
      style={style}
    >
      <img
        ref={imgRef}
        src={fehlt ? PLATZHALTER : src}
        alt={fehlt ? `Platzhalter. Vorgesehenes Motiv: ${alt}` : alt}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => {
          if (!fehlt) setFehlt(true)
        }}
        className="h-full w-full object-cover"
        /* Ohne das zeigt der Browser den Alternativtext als rohen Fliesstext,
           solange das Bild noch nicht ausgetauscht ist. */
        style={{ color: 'transparent' }}
      />

      {/* Welches Motiv hier spaeter steht, gehoert sichtbar dazu. */}
      {fehlt && (
        <span className="u-mono pointer-events-none absolute inset-x-0 bottom-0 block bg-gradient-to-t from-[rgba(13,10,6,0.9)] to-transparent p-4 pt-10 text-[color:var(--stone)]">
          {alt}
        </span>
      )}
    </div>
  )
}
