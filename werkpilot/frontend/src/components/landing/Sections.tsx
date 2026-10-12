"use client";

import Link from "next/link";
import { Reveal } from "./Reveal";
import { DemoForm } from "@/app/(marketing)/demo/demo-form";

const TRADES = [
  ["Elektro", "Stromausfall und fliegende Sicherungen werden als Notfall erkannt. Rückfrage nach Zählerschrank-Foto und Adresse ist vorbereitet."],
  ["Sanitär · Heizung · Klima", "Heizung aus, Rohrbruch, kein Warmwasser: ganz oben. Wartungsanfragen landen entspannt im Wochenplan."],
  ["Maler", "Angebotsanfragen mit Quadratmetern und Fotos. Nachfassen nach fünf Tagen, ohne dass jemand daran denken muss."],
  ["Dachdecker", "Sturmschäden sofort dringend. Besichtigungstermine stecken schon im ersten Entwurf."],
  ["Gebäudereinigung", "Regelobjekte, Sonderreinigung, Hausverwaltungen: getrennt nach Kategorie und Kunde."],
  ["Garten- und Landschaftsbau", "Saisonwellen abfangen: Eingangsbestätigung mit Rückfragen geht sofort raus, Besichtigungen werden gebündelt."],
];

export function Industries() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-28" aria-label="Branchen">
      <Reveal><p className="eyebrow mb-4">Für wen</p><h2 className="display max-w-3xl text-4xl text-white md:text-5xl">Gebaut für Betriebe mit 2 bis 15 Leuten, die abends nicht ins Büro wollen.</h2></Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TRADES.map(([t, d], i) => (
          <Reveal key={t} delay={i * 70} className="card3 p-6"><h3 className="text-lg font-semibold text-white">{t}</h3><p className="mt-2 text-sm text-ink-2">{d}</p></Reveal>
        ))}
      </div>
    </section>
  );
}

export function Honesty() {
  return (
    <section className="border-y border-line bg-[#0e1016]" aria-label="Was die KI macht und was nicht">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-28 md:grid-cols-2">
        <Reveal>
          <p className="eyebrow mb-4">Klare Grenzen</p>
          <h2 className="display text-4xl text-white md:text-5xl">Die KI arbeitet vor. Entscheiden tun Sie.</h2>
          <p className="mt-5 max-w-xl text-ink-2">Ein Handwerksbetrieb lebt von Vertrauen. Deshalb nennt WerkPilot keine Preise, stellt keine Diagnosen aus der Ferne und macht keine Zusagen. Jede Nachricht, die rausgeht, haben Sie gesehen oder bewusst für saubere Fälle freigegeben.</p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal className="card3 p-6" delay={100}><h3 className="font-semibold text-[#7ddc9a]">Macht die KI</h3><ul className="mt-3 space-y-2 text-sm text-ink-2"><li>Erfassen, zusammenfassen, priorisieren</li><li>Entwürfe in Ihrem Ton</li><li>Nach fehlenden Angaben fragen</li><li>Terminvorschläge aus dem Kalender</li><li>An offene Angebote erinnern</li><li>Wochenbericht schreiben</li></ul></Reveal>
          <Reveal className="card3 p-6" delay={200}><h3 className="font-semibold text-[#ff8f73]">Macht sie nicht</h3><ul className="mt-3 space-y-2 text-sm text-ink-2"><li>Preise nennen oder Angebote abgeben</li><li>Technische Diagnosen stellen</li><li>Termine verbindlich zusagen</li><li>Beschwerden allein beantworten</li><li>Nachrichten senden, die Sie nicht freigegeben haben</li><li>Daten außerhalb der EU speichern</li></ul></Reveal>
        </div>
      </div>
    </section>
  );
}

