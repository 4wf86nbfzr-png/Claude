'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { gsap } from '@/lib/gsap'
import { prefersReducedMotion } from '@/lib/motion'
import FullscreenMenu from './FullscreenMenu'

/**
 * Die Kopfzeile haelt sich zurueck: Wortmarke links, ein Schalter rechts.
 * Beim Abwaertsscrollen verschwindet sie, beim Aufwaertsscrollen kommt sie
 * zurueck — im Hero soll nichts vor dem Bild stehen.
 */
export default function Nav() {
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLElement>(null)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    const el = bar.current
    if (!el || prefersReducedMotion()) return

    let last = window.scrollY
    let hidden = false

    const onScroll = () => {
      const y = window.scrollY
      const down = y > last && y > window.innerHeight * 0.4
      last = y

      if (down && !hidden) {
        hidden = true
        gsap.to(el, { yPercent: -120, duration: 0.45, ease: 'power3.out' })
      } else if (!down && hidden) {
        hidden = false
        gsap.to(el, { yPercent: 0, duration: 0.45, ease: 'power3.out' })
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        ref={bar}
        className="fixed inset-x-0 top-0 z-50 mix-blend-difference"
        style={{ color: 'var(--paper)' }}
      >
        <div className="shell flex items-center justify-between py-5">
          <Link href="/" className="u-mono tracking-[0.24em]" aria-label="Team Kornkammer, Startseite">
            Kornkammer
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="hauptmenue"
            className="u-mono flex items-center gap-3 py-2"
          >
            <span>{open ? 'Schließen' : 'Menü'}</span>
            <span aria-hidden className="relative block h-3 w-6">
              <span
                className="absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-[var(--ease-swift)]"
                style={{ top: 3, transform: open ? 'translateY(3px) rotate(45deg)' : 'none' }}
              />
              <span
                className="absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-[var(--ease-swift)]"
                style={{ top: 9, transform: open ? 'translateY(-3px) rotate(-45deg)' : 'none' }}
              />
            </span>
          </button>
        </div>
      </header>

      <FullscreenMenu open={open} onClose={() => setOpen(false)} />
    </>
  )
}
