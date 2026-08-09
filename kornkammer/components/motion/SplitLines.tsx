'use client'

import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '@/lib/gsap'
import { MOTION, TRIGGER, prefersReducedMotion } from '@/lib/motion'
import { splitLines } from '@/lib/split'

type Props = {
  children: string
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  className?: string
  id?: string
  delay?: number
  /** Ohne ScrollTrigger sofort abspielen (Hero) */
  immediate?: boolean
  stagger?: number
}

/**
 * Zeilenweises Enthuellen ueber Masken.
 *
 * Die Aufteilung wird nach jedem Breakpoint-Wechsel neu gemessen, weil sich
 * die Zeilenumbrueche sonst nicht mehr mit den Masken decken.
 */
export default function SplitLines({
  children,
  as: Tag = 'h2',
  className,
  id,
  delay = 0,
  immediate = false,
  stagger = MOTION.stagger,
}: Props) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) return

    let split: ReturnType<typeof splitLines> | null = null
    let tween: gsap.core.Tween | null = null
    let trigger: ScrollTrigger | null = null

    const build = () => {
      tween?.kill()
      trigger?.kill()
      split?.revert()

      split = splitLines(el)
      // 140 statt knapp ueber 100: die Maske hat oben und unten Polster,
      // sonst lugt die Zeile im Ausgangszustand darunter hervor.
      const from = { yPercent: 140 }
      const to = {
        yPercent: 0,
        duration: MOTION.reveal.duration,
        ease: MOTION.reveal.ease,
        stagger,
        delay,
      }

      if (immediate) {
        tween = gsap.fromTo(split.inners, from, to)
      } else {
        tween = gsap.fromTo(split.inners, from, {
          ...to,
          scrollTrigger: { trigger: el, start: TRIGGER.enter, once: true },
        })
        trigger = tween.scrollTrigger ?? null
      }
    }

    build()

    // Nur bei echter Breitenaenderung neu bauen: auf Mobilgeraeten aendert
    // sich die Hoehe staendig, wenn die Adressleiste ein- und ausfaehrt.
    let lastWidth = window.innerWidth
    const onResize = () => {
      if (Math.abs(window.innerWidth - lastWidth) < 40) return
      lastWidth = window.innerWidth
      build()
      ScrollTrigger.refresh()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      tween?.kill()
      trigger?.kill()
      split?.revert()
    }
  }, [children, delay, immediate, stagger])

  return (
    <Tag ref={ref as never} id={id} className={className}>
      {children}
    </Tag>
  )
}
