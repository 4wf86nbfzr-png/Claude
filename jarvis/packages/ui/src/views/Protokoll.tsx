import { useState } from 'react';
import { useDaten } from '../lib/store.js';

interface Eintrag {
  id: string;
  zeit: string;
  zeile: string;
  wer: string;
  was: string;
  gegenstand: string | null;
  ergebnis: 'ok' | 'fehler' | 'abgebrochen';
}

/**
 * Das Audit-Log.
 *
 * Jede Zeile ist ein deutscher Satz mit Uhrzeit -- damit man ohne Vorwissen
 * nachvollziehen kann, was JARVIS getan hat und auf wessen Anweisung.
 */
export function Protokoll(): JSX.Element {
  const [nurFehler, setNurFehler] = useState(false);
  const { daten: eintraege, laedt } = useDaten<Eintrag[]>({ kind: 'audit.list', limit: 300 }, []);

  const gefiltert = nurFehler ? eintraege.filter((e) => e.ergebnis === 'fehler') : eintraege;
  const nachTag = gruppieren(gefiltert);

  return (
    <>
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">Nachweis</p>
          <h1>Protokoll</h1>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={nurFehler} onChange={(e) => setNurFehler(e.target.checked)} />
          Nur Fehler
        </label>
      </div>

      {gefiltert.length === 0 ? (
        <div className="leer">
          <p>{laedt ? 'Wird geladen …' : nurFehler ? 'Keine Fehler protokolliert.' : 'Noch nichts protokolliert.'}</p>
        </div>
      ) : (
        [...nachTag.entries()].map(([tag, zeilen]) => (
          <div key={tag} className="abschnitt">
            <div className="abschnitt__kopf">
              <h2>{tag}</h2>
              <span className="leise" style={{ fontSize: '0.8rem' }}>{zeilen.length} Einträge</span>
            </div>
            <div className="protokoll">
              {zeilen.map((e) => (
                <div
                  key={e.id}
                  className={`protokoll__zeile${e.ergebnis === 'fehler' ? ' protokoll__zeile--fehler' : ''}`}
                  title={`${e.wer} · ${e.was}`}
                >
                  <span className="protokoll__zeit">
                    {new Date(e.zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span>{e.zeile.replace(/^\d{2}:\d{2}\s*/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function gruppieren(eintraege: Eintrag[]): Map<string, Eintrag[]> {
  const map = new Map<string, Eintrag[]>();
  for (const e of eintraege) {
    const tag = new Date(e.zeit).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const liste = map.get(tag);
    if (liste) liste.push(e);
    else map.set(tag, [e]);
  }
  return map;
}
