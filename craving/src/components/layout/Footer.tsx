import Link from "next/link";
import { BRAND, DEMO_MODE } from "@/data/config";
import { openingSchedule } from "@/lib/opening";
import { DELIVERY_ZONES } from "@/data/config";
import { formatPrice } from "@/lib/format";

const COLUMNS = [
  {
    title: "Bestellen",
    links: [
      { href: "/menue", label: "Menue" },
      { href: "/bauen/doener", label: "Doener bauen" },
      { href: "/bauen/pizza", label: "Pizza bauen" },
      { href: "/bauen/croque", label: "Croque bauen" },
      { href: "/warenkorb", label: "Warenkorb" },
    ],
  },
  {
    title: "Konto",
    links: [
      { href: "/konto", label: "Uebersicht" },
      { href: "/bestellungen", label: "Bestellungen" },
      { href: "/konto/favoriten", label: "Favoriten" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { href: "/rechtliches/impressum", label: "Impressum" },
      { href: "/rechtliches/datenschutz", label: "Datenschutz" },
      { href: "/rechtliches/agb", label: "AGB" },
      { href: "/rechtliches/allergene", label: "Allergene & Zusatzstoffe" },
    ],
  },
];

export function Footer() {
  const schedule = openingSchedule();

  return (
    <footer className="border-t border-line bg-ink-2">
      <div className="shell py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="display display-m">{BRAND.wordmark}</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{BRAND.subline}</p>
            {DEMO_MODE && (
              <p className="mt-6 inline-flex rounded-full border border-saffron/30 bg-saffron/10 px-3 py-1.5 text-[0.6875rem] font-medium text-saffron">
                Testbetrieb — es werden keine echten Bestellungen ausgeloest.
              </p>
            )}
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="kicker">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-chrome transition-colors hover:text-paper">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <hr className="rule my-12" />

        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="kicker">Oeffnungszeiten</p>
            <dl className="mt-4 space-y-1.5 text-sm">
              {schedule.map((row) => (
                <div key={row.days} className="flex justify-between gap-4 text-chrome">
                  <dt>{row.days}</dt>
                  <dd className="num text-muted">{row.hours}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <p className="kicker">Liefergebiete</p>
            <ul className="mt-4 space-y-2 text-sm text-chrome">
              {DELIVERY_ZONES.map((z) => (
                <li key={z.id} className="flex flex-col">
                  <span>{z.label}</span>
                  <span className="num text-xs text-muted">
                    ab {formatPrice(z.minOrder)} · {formatPrice(z.fee)} Lieferung · ca. {z.etaMinutes} Min.
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="kicker">Kontakt</p>
            <address className="mt-4 space-y-1 text-sm not-italic text-chrome">
              <p>{BRAND.legalName}</p>
              <p>{BRAND.street}</p>
              <p>
                {BRAND.postalCode} {BRAND.city}
              </p>
              <p className="num">{BRAND.phone}</p>
            </address>
            <p className="mt-3 text-xs text-muted">
              Firmendaten sind Platzhalter und werden vor dem Live-Gang ersetzt.
            </p>
          </div>
        </div>

        <p className="mt-12 text-xs text-muted">
          © {new Date().getFullYear()} {BRAND.name}. Alle Preise inkl. MwSt.
        </p>
      </div>
    </footer>
  );
}