export function DemoSection() {
  return (
    <section id="demo" className="mx-auto max-w-7xl px-5 py-28" aria-label="Interaktive Demo">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <Reveal>
          <p className="eyebrow mb-4">Interaktive Demo</p>
          <h2 className="display text-4xl text-white md:text-5xl">Tippen Sie eine echte Anfrage ein.</h2>
          <p className="mt-5 text-ink-2">Sie sehen sofort Kategorie, Dringlichkeit, fehlende Angaben und den Antwortentwurf. Nichts wird gespeichert, kein Konto nötig.</p>
          <p className="mt-4 text-sm text-muted">Die Demo läuft bewusst regelbasiert, damit sie keine Kosten erzeugt. Im Produkt arbeitet ein Sprachmodell, die Entwürfe sind entsprechend individueller.</p>
        </Reveal>
        <Reveal delay={150} className="card3 p-5 md:p-7"><DemoForm /></Reveal>
      </div>
    </section>
  );
}

const PLANS = [
  { code: "starter", name: "Starter", price: "79", for: "Einzelbetriebe und kleine Teams", items: ["150 Anfragen im Monat", "KI-Antwortentwürfe mit Freigabe", "Kundenübersicht", "Standardberichte", "2 Nutzer"] },
  { code: "business", name: "Business", price: "149", for: "Betriebe mit Büro und Monteuren", hot: true, items: ["500 Anfragen im Monat", "Automatische Eingangsbestätigung", "Terminvorschläge und Kalender", "Angebotsnachverfolgung", "Individuelle Abläufe", "5 Nutzer"] },
  { code: "pro", name: "Pro", price: "249", for: "Wachsende Betriebe mit eigenen Systemen", items: ["2.000 Anfragen im Monat", "CRM-Webhooks und erweiterte Integrationen", "Eigene Automatisierungsregeln", "Umfangreiche Auswertungen", "Priorisierter Support", "15 Nutzer"] },
];

