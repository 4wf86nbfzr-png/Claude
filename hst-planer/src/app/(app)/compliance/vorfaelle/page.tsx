import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { VORFALL_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Datenschutzvorfälle' };
export const dynamic = 'force-dynamic';

/**
 * Datenschutzvorfälle (SecPlan 17, Art. 33/34 DSGVO).
 *
 * Das Entscheidende an dieser Seite ist, was sie NICHT tut: Sie behauptet
 * nicht, ob ein Vorfall meldepflichtig ist. Art. 33 Abs. 1 knüpft die
 * Meldepflicht an ein Risiko für die Rechte und Freiheiten natürlicher
 * Personen – das ist eine Abwägung, keine Rechenaufgabe. Das Feld bleibt
 * leer, bis eine benannte Person es ausfüllt, und die 72-Stunden-Frist
 * wird gezeigt, nicht bewertet.
 */
export default async function Vorfaelle() {
  await seite('compliance.breaches');
  const jetzt = new Date();

  const vorfaelle = await db.dataBreach.findMany({ orderBy: [{ status: 'asc' }, { noticedAt: 'desc' }] });

  const unbewertet = vorfaelle.filter((v) => v.reportable === null && !['ABGESCHLOSSEN', 'KEINE_MELDUNG'].includes(v.status));
  const offen = vorfaelle.filter((v) => !['ABGESCHLOSSEN', 'KEINE_MELDUNG'].includes(v.status));
  const gemeldet = vorfaelle.filter((v) => v.reportedAt !== null);

  /** Stunden seit Kenntnis – Art. 33 Abs. 1 nennt 72. */
  function stundenSeit(datum: Date): number {
    return Math.floor((jetzt.getTime() - datum.getTime()) / 3_600_000);
  }

  return (
    <>
      <Seitenkopf
        titel="Datenschutzvorfälle"
        unter="Art. 33 und 34 DSGVO"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={vorfaelle.length} label="Erfasste Vorfälle" />
        <Kennzahl wert={offen.length} label="Nicht abgeschlossen" farbe={offen.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={unbewertet.length} label="Meldepflicht nicht bewertet"
                  farbe={unbewertet.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={gemeldet.length} label="An die Aufsicht gemeldet" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="warnung">
          <strong>Das System bewertet nicht, ob ein Vorfall meldepflichtig ist.</strong> Art. 33
          Abs. 1 DSGVO knüpft die Meldepflicht an ein Risiko für die Rechte und Freiheiten
          natürlicher Personen – das ist eine Abwägung. Die Spalte bleibt leer, bis eine benannte
          Person sie ausfüllt. Die angezeigten Stunden seit Kenntnis sind eine Rechnung, keine
          Feststellung einer Fristverletzung.
        </Hinweis>
      </div>

      <Karte>
        {vorfaelle.length === 0 ? (
          <Leer>
            Es ist kein Datenschutzvorfall erfasst. Das ist der gute Fall – trotzdem gehört der
            Meldeweg geübt, bevor er gebraucht wird.
          </Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Nr.</th><th>Vorfall</th><th>Bekannt seit</th><th>Stunden</th>
                  <th>Betroffene Daten</th><th>Betroffene</th><th>Maßnahmen</th>
                  <th>Meldepflichtig?</th><th>Bewertet von</th><th>Gemeldet</th>
                  <th>Betroffene informiert</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vorfaelle.map((v) => {
                  const stunden = stundenSeit(v.noticedAt);
                  const laeuft = !['ABGESCHLOSSEN', 'KEINE_MELDUNG'].includes(v.status);
                  return (
                    <tr key={v.id} className={v.reportable === null && laeuft ? 'zeile-rot' : laeuft ? 'zeile-gelb' : undefined}>
                      <td className="zahl">{v.number}</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{v.title}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', maxWidth: 300 }}>
                          {v.description}
                        </span>
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(v.noticedAt)}</td>
                      <td className="zahl">
                        <span className={`marke marke-${laeuft && stunden > 72 ? 'rot' : laeuft && stunden > 48 ? 'gelb' : 'grau'}`}
                              title="Art. 33 Abs. 1 DSGVO nennt 72 Stunden ab Kenntnis.">
                          {stunden} h
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 200 }}>{v.affectedData}</td>
                      <td className="zahl">{v.affectedCount ?? '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>{v.measures ?? '–'}</td>
                      <td>
                        {v.reportable === null
                          ? <span className="marke marke-rot">noch nicht bewertet</span>
                          : v.reportable
                            ? <span className="marke marke-gelb" title={v.reportableNote ?? undefined}>ja</span>
                            : <span className="marke marke-gruen" title={v.reportableNote ?? undefined}>nein</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {v.assessedBy ?? '–'}
                        {v.assessedAt && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>{formatDateDE(v.assessedAt)}</span>}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {v.reportedAt ? formatDateDE(v.reportedAt) : '–'}
                        {v.authority && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>{v.authority}</span>}
                      </td>
                      <td className="zahl">{v.subjectsInformedAt ? formatDateDE(v.subjectsInformedAt) : '–'}</td>
                      <td><StatusMarke status={label(VORFALL_STATUS, v.status)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-2)', maxWidth: '68ch', lineHeight: 1.55 }}>
        Zuständig in Hamburg ist der Hamburgische Beauftragte für Datenschutz und
        Informationsfreiheit. Die Meldung nach Art. 33 geht an die Aufsichtsbehörde, die
        Benachrichtigung nach Art. 34 an die betroffenen Personen – beides sind getrennte
        Entscheidungen und stehen deshalb in getrennten Spalten.
      </p>
    </>
  );
}
