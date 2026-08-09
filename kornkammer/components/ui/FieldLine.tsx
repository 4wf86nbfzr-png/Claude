'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/motion'

/**
 * Die Furche: das eine wiederkehrende Zeichen der Seite.
 * Sie taucht im Loader auf, trennt Sektionen und zeigt in der Story
 * den Fortschritt. Haardünn, leicht unruhig gezeichnet — eine Furche
 * ist nie ganz gerade.
 */
export default function FieldLine({
  className,
  animate = true,
  tone = 'hair',
}: {
  className?: string
  animate?: boolean
  tone?: 'hair' | 'wheat'
}) {
  const ref = useRef<SVGPathElement>(null)

  useEffect(() => {
    const path = ref.current
    if (!path || !animate) return
    if (prefersReducedMotion()) return

    const len = path.getTotalLength()
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len })

    const tween = gsap.to(path, {
      strokeDashoffset: 0,
      duration: 1.6,
      ease: 'expo.out',
      scrollTrigger: { trigger: path, start: 'top 92%', once: true },
    })

    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [animate])

  return (
    <svg
      className={className}
      viewBox="0 0 1200 8"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={{ width: '100%', height: 8, display: 'block', overflow: 'visible' }}
    >
      <path
        ref={ref}
        d="M0 4.6 C 180 3.2, 300 5.4, 470 4.1 S 760 2.6, 930 4.4 S 1120 5.1, 1200 3.9"
        fill="none"
        stroke={tone === 'wheat' ? 'var(--wheat)' : 'var(--hair-strong)'}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
