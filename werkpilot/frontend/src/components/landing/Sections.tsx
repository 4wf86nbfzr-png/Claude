"use client";

import Link from "next/link";
import { Reveal } from "./Reveal";
import { DemoForm } from "@/app/(marketing)/demo/demo-form";
import { COMPARE_ROWS, PLANS, PLAN_TERMS } from "@/lib/plans";
import { usePublicConfig } from "@/lib/public-config";

const TRADES = [
  ["Elektro", "Stromausfall und fliegende Sicherungen werden als Notfall erkannt. Die Rückfrage nach Adresse und einem Foto vom Zählerschrank ist vorbereitet."],
  ["Sanitär, Heizung, Klima", "Heizung aus, Rohrbruch, kein Warmwasser: ganz oben. Wartungsanfragen landen entspannt im Wochenplan."],
  ["Maler", "Angebotsanfragen mit Quadratmetern und Fotos. Nachfassen nach fünf Tagen, ohne dass jemand daran denken muss."],
  ["Dachdecker", "Sturmschäden sofort dringend. Besichtigungstermine stecken schon im ersten Entwurf."],
  ["Gebäudereinigung", "Regelobjekte, Sonderreinigung, Hausverwaltungen: getrennt nach Kategorie und Kunde."],
  ["Garten und Landschaftsbau", "Saisonwellen abfangen: Die Eingangsbestätigung mit Rückfragen geht sofort raus, Besichtigungen werden gebündelt."],
];

export function Industries() {
  return (
    <section data-fly className="mx-auto max-w-7xl px-5 py-28" aria-label="Branchen">
      <div className="grid gap-12 md:grid-cols-[1.1fr_1fr] md:items-end md:gap-16">
        <Reveal>
          <p className="eyebrow mb-4">Für wen</p>
          <h2 className="display max-w-3xl text-4xl md:text-5xl">Gebaut für Betriebe mit 2 bis 15 Leuten, die abends nicht ins Büro wollen.</h2>
        </Reveal>
        <Reveal delay={120} className="still-wrap aspect-[4/3] md:aspect-[5/4]">
          <picture><source type="image/webp" srcSet="/video/stills/still-1-960.webp 960w, /video/stills/still-1-1600.webp 1600w" sizes="(min-width: 768px) 50vw, 100vw" /><img className="still" src="/video/stills/still-1.jpg" alt="Standbild aus dem Film: morgens zu Hause wird die Tasche gepackt" loading="lazy" decoding="async" /></picture>
          <p className="on-image text-sm text-ink-2">Während der Tag draußen läuft, sortiert Clairify den Posteingang.</p>
        </Reveal>
      </div>
      <dl className="mt-16 grid gap-x-14 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {TRADES.map(([t, d], i) => (
          <Reveal key={t} delay={i * 70}><dt className="text-lg font-semibold">{t}</dt><dd className="mt-2 max-w-sm text-sm text-ink-2 md:text-[15px]">{d}</dd></Reveal>
        ))}
      </dl>
    </section>
  );
}

const DOES = ["Erfassen, zusammenfassen, priorisieren", "Entwürfe in Ihrem Ton", "Nach fehlenden Angaben fragen", "Terminvorschläge aus dem Kalender", "An offene Angebote erinnern", "Wochenbericht schreiben"];
const DOES_NOT = ["Preise nennen oder Angebote abgeben", "Technische Diagnosen stellen", "Termine verbindlich zusagen", "Beschwerden allein beantworten", "Nachrichten senden, die Sie nicht freigegeben haben", "Im Verborgenen arbeiten: jede automatische Aktion steht im Protokoll"];

