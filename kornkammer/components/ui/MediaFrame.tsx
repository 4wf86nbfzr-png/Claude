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
 * Solange kein echtes Foto vorliegt, zeigt der Rahmen einen beschrifteten
 * Platzhalter statt eines kaputten Bildes — die Bewegung ist trotzdem
 * vollstaendig implementiert, damit spaeter nur die Datei getauscht wird.
 */
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
  const [failed, setFailed] = useState(false)

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
      {!failed && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      {failed && (
        <div
          role="img"
          aria-label={`Platzhalter. Vorgesehenes Motiv: ${alt}`}
          className="flex h-full w-full flex-col justify-between p-5 sm:p-7"
          style={{
            background:
              'repeating-linear-gradient(103deg, var(--soil-deep) 0px, var(--soil-deep) 26px, var(--soil) 26px, var(--soil) 27px)',
          }}
        >
          <span className="u-mono text-[color:var(--stone)]">Bild folgt</span>
          <span className="max-w-[26ch] text-[0.9rem] leading-snug text-[color:var(--stone)]">
            {alt}
          </span>
        </div>
      )}
    </div>
  )
}
