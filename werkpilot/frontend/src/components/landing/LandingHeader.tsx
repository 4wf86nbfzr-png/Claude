"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [["#ablauf", "So funktioniert's"], ["#funktionen", "Funktionen"], ["#demo", "Demo"], ["#preise", "Preise"], ["#faq", "FAQ"]];

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
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">W</span>WerkPilot <span className="text-accent-2">AI</span>
        </Link>
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
          {nav.map(([h, l]) => <a key={h} href={h} className="hover:text-white">{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/anmelden" className="hidden rounded-full px-4 py-2 text-sm text-ink-2 hover:text-white sm:inline-block">Anmelden</Link>
          <Link href="/registrieren" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-accent-2 hover:text-white">Kostenlos testen</Link>
          <button aria-label="Menü" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ml-1 grid h-9 w-9 place-items-center rounded-full border border-line text-white md:hidden">☰</button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile Navigation" className="border-t border-line bg-[#0b0d12] px-5 py-3 md:hidden">
          {nav.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block py-2 text-ink-2">{l}</a>)}
          <Link href="/anmelden" className="block py-2 text-ink-2">Anmelden</Link>
        </nav>
      )}
    </header>
  );
}
