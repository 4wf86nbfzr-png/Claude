import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { TOM_BEREICH, TOM_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'TOM' };
export const dynamic = 'force-dynamic';

/**
 * Technische und organisatorische Maßnahmen (SecPlan 15, Art. 32 DSGVO).
 *
 * Jede Maßnahme trägt einen Nachweis: die Stelle im System, an der sie
 * tatsächlich greift. Eine TOM-Liste ohne Fundstelle ist eine Absichts-
 * erklärung – mit Fundstelle ist sie prüfbar.
 *
 * „Technisch umgesetzt" heißt hier: im System vorhanden. Ob die Maßnahme
 * angemessen im Sinne des Art. 32 ist, steht damit nicht fest.
 */
export default async function Tom() {
  await seite('compliance.view');
  const heute = new Date();

  const massnahmen = await db.tomMeasure.findMany({ orderBy: [{ bereich: 'asc' }, { title: 'asc' }] });

  const nachBereich = new Map<string, typeof massnahmen>();
  for (const m of massnahmen) {
    const liste = nachBereich.get(m.bereich);
    if (liste) liste.push(m);
    else nachBereich.set(m.bereich, [m]);
  }

  const umgesetzt = massnahmen.filter((m) => m.status === 'TECHNISCH_UMGESETZT' || m.status === 'ORGANISATORISCH_GEREGELT');
  const offen = massnahmen.filter((m) => m.status === 'NICHT_UMGESETZT');
  const faellig = massnahmen.filter((m) => m.nextCheckAt && m.nextCheckAt <= heute);

  return (
    <>
      <Seitenkopf
        titel="Technische und organisatorische Maßnahmen"
        unter="Art. 32 DSGVO – mit Fundstelle im System"
        brotkrumen={[{ href: '/compliance', label: 'HST Compliance' }]}
      />

      <Raster min={160}>
        <Kennzahl wert={massnahmen.length} label="Erfasste Maßnahmen" />
        <Kennzahl wert={umgesetzt.length} label="Umgesetzt oder geregelt"
                  farbe={umgesetzt.length === massnahmen.length && massnahmen.length > 0 ? 'gruen' : 'gelb'} />
        <Kennzahl wert={offen.length} label="Ausdrücklich nicht umgesetzt"
                  farbe={offen.length > 0 ? 'rot' : 'gruen'} />
        <Kennzahl wert={faellig.length} label="Überprüfung fällig"
                  farbe={faellig.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="warnung">
          <strong>Technisch umgesetzt ist nicht dasselbe wie angemessen.</strong> Diese Liste sagt,
          welche Maßnahmen im System vorhanden sind und wo sie nachzulesen sind. Ob sie dem
          Risiko angemessen sind, ist eine Bewertung nach Art. 32 Abs. 1 – die trifft ein Mensch.
        </Hinweis>
      </div>

      {massnahmen.length === 0 ? (
        <Karte><Leer>Es ist noch keine Maßnahme erfasst.</Leer></Karte>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...nachBereich.entries()].map(([bereich, liste]) => (
            <Karte key={bereich} titel={TOM_BEREICH[bereich] ?? bereich}>
              <div className="tabelle-scroll">
                <table className="tabelle">
                  <thead>
                    <tr><th>Maßnahme</th><th>Beschreibung</th><th>Stand</th><th>Nachweis im System</th><th>Verantwortlich</th><th>Zuletzt geprüft</th><th>Nächste Prüfung</th></tr>
                  </thead>
                  <tbody>
                    {liste.map((m) => {
                      const ueberfaellig = m.nextCheckAt !== null && m.nextCheckAt <= heute;
                      return (
                        <tr key={m.id}
                            className={m.status === 'NICHT_UMGESETZT' ? 'zeile-rot' : ueberfaellig ? 'zeile-gelb' : undefined}>
                          <td style={{ fontWeight: 500 }}>{m.title}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 360 }}>{m.description}</td>
                          <td><StatusMarke status={label(TOM_STATUS, m.status)} /></td>
                          <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                            {m.evidence ?? <span className="marke marke-gelb">keine Fundstelle</span>}
                          </td>
                          <td style={{ fontSize: 12 }}>{m.responsible ?? '–'}</td>
                          <td className="zahl">{m.lastCheckAt ? formatDateDE(m.lastCheckAt) : '–'}</td>
                          <td className="zahl">
                            {m.nextCheckAt
                              ? <span className={ueberfaellig ? 'marke marke-gelb' : undefined}>{formatDateDE(m.nextCheckAt)}</span>
                              : '–'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Karte>
          ))}
        </div>
      )}
    </>
  );
}
