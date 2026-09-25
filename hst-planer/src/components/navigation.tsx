'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import type { NavGruppe, NavItem } from '@/lib/auth/rbac';

/**
 * Menüleiste oben (SecPlan 2 und 28).
 *
 * Neun Bereiche waagerecht; wer Unterpunkte hat, klappt ein Blatt auf.
 * Die Leiste bleibt beim Scrollen stehen – in einer Disposition wird
 * viel gescrollt, und der Weg in einen anderen Bereich soll nicht erst
 * das Zurückscrollen kosten.
 *
 * Bedienung: Klick öffnet, Klick daneben oder Esc schließt, Pfeiltasten
 * laufen durch die Einträge. Bewusst kein Aufklappen beim bloßen
 * Darüberfahren – auf dem Weg zur vierten Gruppe gingen sonst drei
 * Blätter auf und wieder zu.
 *
 * Auf dem Smartphone wird aus derselben Struktur eine Schublade plus
 * eine schmale Fußleiste mit den vier Dingen, die unterwegs zählen.
 */
export function Navigation({
  gruppen, eigene, name, rolle,
}: {
  gruppen: NavGruppe[];
  eigene: NavItem[];
  name: string;
  rolle: string;
}) {
  const pfad = usePathname();
  const router = useRouter();

  /** Welches Blatt ist offen? (Die id der Gruppe, oder 'eigen'.) */
  const [offenesBlatt, setOffenesBlatt] = useState<string | null>(null);
  /** Schublade auf dem Smartphone. */
  const [schublade, setSchublade] = useState(false);
  const [ausgeklappt, setAusgeklappt] = useState<string[]>([]);

  const leiste = useRef<HTMLElement>(null);

  const istAktiv = useCallback(
    (href: string) => pfad === href || pfad.startsWith(`${href}/`),
    [pfad],
  );

  /** Welche Gruppe gehört zum aktuellen Pfad? Der längste Treffer gewinnt. */
  const aktiveGruppe = useMemo(() => {
    let treffer = '';
    let laenge = -1;
    for (const gruppe of gruppen) {
      for (const ziel of [gruppe.href, ...gruppe.items.map((i) => i.href)]) {
        if ((pfad === ziel || pfad.startsWith(`${ziel}/`)) && ziel.length > laenge) {
          treffer = gruppe.id;
          laenge = ziel.length;
        }
      }
    }
    if (eigene.some((i) => pfad === i.href || pfad.startsWith(`${i.href}/`))) return 'eigen';
    return treffer;
  }, [gruppen, eigene, pfad]);

  // Seitenwechsel schließt alles.
  useEffect(() => {
    setOffenesBlatt(null);
    setSchublade(false);
    if (aktiveGruppe) setAusgeklappt((v) => (v.includes(aktiveGruppe) ? v : [...v, aktiveGruppe]));
  }, [pfad, aktiveGruppe]);

  // Klick außerhalb der Leiste schließt das Blatt.
  useEffect(() => {
    if (!offenesBlatt) return;
    function onKlick(event: MouseEvent) {
      if (!leiste.current?.contains(event.target as Node)) setOffenesBlatt(null);
    }
    document.addEventListener('mousedown', onKlick);
    return () => document.removeEventListener('mousedown', onKlick);
  }, [offenesBlatt]);

  // Tastenkürzel. Sie hängen hier, weil die Leiste auf jeder Seite steht.
  useEffect(() => {
    const erlaubt = new Set<string>();
    for (const gruppe of gruppen) {
      erlaubt.add(gruppe.href);
      for (const item of gruppe.items) erlaubt.add(item.href);
    }

    const ziel: Record<string, string> = {
      n: '/events/neu', s: '/suche', e: '/mitarbeiter',
      k: '/kalender', t: '/disposition', a: '/abgleiche',
    };

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOffenesBlatt(null);
        setSchublade(false);
        return;
      }
      // Kürzel dürfen nie während einer Eingabe auslösen.
      const aktiv = document.activeElement;
      if (aktiv instanceof HTMLElement && (aktiv.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(aktiv.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const href = ziel[event.key.toLowerCase()];
      if (!href) return;
      const basis = `/${href.split('/')[1]}`;
      if (!erlaubt.has(basis) && !erlaubt.has(href) && basis !== '/suche') return;
      event.preventDefault();
      router.push(href);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gruppen, router]);

  /** Pfeiltasten innerhalb eines offenen Blattes. */
  function onBlattTaste(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const eintraege = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'));
    if (eintraege.length === 0) return;
    event.preventDefault();
    const jetzt = eintraege.indexOf(document.activeElement as HTMLAnchorElement);
    const naechste = event.key === 'ArrowDown'
      ? (jetzt + 1) % eintraege.length
      : (jetzt <= 0 ? eintraege.length - 1 : jetzt - 1);
    eintraege[naechste]?.focus();
  }

  function blattEintraege(items: NavItem[]) {
    return items.map((item) => (
      <Link key={item.href} href={item.href}
            className="menue-eintrag"
            data-aktiv={istAktiv(item.href) || undefined}
            aria-current={istAktiv(item.href) ? 'page' : undefined}>
        <span>{item.label}</span>
        {item.shortcut && <kbd>{item.shortcut}</kbd>}
      </Link>
    ));
  }

  return (
    <>
      {/* ------------------------------------------------ Menüleiste ---- */}
      <nav ref={leiste} className="app-menue nicht-drucken" aria-label="Hauptnavigation">
        {gruppen.map((gruppe) => {
          // Ein Bereich ohne Unterpunkte ist selbst der Link.
          if (gruppe.items.length === 0) {
            return (
              <div className="menue-gruppe" key={gruppe.id}>
                <Link href={gruppe.href} className="menue-knopf"
                      data-aktiv={istAktiv(gruppe.href) || undefined}
                      aria-current={istAktiv(gruppe.href) ? 'page' : undefined}>
                  <Icon name={gruppe.icon} size={14} />
                  <span>{gruppe.label}</span>
                </Link>
              </div>
            );
          }

          const offen = offenesBlatt === gruppe.id;
          return (
            <div className="menue-gruppe" key={gruppe.id}>
              <button type="button" className="menue-knopf"
                      data-aktiv={gruppe.id === aktiveGruppe || undefined}
                      aria-expanded={offen} aria-haspopup="true"
                      onClick={() => setOffenesBlatt(offen ? null : gruppe.id)}
                      onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOffenesBlatt(gruppe.id); } }}>
                <Icon name={gruppe.icon} size={14} />
                <span>{gruppe.label}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {offen && (
                <div className="menue-blatt" onKeyDown={onBlattTaste}>
                  {blattEintraege(gruppe.items)}
                </div>
              )}
            </div>
          );
        })}

        {/* Der eigene Bereich steht rechts – er gehört zur Person. */}
        {eigene.length > 0 && (
          <div className="menue-gruppe menue-eigen">
            <button type="button" className="menue-knopf"
                    data-aktiv={aktiveGruppe === 'eigen' || undefined}
                    aria-expanded={offenesBlatt === 'eigen'} aria-haspopup="true"
                    onClick={() => setOffenesBlatt(offenesBlatt === 'eigen' ? null : 'eigen')}
                    onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOffenesBlatt('eigen'); } }}>
              <Icon name="users" size={14} />
              <span>Mein Bereich</span>
              <Icon name="chevron-down" size={11} />
            </button>
            {offenesBlatt === 'eigen' && (
              <div className="menue-blatt" onKeyDown={onBlattTaste}>
                <span style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                  {name} · {rolle}
                </span>
                {blattEintraege(eigene)}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ------------------------------------- Schublade (Smartphone) --- */}
      {schublade && <div className="nav-schleier nicht-drucken" onClick={() => setSchublade(false)} />}

      <nav aria-label="Bereiche" data-offen={schublade || undefined} className="app-nav nicht-drucken">
        <div className="nav-fuss" style={{ borderTop: 0, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <strong>{name}</strong>
          <span>{rolle}</span>
        </div>

        <div className="nav-liste">
          {eigene.length > 0 && (
            <div className="nav-gruppe">
              <div className="nav-titel">Mein Bereich</div>
              {eigene.map((item) => (
                <Link key={item.href} href={item.href}
                      className="nav-unter" data-aktiv={istAktiv(item.href) || undefined}
                      aria-current={istAktiv(item.href) ? 'page' : undefined}>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          )}

          {gruppen.map((gruppe) => {
            if (gruppe.items.length === 0) {
              return (
                <div className="nav-gruppe" key={gruppe.id}>
                  <Link href={gruppe.href} className="nav-eintrag"
                        data-aktiv={istAktiv(gruppe.href) || undefined}
                        aria-current={istAktiv(gruppe.href) ? 'page' : undefined}>
                    <Icon name={gruppe.icon} size={15} />
                    <span>{gruppe.label}</span>
                  </Link>
                </div>
              );
            }

            const auf = ausgeklappt.includes(gruppe.id);
            return (
              <div className="nav-gruppe" key={gruppe.id}>
                <button type="button" className="nav-eintrag"
                        data-aktiv={gruppe.id === aktiveGruppe || undefined}
                        aria-expanded={auf}
                        onClick={() => setAusgeklappt((v) => (auf ? v.filter((x) => x !== gruppe.id) : [...v, gruppe.id]))}>
                  <Icon name={gruppe.icon} size={15} />
                  <span>{gruppe.label}</span>
                  <Icon name={auf ? 'chevron-up' : 'chevron-down'} size={13} />
                </button>
                {auf && gruppe.items.map((item) => (
                  <Link key={item.href} href={item.href}
                        className="nav-unter" data-aktiv={istAktiv(item.href) || undefined}
                        aria-current={istAktiv(item.href) ? 'page' : undefined}>
                    <span>{item.label}</span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Fußleiste nur auf dem Smartphone – vier Ziele, keine geschrumpfte Leiste. */}
      <nav className="fussnav nicht-drucken" aria-label="Schnellzugriff">
        {[
          { href: eigene[0]?.href ?? gruppen[0]?.href ?? '/dashboard', label: 'Einsätze', icon: 'calendar' },
          { href: '/meine-verfuegbarkeit', label: 'Verfügbar', icon: 'clock' },
          { href: '/benachrichtigungen', label: 'Hinweise', icon: 'bell' },
          { href: '/suche', label: 'Suche', icon: 'search' },
        ].map((z) => (
          <Link key={z.href} href={z.href} data-aktiv={istAktiv(z.href) || undefined}>
            <Icon name={z.icon} size={17} />
            <span>{z.label}</span>
          </Link>
        ))}
      </nav>

      {/*
        Der Schalter für die Schublade. Er liegt über der Kopfzeile statt
        in ihr – so muss die Kopfzeile nichts über den Zustand der
        Navigation wissen, und auf dem Desktop ist er schlicht nicht da.
      */}
      <button type="button" className="knopf knopf-symbol nav-schalter nicht-drucken"
              aria-label={schublade ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={schublade}
              onClick={() => setSchublade((v) => !v)}>
        <Icon name={schublade ? 'close' : 'menu'} size={18} />
      </button>
    </>
  );
}
