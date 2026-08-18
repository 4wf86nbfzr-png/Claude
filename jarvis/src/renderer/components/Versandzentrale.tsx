import { useCallback, useEffect, useState } from 'react';
import type { Campaign, OutreachRow } from '@shared/types';
import { OUTREACH_STATUS_LABEL, VerificationStatus } from '@shared/status';

const markeFuer = (status: string): string => {
  if (['GESENDET', 'ANTWORT_ERHALTEN', 'FREIGEGEBEN'].includes(status)) return 'marke marke--gruen';
  if (['WARTET_AUF_FREIGABE', 'ENTWURF_ERSTELLT'].includes(status)) return 'marke marke--gelb';
  if (status === 'FEHLER') return 'marke marke--rot';
  return 'marke marke--grau';
};

const verifizierungsMarke = (status: string | null): string => {
  if (status === VerificationStatus.VERIFIZIERT) return 'marke marke--gruen';
  if (status === VerificationStatus.WAHRSCHEINLICH) return 'marke marke--gelb';
  return 'marke marke--rot';
};

/**
 * Die Versandzentrale (§6): eine Zeile je Unternehmen mit allem, was zur
 * Entscheidung nötig ist – einschließlich Quelle und Verifizierungsgrad.
 */
export function Versandzentrale({ onVorlesen }: { onVorlesen: (text: string) => void | Promise<void> }) {
  const [zeilen, setZeilen] = useState<OutreachRow[]>([]);
  const [kampagnen, setKampagnen] = useState<Campaign[]>([]);
  const [kampagne, setKampagne] = useState<number | 'alle'>('alle');
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setKampagnen(await window.jarvis.kampagnen());
    setZeilen(await window.jarvis.versandzentrale(kampagne === 'alle' ? {} : { campaignId: kampagne }));
  }, [kampagne]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const freigabeAnfordern = async (emailId: number) => {
    const ergebnis = await window.jarvis.freigabeAnfordern(emailId);
    setMeldung(ergebnis.meldung);
    await laden();
  };

  const vorlesen = async (emailId: number) => {
    const ergebnis = await window.jarvis.vorlesetext(emailId);
    await onVorlesen(ergebnis.text);
  };

  return (
    <div className="inhalt">
      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Versandzentrale</h2>
          <select
            value={String(kampagne)}
            onChange={(event) => setKampagne(event.target.value === 'alle' ? 'alle' : Number(event.target.value))}
            style={{ width: 'auto' }}
            aria-label="Kampagne filtern"
          >
            <option value="alle">Alle Kampagnen</option>
            {kampagnen.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>

        {meldung && <p className="hinweisband">{meldung}</p>}

        {zeilen.length === 0 ? (
          <p className="leer">
            Noch keine Vorgänge. Sagen Sie JARVIS zum Beispiel: „Lege eine Kampagne für Hamburger Bauunternehmen an
            und bereite Akquise für Baustellenbewachung vor.“
          </p>
        ) : (
          <div className="tabelle-huelle">
            <table className="tabelle">
            <thead>
              <tr>
                <th>Nr.</th>
                <th className="spalte-firma">Unternehmen</th>
                <th>Ansprechpartner</th>
                <th>E-Mail</th>
                <th>Quelle</th>
                <th>Prüfung</th>
                <th className="spalte-grund">Akquisegrund</th>
                <th>Mailstatus</th>
                <th>Letzter Kontakt</th>
                <th>Freigabe</th>
                <th className="spalte-aktion" />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile, index) => (
                <tr key={zeile.id}>
                  <td>{index + 1}</td>
                  <td className="spalte-firma">{zeile.company}</td>
                  <td>
                    {zeile.contactName ?? '—'}
                    {zeile.contactRole ? <div className="etikett">{zeile.contactRole}</div> : null}
                  </td>
                  <td>{zeile.email ?? <span className="marke marke--rot">Keine verifizierte Adresse</span>}</td>
                  <td>
                    {zeile.sourceUrl ? (
                      <a href={zeile.sourceUrl} className="etikett" title={zeile.sourceUrl}>
                        Beleg
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={verifizierungsMarke(zeile.verification)}>
                      {zeile.verification ?? 'OFFEN'}
                    </span>
                  </td>
                  <td className="spalte-grund">{zeile.reason ?? '—'}</td>
                  <td>
                    <span className={markeFuer(zeile.status)}>
                      {OUTREACH_STATUS_LABEL[zeile.status] ?? zeile.status}
                    </span>
                    {zeile.lastError ? <div className="etikett">{zeile.lastError}</div> : null}
                  </td>
                  <td>{zeile.lastContactAt ? new Date(zeile.lastContactAt).toLocaleDateString('de-DE') : '—'}</td>
                  <td>{zeile.approvalStatus ?? '—'}</td>
                  <td className="spalte-aktion">
                    {zeile.emailId && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="etikett" onClick={() => void vorlesen(zeile.emailId!)}>
                          Vorlesen
                        </button>
                        {zeile.status === 'ENTWURF_ERSTELLT' && (
                          <button className="etikett" onClick={() => void freigabeAnfordern(zeile.emailId!)}>
                            Freigabe
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
