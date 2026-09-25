'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons';
import { Logo } from './logo';
import type { NavGruppe, NavItem } from '@/lib/auth/rbac';

/**
 * Seitennavigation nach SecPlan 2 und 28.
 *
 * Auf dem Desktop dauerhaft sichtbar und in neun Bereiche gegliedert;
 * die Gruppe des aktuellen Pfades ist aufgeklappt, die anderen sind zu.
 * Auf dem Smartphone wird daraus eine Schublade plus eine schmale
 * Fussleiste mit den vier Dingen, die unterwegs wirklich gebraucht werden.
 *
 * Die Tastenkuerzel haengen hier, weil die Navigation auf jeder Seite
 * eingebunden ist.
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
  const [offen, setOffen] = useState(false);

  /** Welche Gruppe gehoert zum aktuellen Pfad? */
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
    return treffer;
  }, [gruppen, pfad]);

  const [ausgeklappt, setAusgeklappt] = useState<string[]>([]);
  useEffect(() => {
    setOffen(false);
    if (aktiveGruppe) setAusgeklappt((v) => (v.includes(aktiveGruppe) ? v : [...v, aktiveGruppe]));
  }, [pfad, aktiveGruppe]);

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
      if (event.key === 'Escape') { setOffen(false); return; }
      // Kuerzel duerfen nie waehrend einer Eingabe ausloesen.
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

  function istAktiv(href: string) {
    return pfad === href || pfad.startsWith(`${href}/`);
  }

  return (
    <>
      <button type="button" className="knopf knopf-symbol nav-schalter nicht-drucken"
              aria-label={offen ? 'Menü schließen' : 'Menü öffnen'} aria-expanded={offen}
              onClick={() => setOffen((v) => !v)}>
        <Icon name={offen ? 'close' : 'menu'} size={18} />
      </button>

      {offen && <div className="nav-schleier nicht-drucken" onClick={() => setOffen(false)} />}

      <nav aria-label="Hauptnavigation" data-offen={offen || undefined} className="app-nav nicht-drucken">
        <div className="nav-marke">
          <Logo groesse={24} />
          <div>
            <strong>HST Planer</strong>
            <span>Leitstelle</span>
          </div>
        </div>

        <div className="nav-liste">
          {eigene.length > 0 && (
            <div className="nav-gruppe">
              <div className="nav-titel">Mein Bereich</div>
              {eigene.map((item) => (
                <Link key={item.href} href={item.href}
                      className="nav-unter" data-aktiv={istAktiv(item.href) || undefined}
                      aria-current={istAktiv(item.href) ? 'page' : undefined}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}

          {gruppen.map((gruppe) => {
            // Gruppen ohne Unterpunkte (Dashboard) sind selbst der Link.
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

        <div className="nav-fuss">
          <strong>{name}</strong>
          <span>{rolle}</span>
        </div>
      </nav>

      {/* Fussleiste nur auf dem Smartphone – vier Ziele, keine geschrumpfte Sidebar. */}
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
    </>
  );
}
