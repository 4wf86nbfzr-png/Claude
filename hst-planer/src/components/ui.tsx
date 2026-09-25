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
      {titel && <header className="karte-titel">{titel}{aktion}</header>}
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
      <span className="zahl" style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.1, color: farbe === 'grau' ? 'var(--text)' : `var(--${farbe})` }}>{wert}</span>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
      {hinweis && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hinweis}</span>}
    </>
  );
  const stil: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 16px',
    background: 'var(--karte)', border: '1px solid var(--linie)',
    borderRadius: 'var(--r-gross)', boxShadow: 'var(--schatten)', textDecoration: 'none',
  };
  return href ? <Link href={href} style={stil}>{inhalt}</Link> : <div style={stil}>{inhalt}</div>;
}

export function Balken({ ist, soll }: { ist: number; soll: number }) {
  const prozent = soll > 0 ? Math.min(100, Math.round((ist / soll) * 100)) : 0;
  const farbe = ist >= soll && soll > 0 ? 'var(--gruen)' : ist === 0 ? 'var(--rot)' : 'var(--gelb)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{ width: 54, height: 5, borderRadius: 3, background: 'var(--tief)', overflow: 'hidden', flex: 'none' }}>
        <span style={{ display: 'block', width: `${prozent}%`, height: '100%', background: farbe }} />
      </span>
      <span className="zahl" style={{ fontSize: 12, color: 'var(--text-2)' }}>{ist}/{soll}</span>
    </span>
  );
}

export function Seitenkopf({ titel, unter, aktionen, brotkrumen }: { titel: string; unter?: ReactNode; aktionen?: ReactNode; brotkrumen?: Array<{ href: string; label: string }> }) {
  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        {brotkrumen && brotkrumen.length > 0 && (
          <nav aria-label="Brotkrumen" style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
            {brotkrumen.map((k, i) => (
              <span key={k.href} style={{ display: 'flex', gap: 6 }}>
                {i > 0 && <span aria-hidden>/</span>}
                <Link href={k.href} style={{ color: 'inherit' }}>{k.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>{titel}</h1>
        {unter && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>{unter}</div>}
      </div>
      {aktionen && <div className="nicht-drucken" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{aktionen}</div>}
    </header>
  );
}

export function Hinweis({ art = 'info', children }: { art?: 'info' | 'warnung' | 'fehler' | 'erfolg'; children: ReactNode }) {
  const farben = {
    info: ['var(--blau-flaeche)', 'var(--blau)'],
    warnung: ['var(--gelb-flaeche)', 'var(--gelb)'],
    fehler: ['var(--rot-flaeche)', 'var(--rot)'],
    erfolg: ['var(--gruen-flaeche)', 'var(--gruen)'],
  }[art];
  return (
    <p role={art === 'fehler' ? 'alert' : undefined}
       style={{ background: farben[0], color: farben[1], border: `1px solid ${farben[1]}33`, borderRadius: 'var(--r)', padding: '9px 12px', fontSize: 13, margin: 0 }}>
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

export function Raster({ min = 200, gap = 12, children }: { min?: number; gap?: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}>{children}</div>;
}

export function Paar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 13, wordBreak: 'break-word' }}>{children ?? '–'}</span>
    </div>
  );
}
