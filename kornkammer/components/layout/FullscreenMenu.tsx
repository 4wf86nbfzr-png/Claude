'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'
import { FARM } from '@/data/farm'
import { NEBEN, RECHTLICHES } from '@/data/navigation'
import FieldLine from '@/components/ui/FieldLine'

/**
 * Das Menue traegt nicht mehr die Hauptbereiche — die stehen in der
 * Kopfzeile und auf dem Telefon in der App-Leiste. Hier liegt, was man
 * gezielt sucht: die Menschen, der Kontakt, die Referenzen und die Wege
 * nach draussen.
 *
 * Ohne eigene Wortmarke: die Kopfzeile bleibt sichtbar ueber dem Menue, auf
 * dem Telefon die App-Leiste darunter. Ein drittes Logo waere eines zu viel.
 */
export default function FullscreenMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const items = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el) return

    if (prefersReducedMotion()) {
      gsap.set(el, { autoAlpha: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' })
      return
    }

    if (open) {
      const links = items.current?.querySelectorAll('a') ?? []
      gsap
        .timeline()
        .set(el, { pointerEvents: 'auto' })
        .fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power2.out' })
        .fromTo(
          links,
          { yPercent: 140 },
          { yPercent: 0, duration: 0.85, ease: MOTION.reveal.ease, stagger: 0.05 },
          0.05,
        )
    } else {
      gsap.to(el, {
        autoAlpha: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => gsap.set(el, { pointerEvents: 'none' }),
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div
      ref={root}
      id="hauptmenue"
      className="fixed inset-0 z-[60] bg-soilDeep opacity-0"
      style={{ pointerEvents: 'none', visibility: 'hidden' }}
      aria-hidden={!open}
    >
      <nav
        className="shell flex h-full flex-col justify-center overflow-y-auto py-24"
        aria-label="Weitere Seiten"
      >
        <ul ref={items} className="flex flex-col">
          {NEBEN.map((item) => (
            <li key={item.href} className="mask-line">
              <Link
                href={item.href}
                tabIndex={open ? 0 : -1}
                className="block py-1 font-display text-h2 leading-[1.04] tracking-[-0.03em] transition-colors duration-300 hover:text-wheat"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <FieldLine className="mt-10" animate={false} />

        <div className="mt-8 flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
          <div>
            <p className="u-mono text-[color:var(--stone)]">Folgen und kaufen</p>
            <ul className="mt-4 flex flex-col gap-2">
              <li>
                <a
                  href={FARM.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={open ? 0 : -1}
                  className="text-lead hover:text-wheat"
                >
                  Instagram <span aria-hidden>↗</span>
                </a>
              </li>
              <li>
                <a
                  href={FARM.shop}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={open ? 0 : -1}
                  className="text-lead hover:text-wheat"
                >
                  Onlineshop <span aria-hidden>↗</span>
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="u-mono text-[color:var(--stone)]">Am Hof</p>
            <address className="mt-4 not-italic leading-relaxed text-[color:var(--stone)]">
              {FARM.address.street}
              <br />
              {FARM.address.zip}&nbsp;{FARM.address.city}
            </address>
            <div className="mt-3 flex flex-col gap-1">
              <a href={FARM.phone.href} tabIndex={open ? 0 : -1} className="hover:text-wheat">
                {FARM.phone.display}
              </a>
              <a
                href={FARM.email.href}
                tabIndex={open ? 0 : -1}
                className="break-all hover:text-wheat"
              >
                {FARM.email.display}
              </a>
            </div>
          </div>

          <ul className="flex gap-6">
            {RECHTLICHES.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  tabIndex={open ? 0 : -1}
                  className="u-mono text-[color:var(--stone)] hover:text-paper"
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  )
}
