"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [["#einblick", "Einblick"], ["#ablauf", "So funktioniert es"], ["#funktionen", "Funktionen"], ["#demo", "Demo"], ["#preise", "Preise"], ["#faq", "Fragen"]];

export function LandingHeader() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    queueMicrotask(on); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`hdr fixed inset-x-0 top-0 z-50 ${solid ? "is-solid" : ""}`}>
      <a href="#inhalt" className="skip-link">Zum Inhalt springen</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink">Clairify</Link>
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
          {nav.map(([h, l]) => <a key={h} href={h} className="hover:text-ink">{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/anmelden" className="hidden rounded-full px-4 py-2 text-sm text-ink-2 hover:text-ink sm:inline-block">Anmelden</Link>
          <Link href="/registrieren" className="btn-primary rounded-full px-4 py-2 text-sm font-semibold">Kostenlos testen</Link>
          <button aria-label="Menü" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ml-1 grid h-9 w-9 place-items-center rounded-full text-ink md:hidden">☰</button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile Navigation" className="bg-[var(--c-bg)] px-5 py-3 md:hidden">
          {nav.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block py-2 text-ink-2">{l}</a>)}
          <Link href="/anmelden" className="block py-2 text-ink-2">Anmelden</Link>
        </nav>
      )}
    </header>
  );
}
