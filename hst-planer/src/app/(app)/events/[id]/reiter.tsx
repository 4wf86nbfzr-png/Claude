'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { can, type Role } from '@/lib/auth/rbac';

/** Reiter der Event-Detailseite (Spec 61). */
const REITER = [
  { pfad: '', label: 'Uebersicht', recht: 'events.view' },
  { pfad: '/positionen', label: 'Positionen', recht: 'events.view' },
  { pfad: '/mitarbeiter', label: 'Mitarbeiter', recht: 'events.view' },
  { pfad: '/zeiten', label: 'Zeiten', recht: 'timesheets.view' },
  { pfad: '/dokumente', label: 'Dokumente', recht: 'documents.view' },
  { pfad: '/kommunikation', label: 'Kommunikation', recht: 'communication.view' },
  { pfad: '/abgleich', label: 'Abgleich', recht: 'reconciliation.view' },
  { pfad: '/protokoll', label: 'Protokoll', recht: 'admin.audit' },
] as const;

export function EventReiter({ id, rolle }: { id: string; rolle: Role }) {
  const aktuell = usePathname();
  const basis = `/events/${id}`;

  return (
    <nav aria-label="Eventbereiche" className="nicht-drucken"
         style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: '1px solid var(--linie)', marginBottom: 16 }}>
      {REITER.filter((r) => can(rolle, r.recht)).map((reiter) => {
        const href = `${basis}${reiter.pfad}`;
        const aktiv = reiter.pfad === '' ? aktuell === basis : aktuell.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={aktiv ? 'page' : undefined}
                style={{
                  padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap', textDecoration: 'none',
                  color: aktiv ? 'var(--text)' : 'var(--text-sekundaer)',
                  fontWeight: aktiv ? 600 : 400,
                  borderBottom: `2px solid ${aktiv ? 'var(--akzent)' : 'transparent'}`,
                  marginBottom: -1,
                }}>
            {reiter.label}
          </Link>
        );
      })}
    </nav>
  );
}
