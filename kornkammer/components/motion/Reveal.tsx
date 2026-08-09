'use client'

import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { MOTION, TRIGGER, prefersReducedMotion } from '@/lib/motion'

type Props = {
  children: React.ReactNode
  /** Versatz beim Eintritt */
  y?: number
  delay?: number
  /** Kinder gestaffelt statt Block als Ganzes */
  stagger?: boolean
  className?: string
  as?: 'div' | 'section' | 'li' | 'article' | 'figure' | 'header' | 'footer'
}

/**
 * Der Standard-Eintritt. Alles, was beim Scrollen erscheint, laeuft
 * hierueber — damit Dauer und Kurve auf der ganzen Seite gleich sind.
 */
export default function Reveal({
  children,
  y = 26,
  delay = 0,
  stagger = false,
  className,
  as: Tag = 'div',
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) return

    const targets = stagger ? Array.from(el.children) : [el]

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { y, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: MOTION.reveal.duration,
          ease: MOTION.reveal.ease,
          delay,
          stagger: stagger ? MOTION.stagger : 0,
          scrollTrigger: { trigger: el, start: TRIGGER.enter, once: true },
        },
      )
    }, el)

    return () => ctx.revert()
  }, [y, delay, stagger])

  return (
    <Tag ref={ref as never} className={className} data-reveal>
      {children}
    </Tag>
  )
}

/** Beim ersten Rendern ohne ScrollTrigger — fuer den Hero. */
export function RevealNow({
  children,
  delay = 0,
  y = 26,
  className,
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const tween = gsap.fromTo(
      el,
      { y, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: MOTION.reveal.duration, ease: MOTION.reveal.ease, delay },
    )
    return () => {
      tween.kill()
    }
  }, [delay, y])

  return (
    <div ref={ref} className={className} data-reveal>
      {children}
    </div>
  )
}

export { ScrollTrigger }
