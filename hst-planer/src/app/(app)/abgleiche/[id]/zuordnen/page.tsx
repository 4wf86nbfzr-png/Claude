import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { blattLesen } from '@/lib/domain/reconciliation';
import { suggestMapping, TIMESHEET_FIELDS, type ColumnMapping } from '@/lib/import/columns';
import { Karte, Seitenkopf } from '@/components/ui';
import { ZuordnungsFormular } from './formular';

export const metadata = { title: 'Spalten zuordnen' };
export const dynamic = 'force-dynamic';

export default async function Zuordnen({ params }: { params: Promise<{ id: string }> }) {
  await seite('reconciliation.edit');
  const { id } = await params;

  const abgleich = await db.reconciliation.findUnique({ where: { id } });
  if (!abgleich) notFound();

  const blatt = await blattLesen(id);
  const gespeichert = (abgleich.mapping ?? {}) as ColumnMapping;
  const vorschlag = Object.keys(gespeichert).length ? { mapping: gespeichert, missingRequired: suggestMapping(blatt.headers).missingRequired } : suggestMapping(blatt.headers);
  const vorlagen = await db.importTemplate.findMany({ where: { kind: 'TIMESHEET' }, orderBy: { name: 'asc' } });

  return (
    <>
      <Seitenkopf
        titel="Spalten zuordnen"
        brotkrumen={[{ href: '/abgleiche', label: 'Abgleiche' }, { href: `/abgleiche/${id}`, label: abgleich.reference }]}
        unter={`${abgleich.fileName ?? 'Datei'} · ${blatt.rows.length} Datenzeilen${blatt.sheetName ? ` · Blatt „${blatt.sheetName}“` : ''}`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ZuordnungsFormular
          id={id}
          headers={blatt.headers}
          felder={TIMESHEET_FIELDS.map((f) => ({ field: f.field, label: f.label, pflicht: Boolean(f.required) }))}
          mapping={vorschlag.mapping}
          vorlagen={vorlagen.map((v) => ({ id: v.id, name: v.name, mapping: v.mapping as ColumnMapping }))}
        />

        <Karte titel={`Vorschau – die ersten ${Math.min(12, blatt.rows.length)} Zeilen`}>
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>#</th>{blatt.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {blatt.rows.slice(0, 12).map((zeile, index) => (
                  <tr key={index}>
                    <td className="zahl" style={{ color: 'var(--text-3)' }}>{index + 2}</td>
                    {blatt.headers.map((h) => (
                      <td key={h} style={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatiere(zeile[h])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Karte>
      </div>
    </>
  );
}

function formatiere(wert: unknown): string {
  if (wert == null || wert === '') return '';
  if (wert instanceof Date) return wert.toISOString().slice(0, 10);
  return String(wert);
}
