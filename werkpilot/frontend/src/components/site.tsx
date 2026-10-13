import Link from "next/link";

const nav = [
  { href: "/funktionen", label: "Funktionen" },
  { href: "/branchen", label: "Branchen" },
  { href: "/preise", label: "Preise" },
  { href: "/demo", label: "Demo" },
  { href: "/hilfe", label: "Hilfe" },
];

export function Logo() {
  return (
    <Link href="/" className="text-lg font-semibold tracking-tight">
      Clairify
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <a href="#inhalt" className="skip-link">Zum Inhalt springen</a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Hauptnavigation" className="hidden items-center gap-6 text-sm md:flex">
          {nav.map((n) => <Link key={n.href} href={n.href} className="text-ink-2 hover:text-ink">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/anmelden" className="hidden rounded-full px-4 py-2 text-sm text-ink-2 hover:bg-sand-2 sm:inline-block">Anmelden</Link>
          <Link href="/registrieren" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-2">Kostenlos testen</Link>
        </div>
      </div>
      <nav aria-label="Mobile Navigation" className="flex gap-4 overflow-x-auto border-t border-line px-4 py-2 text-sm md:hidden">
        {nav.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap text-ink-2">{n.label}</Link>)}
        <Link href="/anmelden" className="whitespace-nowrap text-ink-2">Anmelden</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-muted">KI-gestützte Anfrage- und Terminorganisation für kleine Handwerksbetriebe. Entwickelt und betrieben in Deutschland.</p>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Produkt</h3>
          <ul className="space-y-1 text-ink-2">
            <li><Link href="/funktionen">Funktionen</Link></li>
            <li><Link href="/branchen">Branchen</Link></li>
            <li><Link href="/preise">Preise</Link></li>
            <li><Link href="/demo">Interaktive Demo</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Hilfe</h3>
          <ul className="space-y-1 text-ink-2">
            <li><Link href="/hilfe">Hilfezentrum</Link></li>
            <li><Link href="/kontakt">Kontakt</Link></li>
            <li><Link href="/anmelden">Anmelden</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-semibold">Rechtliches</h3>
          <ul className="space-y-1 text-ink-2">
            <li><Link href="/impressum">Impressum</Link></li>
            <li><Link href="/datenschutz">Datenschutzerklärung</Link></li>
            <li><Link href="/agb">AGB</Link></li>
            <li><Link href="/widerruf">Widerrufsbelehrung</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Clairify · Keine Tracking-Cookies, keine Weitergabe von Besucherdaten.</div>
    </footer>
  );
}
