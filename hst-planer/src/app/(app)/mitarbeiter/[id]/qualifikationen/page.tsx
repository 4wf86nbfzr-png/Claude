import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { TRAINING_RESULT, label } from '@/lib/status';
import { Hinweis, Karte, Leer, StatusMarke } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Qualifikationen' };

/** Reiter „Qualifikationen" der Mitarbeiterakte (SecPlan 5). */
export default async function AkteQualifikationen({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.view');
  const { id } = await params;

  const sichtbar = await db.employee.count({ where: { id, ...employeeFilter(user) } });
  if (sichtbar === 0) return <Karte><Leer>Dieser Datensatz ist für Ihre Rolle nicht sichtbar.</Leer></Karte>;

  const [nachweise, schulungen] = await Promise.all([
    db.employeeQualification.findMany({
      where: { employeeId: id },
      select: {
        id: true, acquiredAt: true, expiresAt: true, note: true,
        qualification: { select: { code: true, name: true, description: true, expires: true } },
      },
      orderBy: { qualification: { name: 'asc' } },
    }),
    db.trainingParticipant.findMany({
      where: { employeeId: id },
      select: {
        id: true, result: true, note: true,
        training: { select: { title: true, startsAt: true, endsAt: true, mandatory: true, repeatMonths: true } },
      },
      orderBy: { training: { startsAt: 'desc' } },
    }),
  ]);

  const heute = new Date();
  const abgelaufen = nachweise.filter((q) => q.expiresAt && q.expiresAt < heute);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {abgelaufen.length > 0 && (
        <Hinweis art="fehler">
          {abgelaufen.length === 1 ? 'Ein Nachweis ist' : `${abgelaufen.length} Nachweise sind`} abgelaufen.
          Beim Zuordnen erscheint dafür eine Warnung.
        </Hinweis>
      )}

      <Karte titel="Qualifikationen">
        {nachweise.length === 0 ? <Leer>Keine Qualifikation hinterlegt.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Kürzel</th><th>Nachweis</th><th>Erworben</th><th>Gültig bis</th><th>Notiz</th></tr></thead>
              <tbody>
                {nachweise.map((q) => {
                  const tage = q.expiresAt ? Math.ceil((q.expiresAt.getTime() - heute.getTime()) / 86400000) : null;
                  return (
                    <tr key={q.id} className={tage !== null && tage < 0 ? 'zeile-rot' : tage !== null && tage <= 30 ? 'zeile-gelb' : undefined}>
                      <td className="zahl" style={{ fontWeight: 600 }}>{q.qualification.code}</td>
                      <td>
                        {q.qualification.name}
                        {q.qualification.description && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{q.qualification.description}</span>
                        )}
                      </td>
                      <td className="zahl">{q.acquiredAt ? formatDateDE(q.acquiredAt) : '–'}</td>
                      <td className="zahl">
                        {q.expiresAt
                          ? <span className={`marke marke-${tage! < 0 ? 'rot' : tage! <= 30 ? 'gelb' : 'gruen'}`}>
                              {tage! < 0 ? `abgelaufen am ${formatDateDE(q.expiresAt)}` : formatDateDE(q.expiresAt)}
                            </span>
                          : <span className="marke marke-gruen">unbefristet</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{q.note ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <Karte titel="Schulungen" aktion={<Link href="/schulungen" className="knopf knopf-klein">Alle Schulungen</Link>}>
        {schulungen.length === 0 ? <Leer>Keine Schulung erfasst.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Schulung</th><th>Termin</th><th>Art</th><th>Ergebnis</th><th>Notiz</th></tr></thead>
              <tbody>
                {schulungen.map((t) => (
                  <tr key={t.id}>
                    <td>{t.training.title}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(t.training.startsAt)}</td>
                    <td>
                      {t.training.mandatory
                        ? <span className="marke marke-beige">Pflicht{t.training.repeatMonths ? `, alle ${t.training.repeatMonths} Mon.` : ''}</span>
                        : <span className="marke marke-grau">freiwillig</span>}
                    </td>
                    <td><StatusMarke status={label(TRAINING_RESULT, t.result)} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.note ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </div>
  );
}