export function Pricing() {
  return (
    <section id="preise" className="mx-auto max-w-7xl px-5 py-28" aria-label="Preise">
      <Reveal><p className="eyebrow mb-4">Preise</p><h2 className="display max-w-3xl text-4xl text-white md:text-5xl">Weniger als eine Monteurstunde pro Woche.</h2><p className="mt-4 max-w-2xl text-ink-2">Alle Preise zzgl. USt., monatlich kündbar, 14 Tage kostenlos ohne Zahlungsdaten. Einführungspreise: Was Sie heute buchen, bleibt für Ihre Laufzeit so.</p></Reveal>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <Reveal key={p.code} delay={i * 100} className={`card3 flex flex-col p-7 ${p.hot ? "plan-hot" : ""}`}>
            <div className="flex items-center justify-between"><h3 className="text-xl font-semibold text-white">{p.name}</h3>{p.hot && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">Meist gewählt</span>}</div>
            <div className="mt-4 text-5xl font-semibold text-white">{p.price} €<span className="text-base font-normal text-muted"> / Monat</span></div>
            <p className="mt-1 text-sm text-muted">{p.for}</p>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-ink-2">{p.items.map((it) => <li key={it} className="flex gap-2"><span className="text-accent-2">✓</span>{it}</li>)}</ul>
            <Link href={`/registrieren?tarif=${p.code}`} className={`mt-7 rounded-full px-5 py-3 text-center text-sm font-semibold ${p.hot ? "bg-white text-black hover:bg-accent-2 hover:text-white" : "border border-white/25 text-white hover:border-white/60"}`}>Testphase starten</Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  ["Wie kommen die Anfragen in WerkPilot?", "Per Weiterleitung aus Ihrem Postfach an Ihre WerkPilot-Adresse, über das Kontaktformular Ihrer Website (ein kleines Snippet) oder manuell nach einem Anruf. Dubletten werden erkannt."],
  ["Sendet die KI ohne mein Wissen E-Mails?", "Nein. Standard ist: Entwurf, Sie geben frei. Ab Tarif Business können Sie für saubere Fälle eine automatische Eingangsbestätigung aktivieren. Sobald ein Warnhinweis vorliegt (geringe Sicherheit, Preisaussage, Beschwerde), geht nichts automatisch raus."],
  ["Was kostet die KI zusätzlich?", "Nichts. Jeder Tarif enthält ein KI-Kontingent, das für den angegebenen Anfrageumfang reicht. Ist es erreicht, werden Anfragen weiter erfasst, aber ohne Entwurf, und Sie werden informiert."],
  ["Wo liegen meine Daten?", "Auf Servern in der EU. Sie können jederzeit alle Daten exportieren und Ihren Betrieb löschen. Die Aufbewahrungsfrist für abgeschlossene Vorgänge stellen Sie selbst ein."],
  ["Brauche ich einen Google-Kalender?", "Nein. Terminvorschläge kommen aus Ihren Geschäftszeiten abzüglich der in WerkPilot eingetragenen Termine. Wenn Sie Google Kalender verbinden, werden dortige Belegungen berücksichtigt und bestätigte Termine eingetragen."],
  ["Wie kündige ich?", "Jederzeit im Kundenportal zum Ende des Abrechnungsmonats. Danach haben Sie 30 Tage Zeit für den Export; dann werden die Daten gelöscht."],
];

export function FAQ() {
  return (
    <section id="faq" className="border-t border-line" aria-label="Häufige Fragen">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-28 md:grid-cols-[1fr_1.6fr]">
        <Reveal><p className="eyebrow mb-4">Fragen</p><h2 className="display text-4xl text-white md:text-5xl">Kurz beantwortet.</h2><p className="mt-5 text-ink-2">Mehr im <Link href="/hilfe" className="text-accent-2 underline">Hilfezentrum</Link> oder per <Link href="/kontakt" className="text-accent-2 underline">Kontakt</Link>.</p></Reveal>
        <div className="divide-y divide-line">
          {FAQ_ITEMS.map(([q, a], i) => (
            <Reveal key={q} delay={i * 60} as="div"><details className="py-5"><summary className="flex items-center justify-between gap-4 text-lg font-medium text-white"><span>{q}</span><span className="chev text-2xl text-muted" aria-hidden>+</span></summary><p className="mt-3 max-w-2xl text-ink-2">{a}</p></details></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden" aria-label="Jetzt starten">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(91,140,255,0.35),transparent_60%)]" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-5 py-32 text-center">
        <Reveal><h2 className="display mx-auto max-w-4xl text-4xl text-white md:text-6xl">Der nächste Kunde schreibt heute Abend. Wer antwortet?</h2></Reveal>
        <Reveal delay={150}><p className="mx-auto mt-6 max-w-xl text-ink-2">In zehn Minuten eingerichtet: Konto anlegen, Weiterleitung setzen, erste Anfrage prüfen.</p></Reveal>
        <Reveal delay={250}><div className="mt-9 flex flex-wrap justify-center gap-3"><Link href="/registrieren" className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black hover:bg-accent-2 hover:text-white">14 Tage kostenlos testen</Link><Link href="/kontakt" className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-medium text-white hover:border-white/60">Rückruf anfragen</Link></div></Reveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  const cols: [string, [string, string][]][] = [
    ["Produkt", [["/funktionen", "Funktionen"], ["/branchen", "Branchen"], ["/preise", "Preise"], ["/demo", "Demo"], ["/ratgeber", "Ratgeber"]]],
    ["Hilfe", [["/hilfe", "Hilfezentrum"], ["/kontakt", "Kontakt"], ["/anmelden", "Anmelden"], ["/registrieren", "Registrieren"]]],
    ["Rechtliches", [["/impressum", "Impressum"], ["/datenschutz", "Datenschutzerklärung"], ["/agb", "AGB"], ["/widerruf", "Widerrufsbelehrung"]]],
  ];
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div><div className="flex items-center gap-2 font-semibold text-white"><span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm">W</span>WerkPilot <span className="text-accent-2">AI</span></div><p className="mt-3 text-muted">KI-gestützte Anfrage- und Terminorganisation für kleine Handwerksbetriebe. Entwickelt und betrieben in Deutschland.</p></div>
        {cols.map(([h, links]) => <div key={h}><h3 className="mb-2 font-semibold text-white">{h}</h3><ul className="space-y-1.5 text-ink-2">{links.map(([href, l]) => <li key={href}><Link href={href} className="hover:text-white">{l}</Link></li>)}</ul></div>)}
      </div>
      <div className="border-t border-line px-5 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} WerkPilot AI · Keine Tracking-Cookies, keine Weitergabe von Besucherdaten.</div>
    </footer>
  );
}
