'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * Vertikale Eingabe wird in horizontale Bewegung uebersetzt.
 * Genau eine Stelle auf der Seite, sonst wird es zur Masche.
 *
 * Unterhalb des Breakpoints und bei reduzierter Bewegung bleibt es ein
 * normaler horizontaler Streifen, den man mit dem Finger schiebt.
 */
export default function HorizontalScroll({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    const inner = track.current
    if (!el || !inner) return

    const mm = gsap.matchMedia()

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const distance = () => inner.scrollWidth - window.innerWidth

      const tween = gsap.to(inner, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      })

      return () => {
        tween.scrollTrigger?.kill()
        tween.kill()
        gsap.set(inner, { x: 0 })
      }
    })

    return () => mm.revert()
  }, [])

  const fallback = typeof window !== 'undefined' && prefersReducedMotion()

  return (
    <div ref={root} className={className}>
      <div
        ref={track}
        className={
          'flex items-stretch ' +
          (fallback ? 'overflow-x-auto' : 'lg:will-change-transform max-lg:overflow-x-auto')
        }
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {children}
      </div>
    </div>
  )
}
