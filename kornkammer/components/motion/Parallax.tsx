'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'

type Props = {
  children: React.ReactNode
  /** Anteil der Elementhoehe, um den verschoben wird. Bleibt unter 0.12. */
  amount?: number
  className?: string
}

export default function Parallax({ children, amount = MOTION.parallax, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    const shift = Math.min(Math.abs(amount), 0.12) * Math.sign(amount || 1)

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: -shift * 100 },
        {
          yPercent: shift * 100,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      )
    }, el)

    return () => ctx.revert()
  }, [amount])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
