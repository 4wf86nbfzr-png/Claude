"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string; note?: string };
/* Zwei Ausklappmenüs wie in der Referenz; alle bisherigen Sprungziele bleiben erreichbar. */
const PRODUKTE: Item[] = [
  { href: "#produkt", label: "Das Produkt", note: "Vier Funktionen auf einen Blick" },
  { href: "#einblick", label: "Einblick ins System", note: "Echte Bildschirme" },
  { href: "#ablauf", label: "So funktioniert es", note: "Eine Anfrage, einmal durch" },
  { href: "#funktionen", label: "Alle Funktionen" },
  { href: "#demo", label: "Demo", note: "Anfrage selbst eingeben" },
  { href: "#download", label: "Downloads" },
];
const LOESUNGEN: Item[] = [
  { href: "/branchen", label: "Alle Branchen" },
  { href: "#branchen", label: "Elektro" },
  { href: "#branchen", label: "Sanitär und Heizung" },
  { href: "#branchen", label: "Maler" },
  { href: "#branchen", label: "Dach" },
  { href: "#branchen", label: "Reinigung" },
  { href: "#branchen", label: "Gartenbau" },
];
const WEITERE: Item[] = [
  { href: "#preise", label: "Preise" },
  { href: "#faq", label: "Fragen" },
  { href: "/hilfe", label: "Hilfe" },
  { href: "/kontakt", label: "Über uns und Kontakt" },
];

function Dropdown({ label, items, onPick }: { label: string; items: Item[]; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className={`hdr-dd ${open ? "is-open" : ""}`} onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>{label} <span className="chev-dd" aria-hidden>▼</span></button>
      <div className="hdr-menu" role="group" aria-label={label}>
        {items.map((it, i) => <a key={i} href={it.href} onClick={() => { setOpen(false); onPick(); }}>{it.label}{it.note && <small>{it.note}</small>}</a>)}
      </div>
    </div>
  );
}

export function LandingHeader() {
  const [solid, setSolid] = useState(false);
  const [onHero, setOnHero] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => {
      setSolid(window.scrollY > 40);
      // Über dem dunklen Hero helle Schrift, auf der hellen Seite dunkle: Wechsel am unteren Rand des Heros
      const hero = document.querySelector<HTMLElement>(".hero");
      setOnHero(!hero || window.scrollY < hero.offsetTop + hero.offsetHeight - 64);
    };
    queueMicrotask(on); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <header className={`hdr fixed inset-x-0 top-0 z-50 ${solid ? "is-solid" : ""} ${onHero && !open ? "is-onhero" : ""} ${open ? "is-open" : ""}`}>
      <a href="#inhalt" className="skip-link">Zum Inhalt springen</a>
      <div className="relative mx-auto flex h-16 max-w-[96rem] items-center justify-between px-5 md:px-10">
        <Link href="/" className="hdr-logo">Clairify</Link>
        <nav aria-label="Hauptnavigation" className="hdr-nav hidden lg:flex">
          <Dropdown label="Produkte" items={PRODUKTE} onPick={close} />
          <Dropdown label="Lösungen" items={LOESUNGEN} onPick={close} />
          <a href="#preise">Preise</a>
          <Link href="/kontakt">Über uns</Link>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/anmelden" className="hidden px-3 py-2 text-sm text-ink-2 hover:text-ink md:inline-block">Anmelden</Link>
          <Link href="/registrieren" className="btn-primary hidden rounded-full px-4 py-2 text-sm font-semibold sm:inline-block">Kostenlos testen</Link>
          <button type="button" aria-label={open ? "Menü schließen" : "Menü öffnen"} aria-expanded={open} aria-controls="hdr-panel" onClick={() => setOpen((v) => !v)} className="hdr-burger">
            {open ? <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.6" /></svg> : <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden><path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="1.6" /></svg>}
          </button>
        </div>
      </div>
      {open && (
        <nav id="hdr-panel" aria-label="Gesamtes Menü" className="hdr-panel">
          <div className="cols">
            <div className="grp"><h2>Produkte</h2>{PRODUKTE.map((it, i) => <a key={i} href={it.href} onClick={close}>{it.label}</a>)}</div>
            <div className="grp"><h2>Lösungen</h2>{LOESUNGEN.map((it, i) => <a key={i} href={it.href} onClick={close}>{it.label}</a>)}</div>
            <div className="grp"><h2>Weiteres</h2>{WEITERE.map((it, i) => <a key={i} href={it.href} onClick={close}>{it.label}</a>)}
              <Link href="/anmelden" onClick={close}>Anmelden</Link>
              <Link href="/registrieren" onClick={close} className="btn-primary rounded-full font-semibold">Kostenlos testen</Link>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
