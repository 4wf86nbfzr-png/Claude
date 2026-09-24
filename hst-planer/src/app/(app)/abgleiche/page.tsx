import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { formatDateDE } from '@/lib/time';
import { RECONCILIATION_STATUS, label } from '@/lib/status';
import { Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { Blaettern } from '@/components/blaettern';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Abgleiche' };
export const dynamic = 'force-dynamic';

export default async function Abgleiche({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('reconciliation.view');
  const { page, perPage, skip } = pagination(await searchParams);

  const [abgleiche, gesamt] = await Promise.all([
    db.reconciliation.findMany({ orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.reconciliation.count(),
  ]);

  return (
    <>
      <Seitenkopf
        titel="Abgleiche"
        unter="Planung gegen tatsächlich geleistete Zeiten"
        aktionen={can(user.role, 'reconciliation.edit') && (
          <Link href="/abgleiche/neu" className="knopf knopf-primaer"><Icon name="upload" /> Datei hochladen</Link>
        )}
      />

      <Karte>
        {abgleiche.length === 0 ? (
          <Leer>
            Noch kein Abgleich vorhanden. Laden Sie einen Stundenzettel als Excel- oder CSV-Datei hoch –
            der HST Planer ordnet die Mitarbeiter automatisch zu und zeigt jede Abweichung.
          </Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nummer</th><th>Bezeichnung</th><th>Zeitraum</th><th>Datensätze</th>
                  <th>Zugeordnet</th><th>Abweichungen</th><th>Ungeklärt</th><th>Status</th><th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {abgleiche.map((abgleich) => {
                  const ungeklaert = abgleich.unknownRows + abgleich.duplicateRows;
                  return (
                    <tr key={abgleich.id} className={ungeklaert > 0 ? 'zeile-rot' : abgleich.deviationRows > 0 ? 'zeile-gelb' : 'zeile-gruen'}>
                      <td className="zahl" style={{ fontSize: 12, color: 'var(--text-gedaempft)' }}>{abgleich.reference}</td>
                      <td>
                        <Link href={`/abgleiche/${abgleich.id}`} style={{ fontWeight: 500 }}>{abgleich.name}</Link>
                        {abgleich.fileName && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{abgleich.fileName}</span>}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {abgleich.periodFrom ? `${formatDateDE(abgleich.periodFrom)} – ${formatDateDE(abgleich.periodTo ?? abgleich.periodFrom)}` : '–'}
                      </td>
                      <td className="zahl">{abgleich.totalRows}</td>
                      <td className="zahl">{abgleich.matchedRows}</td>
                      <td className="zahl" style={{ color: abgleich.deviationRows > 0 ? 'var(--gelb)' : undefined }}>{abgleich.deviationRows}</td>
                      <td className="zahl" style={{ color: ungeklaert > 0 ? 'var(--rot)' : undefined, fontWeight: ungeklaert > 0 ? 600 : 400 }}>{ungeklaert}</td>
                      <td><StatusMarke status={label(RECONCILIATION_STATUS, abgleich.status)} /></td>
                      <td className="zahl" style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>{formatDateDE(abgleich.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}
