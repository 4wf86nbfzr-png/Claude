/**
 * Lesetypografie fuer Rechtstexte. Bewusst schmal gesetzt (ca. 68 Zeichen)
 * und ohne Kaesten — es soll lesbar sein, nicht dekoriert.
 */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        max-w-[68ch] text-[0.9375rem] leading-relaxed text-chrome
        [&_h2]:display [&_h2]:display-m [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-paper
        [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-paper
        [&_p]:mb-4
        [&_ul]:mb-4 [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:list-disc
        [&_dl]:mb-4 [&_dt]:mt-3 [&_dt]:font-semibold [&_dt]:text-paper
        [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-paper
        [&_strong]:font-semibold [&_strong]:text-paper
      "
    >
      {children}
    </div>
  );
}

/** Deutlich markierter Platzhalter, damit nichts versehentlich live geht. */
export function Placeholder({ children = "bitte ergaenzen" }: { children?: React.ReactNode }) {
  return (
    <mark className="rounded bg-saffron/15 px-1.5 py-0.5 font-mono text-[0.8125rem] text-saffron">
      {children}
    </mark>
  );
}

export function LegalPage({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell-narrow pb-24 pt-28 lg:pt-36">
      <header className="mb-10">
        <p className="kicker">{kicker}</p>
        <h1 className="display display-l mt-2">{title}</h1>
        {updated && <p className="mt-4 text-sm text-muted">Stand: {updated}</p>}
      </header>
      <div className="mb-10 rounded-2xl border border-saffron/25 bg-saffron/8 p-5 text-[0.8125rem] leading-relaxed text-saffron">
        Testbetrieb: Diese Seite enthaelt Platzhalter und ist noch nicht
        rechtlich geprueft. Vor dem Live-Gang muessen die Angaben vollstaendig
        eingetragen und die Texte anwaltlich gegengelesen werden.
      </div>
      <Prose>{children}</Prose>
    </div>
  );
}
