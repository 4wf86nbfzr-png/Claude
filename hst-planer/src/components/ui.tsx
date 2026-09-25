import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Farbe } from '@/lib/status';

export function Marke({ farbe, children }: { farbe: Farbe; children: ReactNode }) {
  return <span className={`marke marke-${farbe}`}>{children}</span>;
}

export function StatusMarke({ status }: { status: { label: string; farbe: Farbe } }) {
  return (
    <span className={`marke marke-${status.farbe}`}>
      <span className="punkt" aria-hidden />
      {status.label}
    </span>
  );
}

export function Karte({ titel, aktion, children, klasse = '' }: { titel?: ReactNode; aktion?: ReactNode; children: ReactNode; klasse?: string }) {
  return (
    <section className={`karte ${klasse}`}>
      {titel && <header className="karte-kopf">{titel}{aktion}</header>}
      {children}
    </section>
  );
}

export function Leer({ children }: { children: ReactNode }) {
  return <p className="leerhinweis">{children}</p>;
}

export function Kennzahl({ wert, label, farbe = 'grau', href, hinweis }: { wert: ReactNode; label: string; farbe?: Farbe; href?: string; hinweis?: string }) {
  const inhalt = (
    <>
      <span className="kennzahl-wert zahl" style={farbe === 'grau' ? undefined : { color: `var(--${farbe})` }}>{wert}</span>
      <span className="kennzahl-label">{label}</span>
      {hinweis && <span className="kennzahl-zusatz">{hinweis}</span>}
    </>
  );
  return href ? <Link href={href} className="kennzahl">{inhalt}</Link> : <div className="kennzahl">{inhalt}</div>;
}

export function Balken({ ist, soll }: { ist: number; soll: number }) {
  const prozent = soll > 0 ? Math.min(100, Math.round((ist / soll) * 100)) : 0;
  const farbe = ist >= soll && soll > 0 ? 'var(--gruen)' : ist === 0 ? 'var(--rot)' : 'var(--gelb)';
  return (
    <span className="balken">
      <span className="balken-spur" aria-hidden>
        <span className="balken-wert" style={{ width: `${prozent}%`, background: farbe }} />
      </span>
      <span className="zahl" style={{ fontSize: 11, color: 'var(--text-2)' }}>{ist}/{soll}</span>
    </span>
  );
}

export function Seitenkopf({ titel, unter, aktionen, brotkrumen }: { titel: string; unter?: ReactNode; aktionen?: ReactNode; brotkrumen?: Array<{ href: string; label: string }> }) {
  return (
    <header className="seitenkopf">
      <div style={{ minWidth: 0 }}>
        {brotkrumen && brotkrumen.length > 0 && (
          <nav aria-label="Brotkrumen" className="brotkrumen">
            {brotkrumen.map((k, i) => (
              <span key={k.href} style={{ display: 'flex', gap: 5 }}>
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={k.href}>{k.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>{titel}</h1>
        {unter && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{unter}</div>}
      </div>
      {aktionen && <div className="nicht-drucken" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{aktionen}</div>}
    </header>
  );
}

export function Hinweis({ art = 'info', children }: { art?: 'info' | 'warnung' | 'fehler' | 'erfolg' | 'beige'; children: ReactNode }) {
  return (
    <p role={art === 'fehler' ? 'alert' : undefined} className={`hinweis-${art}`}>
      {children}
    </p>
  );
}

export function Feld({ label, name, hinweis, fehler, children }: { label: string; name?: string; hinweis?: string; fehler?: string; children: ReactNode }) {
  return (
    <div className="feld-gruppe">
      <label className="feld-label" htmlFor={name}>{label}</label>
      {children}
      {hinweis && !fehler && <span className="feld-hinweis">{hinweis}</span>}
      {fehler && <span className="feld-fehler">{fehler}</span>}
    </div>
  );
}

export function Raster({ min = 160, gap = 10, children }: { min?: number; gap?: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}>{children}</div>;
}

/**
 * Ein Feld, das diese Rolle nicht sehen darf (SecPlan 8).
 *
 * Bewusst sichtbar und benannt: ein leeres Feld sieht aus wie ein
 * fehlender Eintrag, und dann ruft jemand in der Personalabteilung an.
 * Ein benanntes Schloss sagt, dass es die Angabe gibt und wer sie führt.
 */
export function Gesperrt({ grund = 'Für Ihre Rolle nicht freigegeben' }: { grund?: string }) {
  return <span className="gesperrt" title={grund}>gesperrt</span>;
}

export function Paar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{children ?? '–'}</span>
    </div>
  );
}
