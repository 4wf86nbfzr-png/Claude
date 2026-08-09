'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'

/**
 * Der Zeiger zieht das Element leicht an. Nur mit echter Maus:
 * auf Touch gibt es kein Hover, und Tastaturbedienung darf sich davon
 * nicht beeindrucken lassen.
 */
export default function MagneticButton({
  children,
  strength = 0.28,
  className,
}: {
  children: React.ReactNode
  strength?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const quickX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' })
    const quickY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' })

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      quickX((e.clientX - (r.left + r.width / 2)) * strength)
      quickY((e.clientY - (r.top + r.height / 2)) * strength)
    }
    const onLeave = () => {
      quickX(0)
      quickY(0)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      gsap.killTweensOf(el)
    }
  }, [strength])

  return (
    <span ref={ref} className={'inline-block ' + (className ?? '')}>
      {children}
    </span>
  )
}

export { MOTION }
