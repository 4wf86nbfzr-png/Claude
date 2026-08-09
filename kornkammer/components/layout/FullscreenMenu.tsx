'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { MOTION, prefersReducedMotion } from '@/lib/motion'
import { FARM } from '@/data/farm'
import FieldLine from '@/components/ui/FieldLine'

const PRIMARY = [
  { href: '/hof', label: 'Der Hof' },
  { href: '/produkte', label: 'Produkte' },
  { href: '/bio', label: 'Bio verstehen' },
  { href: '/hofladen', label: 'Direkt vom Hof' },
  { href: '/team', label: 'Team' },
  { href: '/galerie', label: 'Galerie' },
  { href: '/kontakt', label: 'Kontakt' },
]

export default function FullscreenMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const items = useRef<HTMLUListElement>(null)

  /* Auf, zu, und der Fokus bleibt drin, solange es offen ist. */
  useEffect(() => {
    const el = root.current
    if (!el) return

    if (prefersReducedMotion()) {
      gsap.set(el, { autoAlpha: open ? 1 : 0 })
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
      className="fixed inset-0 z-40 bg-soilDeep opacity-0"
      style={{ pointerEvents: 'none', visibility: 'hidden' }}
      aria-hidden={!open}
    >
      {/* Auf niedrigen Fenstern muss das Menue scrollen duerfen, sonst
          verschwinden Adresse und Shoplink unter der Kante. */}
      <nav
        className="shell flex h-full flex-col justify-center overflow-y-auto py-24"
        aria-label="Hauptmenü"
      >
        <ul ref={items} className="flex flex-col">
          {PRIMARY.map((item) => (
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

        <div className="mt-8 flex flex-wrap items-start justify-between gap-8">
          <address className="not-italic text-[color:var(--stone)]">
            {FARM.address.street}
            <br />
            {FARM.address.zip}&nbsp;{FARM.address.city}
          </address>
          <div className="flex flex-col gap-2">
            <a href={FARM.phone.href} tabIndex={open ? 0 : -1} className="hover:text-wheat">
              {FARM.phone.display}
            </a>
            <a href={FARM.email.href} tabIndex={open ? 0 : -1} className="hover:text-wheat">
              {FARM.email.display}
            </a>
          </div>
          <a
            href={FARM.shop}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={open ? 0 : -1}
            className="u-mono text-wheat"
          >
            Onlineshop ↗
          </a>
        </div>
      </nav>
    </div>
  )
}
