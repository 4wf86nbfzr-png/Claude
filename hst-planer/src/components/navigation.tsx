'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { Logo } from './logo';
import type { NavItem } from '@/lib/auth/rbac';

/** Platzhalter, der in der Liste eine Zwischenueberschrift markiert. */
const TRENNER: NavItem = { href: '__trenner__', label: '', permission: 'dashboard.view', icon: 'grid' };

/**
 * Seitennavigation (Spec 6/45).
 * Auf dem Desktop dauerhaft sichtbar, auf dem Smartphone als Schublade.
 * Die Tastenkuerzel aus Spec 46 haengen hier, weil die Navigation auf
 * jeder Seite eingebunden ist.
 */
export function Navigation({ items, eigene, name, rolle }: { items: NavItem[]; eigene: NavItem[]; name: string; rolle: string }) {
  const pfad = usePathname();
  const router = useRouter();
  const [offen, setOffen] = useState(false);

  useEffect(() => { setOffen(false); }, [pfad]);

  useEffect(() => {
    const erlaubt = new Set(items.map((i) => i.href));
    const ziel: Record<string, string> = {
      n: '/events/neu', s: '/suche', e: '/mitarbeiter', k: '/kalender', a: '/abgleiche',
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
      if (!erlaubt.has(basis) && basis !== '/suche') return;
      event.preventDefault();
      router.push(href);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, router]);

  return (
    <>
      <button type="button" className="knopf nicht-drucken" aria-label="Menue oeffnen" aria-expanded={offen}
              onClick={() => setOffen((v) => !v)}
              style={{ position: 'fixed', top: 10, left: 10, zIndex: 60, width: 36, padding: 0, justifyContent: 'center' }}
              data-nur-mobil>
        <Icon name={offen ? 'close' : 'menu'} size={18} />
      </button>

      {offen && <div onClick={() => setOffen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 55 }} data-nur-mobil />}

      <nav aria-label="Hauptnavigation" data-offen={offen || undefined}
           className="app-nav nicht-drucken"
           style={{ background: 'var(--flaeche-nav)', color: 'var(--text-nav)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 14px 12px' }}>
          <Logo groesse={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: '#fff', lineHeight: 1.2 }}>HST Planer</div>
            <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8A98' }}>Disposition</div>
          </div>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto' }}>
          {eigene.length > 0 && items.length > 0 && (
            <li style={{ padding: '8px 9px 3px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6E6E7C' }}>
              Mein Bereich
            </li>
          )}
          {[...eigene, ...(eigene.length > 0 && items.length > 0 ? [TRENNER] : []), ...items].map((item) => {
            if (item === TRENNER) {
              return (
                <li key="trenner" style={{ padding: '10px 9px 3px', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6E6E7C' }}>
                  Disposition
                </li>
              );
            }
            const aktiv = pfad === item.href || pfad.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link href={item.href}
                      aria-current={aktiv ? 'page' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 9px', borderRadius: 6, fontSize: 13,
                        color: aktiv ? '#fff' : 'var(--text-nav)',
                        background: aktiv ? 'rgba(124,58,237,.9)' : 'transparent',
                        fontWeight: aktiv ? 600 : 400, textDecoration: 'none',
                      }}>
                  <Icon name={item.icon} size={16} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.shortcut && (
                    <kbd style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, border: '1px solid #ffffff22', color: '#8A8A98', fontFamily: 'var(--font-mono)' }}>
                      {item.shortcut}
                    </kbd>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div style={{ borderTop: '1px solid #ffffff14', padding: '10px 14px', fontSize: 12 }}>
          <div style={{ color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ color: '#8A8A98', fontSize: 11 }}>{rolle}</div>
        </div>
      </nav>
    </>
  );
}
