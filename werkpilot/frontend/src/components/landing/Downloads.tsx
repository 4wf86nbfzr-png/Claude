"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Reveal";

type Links = { windows?: string | null; macos?: string | null; ios?: string | null; android?: string | null };

/* Einfache, selbst gezeichnete Symbole (keine Markenbilder der Anbieter). */
const WindowsIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor"><path d="M3 5.5 11 4.4v7.1H3zM12 4.2 21 3v8.5h-9zM3 12.5h8v7.1L3 18.5zM12 12.5h9V21l-9-1.3z" /></svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.7-1-2.7-3.7zM14.1 5.8c.6-.8 1.1-1.9.9-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" /></svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor"><path d="M4 3.3v17.4c0 .5.5.8.9.6l9.4-8.4L4.9 2.7c-.4-.2-.9.1-.9.6zM15.7 11.6l2.9-1.7c.6-.3.6-1.1 0-1.4l-2.6-1.5-3.1 2.9zM15.7 12.4l-2.8 1.7 3.1 2.9 2.6-1.5c.6-.3.6-1.1 0-1.4z" /></svg>
);

const ITEMS: { key: keyof Links; label: string; sub: string; icon: () => React.JSX.Element }[] = [
  { key: "windows", label: "Windows", sub: "Für den Büro PC", icon: WindowsIcon },
  { key: "macos", label: "macOS", sub: "Für den Mac", icon: AppleIcon },
  { key: "ios", label: "App Store", sub: "iPhone und iPad", icon: AppleIcon },
  { key: "android", label: "Google Play", sub: "Android Geräte", icon: PlayIcon },
];

/** Download-Bereich direkt unter dem Film. Links kommen aus der Serverkonfiguration;
 *  solange eine Version nicht veröffentlicht ist, steht ehrlich "in Vorbereitung". */
export function Downloads() {
  const [links, setLinks] = useState<Links>({});
  useEffect(() => {
    let alive = true;
    fetch("/api/public/config").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.downloads) setLinks(j.downloads); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return (
    <section id="download" className="mx-auto max-w-7xl px-5 pb-8 pt-10 md:pt-14" aria-label="Clairify herunterladen">
      <Reveal className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-center md:gap-12">
        <div>
          <p className="eyebrow mb-3">Clairify auf Ihren Geräten</p>
          <h2 className="text-2xl font-semibold md:text-3xl">Im Büro am Rechner, draußen auf dem Handy.</h2>
          <p className="mt-3 max-w-md text-ink-2">Clairify läuft im Browser. Die Versionen für Windows, macOS, iPhone und Android erscheinen hier, sobald sie veröffentlicht sind.</p>
        </div>
        <ul className="dl-grid" role="list">
          {ITEMS.map(({ key, label, sub, icon: Icon }) => {
            const href = links[key];
            const inner = (<><span className="dl-icon"><Icon /></span><span><span className="block font-semibold">{label}</span><span className="block text-sm text-ink-2">{href ? sub : "In Vorbereitung"}</span></span></>);
            return (
              <li key={key}>
                {href ? (
                  <a className="dl" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Clairify für ${label} laden`}>{inner}</a>
                ) : (
                  <span className="dl is-soon" aria-disabled="true" title="Noch nicht veröffentlicht">{inner}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Reveal>
    </section>
  );
}
