'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from './icons';
import { THEME_COOKIE } from '@/lib/theme';

/**
 * Kopfzeile mit globaler Suche (Spec 27), Benachrichtigungen (Spec 28),
 * Hell-/Dunkelmodus (Spec 64) und Abmeldung.
 */
export function Kopfzeile({
  ungelesen, theme, abmelden, faktorFehlt = false,
}: {
  ungelesen: number;
  theme: string;
  abmelden: () => Promise<void>;
  /** Punkt am Schloss, wenn ein privilegierter Zugang ohne zweiten Faktor läuft. */
  faktorFehlt?: boolean;
}) {
  const router = useRouter();
  const [begriff, setBegriff] = useState('');
  const sucheRef = useRef<HTMLInputElement>(null);
  const [, start] = useTransition();
  const [aktuell, setAktuell] = useState(theme);

  // Ohne gespeicherte Wahl folgt die Oberflaeche dem Betriebssystem – das
  // steht erst im Browser fest, deshalb hier nachziehen.
  useEffect(() => { setAktuell(document.documentElement.dataset.theme ?? 'light'); }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const aktiv = document.activeElement;
      const inEingabe = aktiv instanceof HTMLElement && (aktiv.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(aktiv.tagName));
      if (event.key === '/' && !inEingabe) { event.preventDefault(); sucheRef.current?.focus(); }
      if (event.key === 'Escape' && aktiv === sucheRef.current) sucheRef.current?.blur();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function umschalten() {
    const neu = (aktuell === 'dark' ? 'light' : 'dark');
    setAktuell(neu);
    document.documentElement.dataset.theme = neu;
    // Ein Jahr haltbar und serverseitig lesbar, damit die Seite ohne Flackern laedt.
    document.cookie = `${THEME_COOKIE}=${neu}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  }

  return (
    <header className="app-kopf">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); if (begriff.trim()) router.push(`/suche?q=${encodeURIComponent(begriff.trim())}`); }}
        className="kopf-suche"
        style={{ position: 'relative', flex: 1, maxWidth: 440 }}
      >
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
          <Icon name="search" size={15} />
        </span>
        <input
          ref={sucheRef}
          className="feld"
          type="search"
          value={begriff}
          onChange={(e) => setBegriff(e.target.value)}
          placeholder="Mitarbeiter, Event, Kunde, Telefon, Event-ID …"
          aria-label="Globale Suche"
          style={{ paddingLeft: 32, paddingRight: 32 }}
        />
        <kbd style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--text-3)', border: '1px solid var(--linie)', borderRadius: 3, padding: '1px 4px', fontFamily: 'var(--font-mono)' }}>/</kbd>
      </form>

      <div style={{ flex: 1 }} />

      <Link href="/benachrichtigungen" className="knopf" aria-label={`Benachrichtigungen (${ungelesen} ungelesen)`}
            style={{ position: 'relative', width: 34, padding: 0, justifyContent: 'center' }}>
        <Icon name="bell" size={16} />
        {ungelesen > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: 'var(--rot)', color: '#fff',
            fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center',
          }}>{ungelesen > 99 ? '99+' : ungelesen}</span>
        )}
      </Link>

      <Link href="/konto/sicherheit" className="knopf knopf-symbol" aria-label="Sicherheit des eigenen Kontos"
            title={faktorFehlt ? 'Kein zweiter Faktor eingerichtet' : 'Sicherheit'}
            style={{ position: 'relative' }}>
        <Icon name="lock" size={16} />
        {faktorFehlt && (
          <span aria-hidden style={{
            position: 'absolute', top: -3, right: -3, width: 8, height: 8,
            borderRadius: 999, background: 'var(--gelb)',
          }} />
        )}
      </Link>

      <button type="button" className="knopf" onClick={umschalten}
              aria-label={aktuell === 'dark' ? 'Zur hellen Ansicht wechseln' : 'Zur dunklen Ansicht wechseln'}
              style={{ width: 34, padding: 0, justifyContent: 'center' }}>
        <Icon name={aktuell === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>

      <form action={abmelden}>
        <button type="submit" className="knopf" aria-label="Abmelden" style={{ width: 34, padding: 0, justifyContent: 'center' }}>
          <Icon name="logout" size={16} />
        </button>
      </form>
    </header>
  );
}