export function Honesty() {
  return (
    <section data-fly className="relative" aria-label="Was die KI macht und was nicht">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-28 md:grid-cols-2 md:gap-16">
        <Reveal className="still-wrap aspect-[4/5] md:aspect-auto md:min-h-[560px]">
          <picture><source type="image/webp" srcSet="/video/stills/still-2-960.webp 960w, /video/stills/still-2-1600.webp 1600w" sizes="(min-width: 768px) 50vw, 100vw" /><img className="still" src="/video/stills/still-2.jpg" alt="Standbild aus dem Film: Ankunft mit dem Auto auf der Baustelle" loading="lazy" decoding="async" /></picture>
          <div className="on-image">
            <p className="eyebrow mb-3">Klare Grenzen</p>
            <h2 className="display text-3xl md:text-4xl">Die KI arbeitet vor. Entscheiden tun Sie.</h2>
          </div>
        </Reveal>
        <div className="panel -mt-4 px-6 py-8 md:mt-0 md:self-center md:px-10 md:py-12">
          <Reveal>
            <p className="max-w-xl text-lg text-ink-2">Ein Handwerksbetrieb lebt von Vertrauen. Deshalb nennt Clairify keine Preise, stellt keine Diagnosen aus der Ferne und macht keine Zusagen. Jede Nachricht, die rausgeht, haben Sie gesehen oder bewusst für saubere Fälle freigegeben.</p>
          </Reveal>
          <div className="mt-12 grid gap-10 sm:grid-cols-2">
            <Reveal delay={100}><h3 className="eyebrow">Macht die KI</h3><ul className="mt-4 divide-y divide-[rgba(218,241,222,0.12)] text-sm text-ink-2 md:text-[15px]">{DOES.map((x) => <li key={x} className="py-2.5">{x}</li>)}</ul></Reveal>
            <Reveal delay={200}><h3 className="eyebrow">Macht sie nicht</h3><ul className="mt-4 divide-y divide-[rgba(218,241,222,0.12)] text-sm text-ink-2 md:text-[15px]">{DOES_NOT.map((x) => <li key={x} className="py-2.5">{x}</li>)}</ul></Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DemoSection() {
  return (
    <section data-fly id="demo" className="mx-auto max-w-7xl px-5 py-28" aria-label="Interaktive Demo">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-start lg:gap-16">
        <Reveal>
          <p className="eyebrow mb-4">Interaktive Demo</p>
          <h2 className="display text-4xl md:text-5xl">Tippen Sie eine echte Anfrage ein.</h2>
          <p className="mt-5 text-lg text-ink-2">Sie sehen sofort Kategorie, Dringlichkeit, fehlende Angaben und den Antwortentwurf. Nichts wird gespeichert, kein Konto nötig.</p>
          <p className="mt-4 text-sm text-muted">Die Demo läuft bewusst regelbasiert, damit sie keine Kosten erzeugt. Im Produkt arbeitet ein Sprachmodell, die Entwürfe sind entsprechend individueller.</p>
        </Reveal>
        <Reveal delay={150} className="demo-panel"><DemoForm /></Reveal>
      </div>
    </section>
  );
}

function Check({ on }: { on: boolean }) {
  return on ? <span className="text-accent-2" aria-label="enthalten">✓</span> : <span className="text-muted" aria-label="nicht enthalten">–</span>;
}

export function Pricing() {
  const cfg = usePublicConfig();
  const trialDays = cfg?.trial_days ?? 14;
  return (
    <section data-fly id="preise" className="mx-auto max-w-7xl px-5 py-28" aria-label="Preise">
      <Reveal><p className="eyebrow mb-4">Preise</p><h2 className="display max-w-3xl text-4xl md:text-5xl">Weniger als eine Monteurstunde pro Woche.</h2><p className="mt-4 max-w-2xl text-lg text-ink-2">{PLAN_TERMS.vat} {PLAN_TERMS.cancel} {trialDays} Tage kostenlos, ohne Zahlungsdaten. {PLAN_TERMS.intro}</p></Reveal>
      <div className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
        {PLANS.map((p, i) => (
          <Reveal key={p.code} delay={i * 100} className="plan flex flex-col">
            <h3 className="flex flex-wrap items-center gap-3 text-xl font-semibold">{p.name}{p.hot && <span className="pill-tag !py-1 !text-xs">Empfehlung für Betriebe mit Büro</span>}</h3>
            <div className={`mt-4 text-5xl font-semibold ${p.hot ? "text-accent" : ""}`}>{p.priceEur} €<span className="text-base font-normal text-muted"> im Monat</span></div>
            <p className="mt-1 text-sm text-muted">{p.for}</p>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-2 md:text-[15px]">{p.highlights.map((it) => <li key={it}>{it}</li>)}</ul>
            <Link href={`/registrieren?tarif=${p.code}`} className={`mt-8 self-start rounded-full px-6 py-3 text-center text-sm font-semibold ${p.hot ? "btn-primary" : "btn-secondary"}`}>Testphase starten</Link>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-20">
        <h3 className="text-xl font-semibold">Was ist drin, was kostet extra?</h3>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">{PLAN_TERMS.extra} Nach der Testphase läuft kein Tarif automatisch weiter und es wird nichts abgebucht. Ohne Buchung pausiert der Zugriff auf Anfragen und KI; Anmeldung, Einstellungen, Export und Löschung bleiben möglich.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="compare w-full text-sm">
            <thead><tr><th scope="col" className="text-left font-medium text-muted">Leistung</th>{PLANS.map((p) => <th key={p.code} scope="col" className="font-semibold">{p.name}</th>)}</tr></thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="text-left font-normal text-ink-2">{r.label}{r.note && <span className="block text-xs text-muted">{r.note}</span>}</th>
                  {PLANS.map((p, i) => <td key={p.code} className="text-center">{r.values ? r.values[i] : <Check on={p.features.includes(r.feature!)} />}</td>)}
                </tr>
              ))}
              <tr><th scope="row" className="text-left font-normal text-ink-2">Kündigung</th><td colSpan={3} className="text-center text-ink-2">Monatlich, zum Ende des Abrechnungsmonats</td></tr>
              <tr><th scope="row" className="text-left font-normal text-ink-2">Testphase</th><td colSpan={3} className="text-center text-ink-2">{trialDays} Tage, ohne Zahlungsdaten: 30 Anfragen, 1 Nutzer, begrenztes KI-Kontingent</td></tr>
              <tr><th scope="row" className="text-left font-normal text-ink-2">Umsatzsteuer</th><td colSpan={3} className="text-center text-ink-2">Preise zuzüglich gesetzlicher Umsatzsteuer</td></tr>
            </tbody>
          </table>
        </div>
        {cfg && !cfg.stripe_ready && (
          <p className="mt-6 max-w-2xl text-sm text-muted" data-testid="billing-note">Hinweis: Die Bezahlung per Karte oder Lastschrift ist noch nicht freigeschaltet. Die Testphase läuft vollständig; ein Tarif wird erst buchbar, sobald die Abrechnung aktiv ist. Bis dahin wird nichts berechnet.</p>
        )}
      </Reveal>
    </section>
  );
}

const FAQ_ITEMS = [
  ["Wie kommen die Anfragen in Clairify?", "Per Weiterleitung aus Ihrem Postfach an Ihre Adresse bei Clairify, über das Kontaktformular Ihrer Website (ein kleines Snippet) oder manuell nach einem Anruf. Dubletten werden erkannt."],
  ["Sendet die KI ohne mein Wissen Nachrichten?", "Nein. Standard ist: Entwurf, Sie geben frei. Ab Tarif Business können Sie für saubere Fälle eine automatische Eingangsbestätigung aktivieren. Sobald ein Warnhinweis vorliegt (geringe Sicherheit, Preisaussage, Beschwerde), geht nichts automatisch raus."],
  ["Was kostet die KI zusätzlich?", "Nichts. Jeder Tarif enthält ein Kontingent für die KI, das für den angegebenen Anfrageumfang bemessen ist. Ist es erreicht, werden Anfragen weiter erfasst und sortiert, aber ohne Entwurf; das Dashboard zeigt den Stand an."],
  ["Wo liegen meine Daten?", "Der Hosting-Anbieter und der KI-Anbieter werden in der Datenschutzerklärung benannt, sobald sie für den Betrieb festgelegt sind; vorgesehen sind Server in der EU. Sie können jederzeit alle Daten als JSON exportieren und Ihren Betrieb samt Daten löschen. Die Aufbewahrungsfrist für abgeschlossene Vorgänge stellen Sie selbst ein, mindestens 30 Tage."],
  ["Brauche ich einen Google Kalender?", "Nein. Terminvorschläge kommen aus Ihren Geschäftszeiten abzüglich der in Clairify eingetragenen Termine. Wenn Sie Google Kalender verbinden, werden dortige Belegungen berücksichtigt und bestätigte Termine eingetragen."],
  ["Wie kündige ich?", "Jederzeit im Kundenportal zum Ende des Abrechnungsmonats. Danach bleibt der Zugang zum Export bestehen; gelöscht wird, wenn Sie den Betrieb in den Einstellungen löschen oder die eingestellte Aufbewahrungsfrist abläuft."],
];

export function FAQ() {
  return (
    <section data-fly id="faq" aria-label="Häufige Fragen">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-28 md:grid-cols-[1fr_1.6fr] md:gap-16">
        <Reveal><p className="eyebrow mb-4">Fragen</p><h2 className="display text-4xl md:text-5xl">Kurz beantwortet.</h2><p className="mt-5 text-lg text-ink-2">Mehr im <Link href="/hilfe" className="text-accent-2 hover:text-accent">Hilfezentrum</Link> oder per <Link href="/kontakt" className="text-accent-2 hover:text-accent">Kontakt</Link>.</p></Reveal>
        <div className="space-y-2">
          {FAQ_ITEMS.map(([q, a], i) => (
            <Reveal key={q} delay={i * 60} as="div"><details className="py-4"><summary className="flex items-center justify-between gap-4 text-lg font-medium"><span>{q}</span><span className="chev text-2xl" aria-hidden>+</span></summary><p className="mt-3 max-w-2xl text-ink-2">{a}</p></details></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden" aria-label="Jetzt starten">
      <picture><source type="image/webp" srcSet="/video/stills/still-3-960.webp 960w, /video/stills/still-3-1600.webp 1600w" sizes="100vw" /><img className="still absolute inset-0 h-full w-full" src="/video/stills/still-3.jpg" alt="" aria-hidden loading="lazy" decoding="async" /></picture>
      <div className="cta-shade absolute inset-0" aria-hidden />
      <div className="on-image-static relative mx-auto max-w-7xl px-5 py-36 text-center md:py-44">
        <Reveal><h2 className="display display-xl mx-auto max-w-5xl text-4xl md:text-7xl">Der nächste Kunde schreibt heute Abend. Wer antwortet?</h2></Reveal>
        <Reveal delay={150}><p className="mx-auto mt-6 max-w-xl text-lg text-ink-2">In zehn Minuten eingerichtet: Konto anlegen, Weiterleitung setzen, erste Anfrage prüfen.</p></Reveal>
        <Reveal delay={250}><div className="mt-9 flex flex-wrap justify-center gap-3"><Link href="/registrieren" className="btn-primary rounded-full px-7 py-3.5 text-sm font-semibold">Kostenlos testen</Link><Link href="/kontakt" className="btn-secondary rounded-full px-7 py-3.5 text-sm font-medium">Rückruf anfragen</Link></div></Reveal>
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
    <footer className="rule">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 text-sm sm:grid-cols-2 md:grid-cols-4">
        <div><div className="text-lg font-semibold tracking-tight">Clairify</div><p className="mt-3 max-w-xs text-muted">Anfragen und Termine für kleine Handwerksbetriebe, organisiert mit KI. Entwickelt in Deutschland, auf Deutsch, für deutsche Betriebe.</p></div>
        {cols.map(([h, links]) => <div key={h}><h3 className="mb-3 font-semibold">{h}</h3><ul className="space-y-2 text-ink-2">{links.map(([href, l]) => <li key={href}><Link href={href} className="hover:text-ink">{l}</Link></li>)}</ul></div>)}
      </div>
      <div className="mx-auto max-w-7xl px-5 pb-8 text-xs text-muted">© {new Date().getFullYear()} Clairify. Keine Cookies zur Nachverfolgung, keine Weitergabe von Besucherdaten.</div>
    </footer>
  );
}
