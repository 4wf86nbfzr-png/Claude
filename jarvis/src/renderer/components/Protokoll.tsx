import { useEffect, useState } from 'react';
import type { AuditEntry } from '@shared/types';

const farbe = (status: string): string =>
  status === 'FEHLER' ? 'marke marke--rot' : status === 'ABGELEHNT' ? 'marke marke--gelb' : status === 'OK' ? 'marke marke--gruen' : 'marke marke--grau';

/** Das Protokoll (§18) – nachvollziehbar, was JARVIS wann getan hat. */
export function Protokoll() {
  const [eintraege, setEintraege] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void window.jarvis.protokoll(300).then(setEintraege);
  }, []);

  return (
    <div className="inhalt">
      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Protokoll</h2>
          <button className="etikett" onClick={() => void window.jarvis.protokoll(300).then(setEintraege)}>
            Aktualisieren
          </button>
        </div>
        {eintraege.length === 0 ? (
          <p className="leer">Noch nichts protokolliert.</p>
        ) : (
          <div className="protokoll">
            {eintraege.map((eintrag) => (
              <div key={eintrag.id} className="protokoll__zeile">
                <span className="protokoll__zeit">
                  {new Date(eintrag.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>
                  {eintrag.action}
                  {eintrag.target ? ` – ${eintrag.target}` : ''}
                  {eintrag.agent ? <span className="etikett"> {eintrag.agent}</span> : null}
                </span>
                <span className={farbe(eintrag.status)}>{eintrag.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
