import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Leer, Raster, Kennzahl, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Qualifikationen' };
export const dynamic = 'force-dynamic';

/**
 * Qualifikationen (SecPlan 2, Bereich PERSONAL).
 *
 * Zwei Fragen an einem Ort: welche Nachweise führen wir, und wo läuft
 * gerade einer ab. Das Ablaufdatum ist der Grund, warum es diese Seite
 * gibt – eine abgelaufene Sachkunde fällt sonst erst beim Einsatz auf.
 */
export default async function Qualifikationen() {
  await seite('qualifications.view');

  const heute = new Date();
  const in60Tagen = new Date(heute.getTime() + 60 * 86400000);

  const [qualifikationen, ablaufend] = await Promise.all([
    db.qualification.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      select: {
        id: true, code: true, name: true, description: true, expires: true, active: true,
        _count: { select: { employees: true, positions: true } },
      },
    }),
    db.employeeQualification.findMany({
      where: { expiresAt: { not: null, lte: in60Tagen }, employee: { deletedAt: null, active: true } },
      select: {
        id: true, expiresAt: true,
        qualification: { select: { code: true, name: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { expiresAt: 'asc' },
      take: 60,
    }),
  ]);

  const abgelaufen = ablaufend.filter((q) => q.expiresAt! < heute);

  return (
    <>
      <Seitenkopf titel="Qualifikationen" unter="Nachweise, Fristen und wer sie hat." />

      <Raster min={160}>
        <Kennzahl wert={qualifikationen.filter((q) => q.active).length} label="Geführte Nachweise" />
        <Kennzahl wert={qualifikationen.reduce((s, q) => s + q._count.employees, 0)} label="Zuordnungen" />
        <Kennzahl wert={ablaufend.length - abgelaufen.length} label="Laufen in 60 Tagen ab"
                  farbe={ablaufend.length > abgelaufen.length ? 'gelb' : 'gruen'} />
        <Kennzahl wert={abgelaufen.length} label="Bereits abgelaufen"
                  farbe={abgelaufen.length > 0 ? 'rot' : 'gruen'} />
      </Raster>

      {abgelaufen.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Hinweis art="fehler">
            <strong>{abgelaufen.length} {abgelaufen.length === 1 ? 'Nachweis ist' : 'Nachweise sind'} abgelaufen.</strong>{' '}
            Die Disposition warnt beim Zuordnen, verhindert den Einsatz aber nicht – das ist eine
            fachliche Entscheidung, keine technische.
          </Hinweis>
        </div>
      )}

      <h2 className="abschnitt">Ablaufende Nachweise</h2>
      <Karte>
        {ablaufend.length === 0 ? (
          <Leer>In den nächsten 60 Tagen läuft kein Nachweis ab.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Mitarbeiter</th><th>Nachweis</th><th>Läuft ab</th><th>Rest</th></tr></thead>
              <tbody>
                {ablaufend.map((eintrag) => {
                  const tage = Math.ceil((eintrag.expiresAt!.getTime() - heute.getTime()) / 86400000);
                  return (
                    <tr key={eintrag.id} className={tage < 0 ? 'zeile-rot' : tage < 30 ? 'zeile-gelb' : undefined}>
                      <td>
                        <Link href={`/mitarbeiter/${eintrag.employee.id}`}>
                          {eintrag.employee.lastName}, {eintrag.employee.firstName}
                        </Link>
                      </td>
                      <td>{eintrag.qualification.name} <span style={{ color: 'var(--text-3)' }}>({eintrag.qualification.code})</span></td>
                      <td className="zahl">{formatDateDE(eintrag.expiresAt!)}</td>
                      <td className="zahl">
                        {tage < 0
                          ? <span className="marke marke-rot">seit {Math.abs(tage)} T</span>
                          : <span className={`marke marke-${tage < 30 ? 'gelb' : 'grau'}`}>in {tage} T</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <h2 className="abschnitt">Geführte Qualifikationen</h2>
      <Karte>
        <div className="tabelle-scroll">
          <table className="tabelle">
            <thead>
              <tr><th>Kürzel</th><th>Bezeichnung</th><th>Beschreibung</th><th>Läuft ab</th><th>Mitarbeiter</th><th>Als Anforderung</th></tr>
            </thead>
            <tbody>
              {qualifikationen.map((q) => (
                <tr key={q.id} className={q.active ? undefined : 'zeile-grau'}>
                  <td className="zahl" style={{ fontWeight: 600 }}>{q.code}</td>
                  <td>{q.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{q.description ?? '–'}</td>
                  <td>{q.expires ? <span className="marke marke-gelb">mit Frist</span> : <span style={{ color: 'var(--text-3)' }}>unbefristet</span>}</td>
                  <td className="zahl">
                    <Link href={`/mitarbeiter?qualifikation=${q.id}`}>{q._count.employees}</Link>
                  </td>
                  <td className="zahl">{q._count.positions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Karte>
    </>
  );
}
