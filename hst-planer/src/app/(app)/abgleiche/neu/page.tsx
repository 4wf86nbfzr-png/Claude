import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { Karte, Seitenkopf } from '@/components/ui';
import { HochladeFormular } from './formular';

export const metadata: Metadata = { title: 'Datei hochladen' };

export default async function NeuerAbgleich() {
  await seite('reconciliation.edit');
  const vorlagen = await db.importTemplate.findMany({ where: { kind: 'TIMESHEET' }, orderBy: { name: 'asc' } });

  return (
    <>
      <Seitenkopf titel="Stundenzettel hochladen" brotkrumen={[{ href: '/abgleiche', label: 'Abgleiche' }]}
                  unter="Excel (.xlsx) oder CSV. Die Spalten werden im nächsten Schritt zugeordnet." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
        <Karte titel="Datei auswählen">
          <div style={{ padding: 16 }}>
            <HochladeFormular />
          </div>
        </Karte>

        <Karte titel="Gespeicherte Vorlagen">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Im nächsten Schritt können Sie eine dieser Vorlagen anwenden – dann stimmt die
              Spaltenzuordnung sofort.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {vorlagen.length === 0 && <li style={{ color: 'var(--text-3)', listStyle: 'none', marginLeft: -18 }}>Noch keine Vorlage gespeichert.</li>}
              {vorlagen.map((vorlage) => <li key={vorlage.id}>{vorlage.name}</li>)}
            </ul>
          </div>
        </Karte>
      </div>
    </>
  );
}
