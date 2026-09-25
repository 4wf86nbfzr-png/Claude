import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { DSFA_ERGEBNIS, PRUEF_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'DSFA' };
export const dynamic = 'force-dynamic';

/**
 * Datenschutz-Folgenabschätzung (SecPlan 17, Art. 35 DSGVO).
 *
 * Die erste Frage ist nicht „wie sieht das Ergebnis aus", sondern „ist
 * überhaupt eine nötig". Deshalb steht die Notwendigkeit als eigene
 * Spalte und beginnt bei „noch nicht bewertet". Auch diese Entscheidung
 * trifft ein Mensch: Art. 35 Abs. 1 verlangt ein voraussichtlich hohes
 * Risiko, und was das ist, lässt sich nicht aus Feldern ableiten.
 */
export default async function Dsfa() {
  await seite('compliance.view');
  const heute = new Date();

  const [abschaetzungen, taetigkeiten] = await Promise.all([
    db.dpia.findMany({ orderBy: [{ necessity: 'asc' }, { title: 'asc' }] }),
    db.processingActivity.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, name: true, specialCategory: true },
    }),
  ]);

  const taetigkeitVon = new Map(taetigkeiten.map((t) => [t.id, t]));

  const offen = abschaetzungen.filter((d) => d.necessity === 'OFFEN');
  const erforderlich = abschaetzungen.filter((d) => d.necessity === 'ERFORDERLICH');
  const durchgefuehrt = abschaetzungen.filter((d) => d.necessity === 'DURCHGEFUEHRT');

  // Verarbeitungen mit besonderen Kategorien, für die es noch keine
  // Einschätzung gibt – der häufigste Fall, in dem eine DSFA zu prüfen ist.
  const bewertet = new Set(abschaetzungen.map((d) => d.activityId).filter(Boolean));
  const ohneEinschaetzung = taetigkeiten.filter((t) => t.specialCategory && !bewertet.has(t.id));

  return (
    <>
      <Seitenkopf
        titel="Datenschutz-Folgenabschätzung"
        unter="Art. 35 DSGVO"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={abschaetzungen.length} label="Vorgänge erfasst" />
        <Kennzahl wert={offen.length} label="Notwendigkeit nicht bewertet"
                  farbe={offen.length > 0 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={erforderlich.length} label="Als erforderlich bewertet"
                  farbe={erforderlich.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={durchgefuehrt.length} label="Durchgeführt" />
      </Raster>

      <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Hinweis art="info">
          Ob eine Folgenabschätzung nötig ist, entscheidet nicht dieses System. Art. 35 Abs. 1
          verlangt ein voraussichtlich hohes Risiko für die Rechte und Freiheiten natürlicher
          Personen; Abs. 3 nennt Regelfälle, und die Aufsichtsbehörden führen zusätzlich Listen.
          Das alles ist eine Bewertung, kein Feldvergleich.
        </Hinweis>

        {ohneEinschaetzung.length > 0 && (
          <Hinweis art="warnung">
            {ohneEinschaetzung.length} {ohneEinschaetzung.length === 1 ? 'Verarbeitung verarbeitet' : 'Verarbeitungen verarbeiten'} besondere
            Kategorien nach Art. 9, ohne dass eine Einschätzung zur Folgenabschätzung vorliegt:{' '}
            {ohneEinschaetzung.map((t) => t.name).join(', ')}.{' '}
            <Link href="/compliance/datenschutz">Zum Verzeichnis</Link>
          </Hinweis>
        )}
      </div>

      <Karte>
        {abschaetzungen.length === 0 ? (
          <Leer>Es ist noch kein Vorgang erfasst.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Vorgang</th><th>Verarbeitung</th><th>Notwendigkeit</th><th>Begründung</th>
                  <th>Risiken</th><th>Maßnahmen</th><th>Restrisiko</th>
                  <th>DSB beteiligt</th><th>Stand</th><th>Geprüft von</th><th>Wiedervorlage</th>
                </tr>
              </thead>
              <tbody>
                {abschaetzungen.map((d) => {
                  const t = d.activityId ? taetigkeitVon.get(d.activityId) : null;
                  const faellig = d.nextReviewAt !== null && d.nextReviewAt <= heute;
                  return (
                    <tr key={d.id}
                        className={d.necessity === 'ERFORDERLICH' && d.status !== 'RECHTLICH_GEPRUEFT' ? 'zeile-rot'
                          : d.necessity === 'OFFEN' ? 'zeile-gelb' : undefined}>
                      <td style={{ fontWeight: 500 }}>{d.title}</td>
                      <td style={{ fontSize: 12 }}>
                        {t ? <Link href="/compliance/datenschutz">{t.number} · {t.name}</Link> : '–'}
                      </td>
                      <td><StatusMarke status={label(DSFA_ERGEBNIS, d.necessity)} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>{d.necessityNote ?? '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>{d.risks ?? '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 220 }}>{d.measures ?? '–'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 180 }}>{d.residualRisk ?? '–'}</td>
                      <td>
                        {d.consultedDpo
                          ? <span className="marke marke-gruen">ja</span>
                          : <span className="marke marke-gelb">nein</span>}
                      </td>
                      <td><StatusMarke status={label(PRUEF_STATUS, d.status)} /></td>
                      <td style={{ fontSize: 12 }}>
                        {d.reviewedBy ?? '–'}
                        {d.reviewedAt && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>{formatDateDE(d.reviewedAt)}</span>}
                      </td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {d.nextReviewAt
                          ? <span className={faellig ? 'marke marke-gelb' : undefined}>{formatDateDE(d.nextReviewAt)}</span>
                          : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}
