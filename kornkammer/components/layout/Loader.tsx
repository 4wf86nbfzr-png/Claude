'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'

/**
 * Kein Spinner, keine kuenstliche Wartezeit.
 *
 * Der Wortlaut erscheint, die Furche zieht einmal durch, dann gibt der
 * Loader den Hero frei — spaetestens aber nach kurzer Zeit, damit niemand
 * auf ein haengendes Netzwerk wartet.
 */
export default function Loader() {
  const root = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const el = root.current
    if (!el) return

    if (prefersReducedMotion()) {
      setDone(true)
      return
    }

    const path = el.querySelector('path')
    const word = el.querySelector('[data-word] span')

    const tl = gsap.timeline({
      onComplete: () => setDone(true),
    })

    if (word) tl.fromTo(word, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: MOTION.reveal.ease })

    if (path instanceof SVGPathElement) {
      const len = path.getTotalLength()
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })
      tl.to(path, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0.3)
    }

    tl.to(el, { yPercent: -101, duration: 0.75, ease: 'expo.inOut' }, '+=0.05')

    // Sicherheitsnetz: laenger als das darf der Vorhang nie stehen bleiben.
    const guard = window.setTimeout(() => setDone(true), 2600)

    return () => {
      window.clearTimeout(guard)
      tl.kill()
    }
  }, [])

  if (done) return null

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-soilDeep"
    >
      <div data-word className="overflow-hidden">
        <span className="block text-h2 uppercase tracking-[-0.02em]">Kornkammer</span>
      </div>
      <svg
        viewBox="0 0 1200 8"
        preserveAspectRatio="none"
        className="mt-6 w-[min(70vw,40rem)]"
        style={{ height: 8, overflow: 'visible' }}
      >
        <path
          d="M0 4.6 C 180 3.2, 300 5.4, 470 4.1 S 760 2.6, 930 4.4 S 1120 5.1, 1200 3.9"
          fill="none"
          stroke="var(--wheat)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
