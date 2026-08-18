import { useCallback, useEffect, useState } from 'react';
import type { EmailRecord } from '@shared/types';

const STATUS = ['ENTWURF', 'WARTET_AUF_FREIGABE', 'FREIGEGEBEN', 'GESENDET', 'FEHLGESCHLAGEN', 'EMPFANGEN'];

/** Entwurfsverwaltung: lesen, ändern, vorlesen, Freigabe anfordern. */
export function Entwuerfe({ onVorlesen }: { onVorlesen: (text: string) => void | Promise<void> }) {
  const [status, setStatus] = useState<string>('ENTWURF');
  const [liste, setListe] = useState<EmailRecord[]>([]);
  const [offen, setOffen] = useState<EmailRecord | null>(null);
  const [betreff, setBetreff] = useState('');
  const [text, setText] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setListe(await window.jarvis.entwuerfe(status));
  }, [status]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const oeffnen = (email: EmailRecord) => {
    setOffen(email);
    setBetreff(email.subject);
    setText(email.bodyText);
    setMeldung(null);
  };

  const speichern = async () => {
    if (!offen) return;
    const neu = await window.jarvis.entwurfAendern(offen.id, { subject: betreff, bodyText: text });
    setMeldung(
      neu
        ? 'Gespeichert. Eine zuvor erteilte Freigabe ist damit hinfällig.'
        : 'Der Entwurf konnte nicht geändert werden.'
    );
    if (neu) setOffen(neu);
    await laden();
  };

  const freigabeAnfordern = async () => {
    if (!offen) return;
    const ergebnis = await window.jarvis.freigabeAnfordern(offen.id);
    setMeldung(ergebnis.meldung);
    await laden();
  };

  return (
    <div className="inhalt">
      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Entwürfe</h2>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={{ width: 'auto' }}
            aria-label="Status filtern"
          >
            {STATUS.map((wert) => (
              <option key={wert} value={wert}>
                {wert}
              </option>
            ))}
          </select>
        </div>

        {liste.length === 0 ? (
          <p className="leer">Keine Nachrichten mit diesem Status.</p>
        ) : (
          <div className="tabelle-huelle">
            <table className="tabelle">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Empfänger</th>
                <th>Betreff</th>
                <th>Geändert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liste.map((email, index) => (
                <tr key={email.id}>
                  <td>{index + 1}</td>
                  <td>{email.toAddresses.join(', ')}</td>
                  <td>{email.subject}</td>
                  <td>{new Date(email.updatedAt).toLocaleString('de-DE')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="etikett" onClick={() => oeffnen(email)}>
                        Öffnen
                      </button>
                      <button
                        className="etikett"
                        onClick={() => void onVorlesen(`${email.subject}. ${email.bodyText}`)}
                      >
                        Vorlesen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {offen && (
        <section className="abschnitt">
          <div className="abschnitt__kopf">
            <h2>Entwurf {offen.id}</h2>
            <span className="etikett">{offen.status}</span>
          </div>
          <p className="etikett" style={{ marginBottom: 10 }}>
            An: {offen.toAddresses.join(', ')}
          </p>
          <input
            value={betreff}
            onChange={(event) => setBetreff(event.target.value)}
            aria-label="Betreff"
            style={{ marginBottom: 10 }}
          />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Mailtext"
            style={{ minHeight: 280 }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="knopf" onClick={() => void speichern()}>
              Speichern
            </button>
            <button className="knopf" onClick={() => void onVorlesen(`${betreff}. ${text}`)}>
              Vorlesen
            </button>
            <button className="knopf knopf--stark" onClick={() => void freigabeAnfordern()}>
              Freigabe anfordern
            </button>
            <button className="knopf" onClick={() => setOffen(null)}>
              Schließen
            </button>
          </div>
          {meldung && <p className="meldung">{meldung}</p>}
        </section>
      )}
    </div>
  );
}
