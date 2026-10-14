"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";
import { fetchPublicConfig } from "@/lib/public-config";
import { canPromptInstall, detectOS, isStandalone, onInstallChange, promptInstall, type OS } from "@/lib/install";

type Links = { windows?: string | null; macos?: string | null; linux?: string | null; ios?: string | null; android?: string | null };

/* Einfache, selbst gezeichnete Symbole (keine Markenbilder der Anbieter). */
const WindowsIcon = () => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor"><path d="M3 5.5 11 4.4v7.1H3zM12 4.2 21 3v8.5h-9zM3 12.5h8v7.1L3 18.5zM12 12.5h9V21l-9-1.3z" /></svg>;
const AppleIcon = () => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.7-1-2.7-3.7zM14.1 5.8c.6-.8 1.1-1.9.9-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" /></svg>;
const LinuxIcon = () => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>;
const PhoneIcon = () => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18h2" /></svg>;
const AndroidIcon = () => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 10a6 6 0 0 1 12 0v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M8 6l-1.5-2M16 6l1.5-2M9 21v-3M15 21v-3M3 11v5M21 11v5" /></svg>;

type Item = { key: OS; label: string; sub: string; icon: () => React.JSX.Element; link?: keyof Links; how: string[] };
const ITEMS: Item[] = [
  { key: "windows", label: "Windows", sub: "Für den Büro PC", icon: WindowsIcon, link: "windows", how: ["Im Browser (Chrome oder Edge) diese Seite öffnen und auf „Als App installieren“ klicken.", "Oder: Symbol „Installieren“ rechts in der Adressleiste.", "Clairify liegt danach im Startmenü und läuft im eigenen Fenster."] },
  { key: "macos", label: "macOS", sub: "Für den Mac", icon: AppleIcon, link: "macos", how: ["Safari: Menü „Ablage“ → „Zum Dock hinzufügen“.", "Chrome oder Edge: „Als App installieren“ oder das Symbol rechts in der Adressleiste.", "Clairify liegt danach im Programme-Ordner bzw. im Dock."] },
  { key: "linux", label: "Linux", sub: "Für den Rechner", icon: LinuxIcon, link: "linux", how: ["Chrome, Chromium oder Edge: „Als App installieren“ oder das Symbol rechts in der Adressleiste.", "Clairify erscheint danach im Anwendungsmenü."] },
  { key: "ios", label: "iPhone und iPad", sub: "Für unterwegs", icon: PhoneIcon, link: "ios", how: ["Diese Seite in Safari öffnen.", "Unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“.", "Clairify liegt danach wie eine App auf dem Home-Bildschirm."] },
  { key: "android", label: "Android", sub: "Für unterwegs", icon: AndroidIcon, link: "android", how: ["Diese Seite in Chrome öffnen und auf „Als App installieren“ tippen.", "Oder: Menü ⋮ → „App installieren“.", "Clairify liegt danach auf dem Startbildschirm und läuft im Vollbild."] },
];

/** Download-Bereich: Clairify als App auf jedem Gerät. Die installierbare Web-App funktioniert sofort auf allen Systemen;
 *  Installationsdateien (Desktop-Programm, Stores) erscheinen, sobald ihre Adressen in der Serverkonfiguration stehen. */
export function Downloads() {
  const [links, setLinks] = useState<Links>({});
  const [os, setOs] = useState<OS>("unknown");
  const [prompt, setPrompt] = useState(false);
  const [open, setOpen] = useState<OS | null>(null);
  const [installed, setInstalled] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPublicConfig().then((j) => { if (alive && j?.downloads) setLinks(j.downloads); });
    queueMicrotask(() => { setOs(detectOS()); setPrompt(canPromptInstall()); setInstalled(isStandalone()); });
    const off = onInstallChange(() => { setPrompt(canPromptInstall()); setInstalled(isStandalone()); });
    return () => { alive = false; off(); };
  }, []);
  async function install(key: OS) {
    if (prompt) { const r = await promptInstall(); setNote(r === "accepted" ? "Clairify wird installiert. Beim ersten Start melden Sie sich mit Ihrem Konto an." : r === "dismissed" ? "Installation abgebrochen. Sie können sie jederzeit hier erneut starten." : null); if (r !== "unavailable") return; }
    setOpen(open === key ? null : key);
  }
  return (
    <section id="download" className="mx-auto max-w-7xl px-5 pb-8 pt-10 md:pt-14" aria-label="Clairify herunterladen">
      <Reveal className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-start md:gap-12">
        <div>
          <p className="eyebrow eyebrow-rule mb-3">Clairify auf Ihren Geräten</p>
          <h2 data-mask className="text-2xl font-semibold md:text-3xl">Im Büro am Rechner, draußen auf dem Handy.</h2>
          <p className="mt-3 max-w-md text-ink-2">Clairify lässt sich auf Windows, macOS, Linux, iPhone und Android als App installieren: eigenes Fenster, eigenes Symbol, immer auf dem aktuellen Stand. Beim Start erscheint das Anmeldeformular. Wer noch kein Konto hat, wählt auf der Website sein Angebot und legt es dort an.</p>
          {installed && <p className="mt-3 text-sm text-ink-2">Sie nutzen Clairify bereits als installierte App.</p>}
          {note && <p className="mt-3 text-sm text-ink-2" role="status">{note}</p>}
          <p className="mt-3 text-xs text-muted">Das Desktop-Programm (Installationsdatei) und die Store-Versionen werden hier verlinkt, sobald sie veröffentlicht sind. Bis dahin ist die installierte Web-App auf allen Systemen der Weg.</p>
        </div>
        <ul className="dl-grid" role="list">
          {ITEMS.map(({ key, label, sub, icon: Icon, link, how }) => {
            const href = link ? links[link] : null;
            const mine = os === key;
            return (
              <li key={key} className={open === key ? "dl-open" : ""}>
                <button type="button" className={`dl ${mine ? "is-mine" : ""}`} onClick={() => install(key)} aria-expanded={open === key} aria-controls={`dl-how-${key}`}>
                  <span className="dl-icon"><Icon /></span>
                  <span><span className="block font-semibold">{label}{mine && <span className="dl-mine"> · Ihr Gerät</span>}</span><span className="block text-sm text-ink-2">{href ? (key === "ios" ? "App Store" : key === "android" ? "Google Play oder App" : "Programm oder App") : prompt && mine ? "Jetzt installieren" : sub}</span></span>
                </button>
                <div id={`dl-how-${key}`} className="dl-how" hidden={open !== key}>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">{how.map((h) => <li key={h}>{h}</li>)}</ol>
                  {href && <p className="mt-3 text-sm"><a className="btn-primary inline-block rounded-full px-4 py-2 text-sm font-semibold" href={href} target="_blank" rel="noopener noreferrer">{key === "ios" ? "Im App Store laden" : key === "android" ? "Bei Google Play laden" : `Programm für ${label} herunterladen`}</a></p>}
                  <p className="mt-2 text-xs text-muted">Nach der Installation: Anmelden mit Ihrem Konto. Noch kein Konto? <a href="/preise" className="underline">Angebot wählen</a>.</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </section>
  );
}
