'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'

/**
 * Seitenwechsel: eine Flaeche faehrt kurz durch und gibt die neue Seite frei.
 * Bleibt unter einer halben Sekunde — laenger fuehlt sich ein Wechsel nach
 * Ladezeit an, nicht nach Gestaltung.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const veil = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useEffect(() => {
    // Nach jedem Wechsel muessen die Trigger neu vermessen werden.
    ScrollTrigger.refresh()

    if (first.current) {
      first.current = false
      return
    }
    const el = veil.current
    if (!el || prefersReducedMotion()) return

    window.scrollTo(0, 0)

    gsap
      .timeline()
      .set(el, { transformOrigin: 'bottom', scaleY: 1, autoAlpha: 1 })
      .to(el, {
        scaleY: 0,
        duration: MOTION.page.duration,
        ease: MOTION.page.ease,
        transformOrigin: 'top',
      })
      .set(el, { autoAlpha: 0 })
  }, [pathname])

  return (
    <>
      <div
        ref={veil}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[90] bg-soilDeep opacity-0"
      />
      {children}
    </>
  )
}
