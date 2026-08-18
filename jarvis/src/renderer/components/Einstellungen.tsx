import { useCallback, useEffect, useState } from 'react';
import type { SecretStateDto } from '@shared/ipc';
import type { MemoryItem, SuppressionEntry, SystemStatus } from '@shared/types';

const GRUPPEN: Record<string, string> = {
  llm: 'Sprachmodell',
  stt: 'Spracherkennung',
  tts: 'Sprachausgabe',
  suche: 'Websuche',
  mail: 'E-Mail',
  kalender: 'Kalender'
};

/**
 * Einstellungen: Zugangsdaten, Gedächtnis und Sperrliste.
 * Werte werden nie angezeigt – nur, ob und woher sie vorliegen.
 */
export function Einstellungen({ status, onStatus }: { status: SystemStatus | null; onStatus: () => Promise<void> }) {
  const [eintraege, setEintraege] = useState<SecretStateDto[]>([]);
  const [tresor, setTresor] = useState('');
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [gedaechtnis, setGedaechtnis] = useState<MemoryItem[]>([]);
  const [sperrliste, setSperrliste] = useState<SuppressionEntry[]>([]);
  const [neueSperre, setNeueSperre] = useState('');

  const laden = useCallback(async () => {
    const zugang = await window.jarvis.zugangsdaten();
    setEintraege(zugang.eintraege);
    setTresor(zugang.tresor);
    setGedaechtnis(await window.jarvis.gedaechtnis());
    setSperrliste(await window.jarvis.sperrliste());
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const speichern = async (name: string) => {
    const wert = werte[name]?.trim();
    if (!wert) return;
    const ergebnis = await window.jarvis.zugangsdatenSetzen(name, wert);
    setMeldung(ergebnis.meldung);
    setWerte((bisher) => ({ ...bisher, [name]: '' }));
    await laden();
    await onStatus();
  };

  const dienste = status
    ? [
        ...status.llm.map((p) => ({ ...p, bereich: 'Sprachmodell' })),
        ...status.stt.map((p) => ({ ...p, bereich: 'Spracherkennung' })),
        ...status.tts.map((p) => ({ ...p, bereich: 'Sprachausgabe' })),
        ...status.search.map((p) => ({ ...p, bereich: 'Websuche' })),
        ...status.mail.map((p) => ({ ...p, bereich: 'E-Mail' }))
      ]
    : [];

  return (
    <div className="inhalt">
      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Dienste</h2>
          {status?.dryRun && <span className="marke marke--gelb">Testbetrieb – es wird nichts versendet</span>}
        </div>
        <div className="karten">
          {dienste.map((dienst) => (
            <article key={`${dienst.bereich}-${dienst.id}`} className="karte">
              <p className="etikett">{dienst.bereich}</p>
              <h3>{dienst.label}</h3>
              <p>
                <span className={dienst.configured ? 'marke marke--gruen' : 'marke marke--rot'}>
                  {dienst.configured ? 'eingerichtet' : 'fehlt'}
                </span>
              </p>
              {!dienst.configured && <p style={{ marginTop: 8 }}>{dienst.hint}</p>}
            </article>
          ))}
        </div>
        {status && (
          <p className="meldung">
            Datenbank: {status.dbPath} · heute versendet: {status.sentToday} von {status.dailySendLimit}
          </p>
        )}
      </section>

      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Zugangsdaten</h2>
          <span className="etikett">Tresor: {tresor}</span>
        </div>
        <p className="hinweisband">
          Werte werden verschlüsselt abgelegt und nie angezeigt. Alternativ können alle Schlüssel als
          Umgebungsvariablen gesetzt werden – die haben Vorrang.
        </p>
        {Object.entries(GRUPPEN).map(([gruppe, titel]) => {
          const teil = eintraege.filter((eintrag) => eintrag.group === gruppe);
          if (teil.length === 0) return null;
          return (
            <div key={gruppe} style={{ marginBottom: 22 }}>
              <p className="etikett" style={{ marginBottom: 10 }}>
                {titel}
              </p>
              {teil.map((eintrag) => (
                <div key={eintrag.name} className="formzeile">
                  <label>
                    <span className="etikett">
                      {eintrag.label} · {eintrag.name} ·{' '}
                      <span
                        className={
                          eintrag.source === 'fehlt'
                            ? 'marke marke--rot'
                            : eintrag.source === 'umgebung'
                              ? 'marke marke--gelb'
                              : 'marke marke--gruen'
                        }
                      >
                        {eintrag.source}
                      </span>
                    </span>
                    <input
                      type="password"
                      value={werte[eintrag.name] ?? ''}
                      placeholder={eintrag.hint}
                      onChange={(event) =>
                        setWerte((bisher) => ({ ...bisher, [eintrag.name]: event.target.value }))
                      }
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="knopf" onClick={() => void speichern(eintrag.name)}>
                      Speichern
                    </button>
                    {eintrag.source === 'tresor' && (
                      <button
                        className="knopf knopf--gefahr"
                        onClick={async () => {
                          await window.jarvis.zugangsdatenEntfernen(eintrag.name);
                          await laden();
                        }}
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        <button
          className="knopf"
          onClick={async () => {
            setMeldung('Browserfenster für die Google-Anmeldung wird geöffnet …');
            const ergebnis = await window.jarvis.googleVerbinden();
            setMeldung(ergebnis.meldung);
            await laden();
          }}
        >
          Mit Google verbinden (Gmail und Kalender)
        </button>
        {meldung && <p className="meldung">{meldung}</p>}
      </section>

      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Gedächtnis</h2>
          <button
            className="etikett"
            onClick={async () => {
              await window.jarvis.verlaufLoeschen();
              setMeldung('Gesprächsverlauf gelöscht.');
            }}
          >
            Gesprächsverlauf löschen
          </button>
        </div>
        {gedaechtnis.length === 0 ? (
          <p className="leer">Es ist nichts gemerkt.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Bereich</th>
                <th>Schlüssel</th>
                <th>Inhalt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gedaechtnis.map((eintrag) => (
                <tr key={eintrag.id}>
                  <td>{eintrag.scope}</td>
                  <td>{eintrag.key}</td>
                  <td>{eintrag.value}</td>
                  <td>
                    <button
                      className="etikett"
                      onClick={async () => {
                        await window.jarvis.gedaechtnisLoeschen(eintrag.id);
                        await laden();
                      }}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Sperrliste</h2>
        </div>
        <p className="hinweisband">
          Adressen und Domains auf dieser Liste werden nie angeschrieben – auch nicht auf Anweisung.
        </p>
        <div className="formzeile">
          <input
            value={neueSperre}
            onChange={(event) => setNeueSperre(event.target.value)}
            placeholder="adresse@firma.de oder firma.de"
            aria-label="Neuer Sperreintrag"
          />
          <button
            className="knopf"
            onClick={async () => {
              if (!neueSperre.trim()) return;
              await window.jarvis.sperrlisteHinzu(
                neueSperre.trim(),
                neueSperre.includes('@') ? 'adresse' : 'domain',
                'Manuell eingetragen'
              );
              setNeueSperre('');
              await laden();
            }}
          >
            Sperren
          </button>
        </div>
        {sperrliste.length === 0 ? (
          <p className="leer">Die Sperrliste ist leer.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Wert</th>
                <th>Art</th>
                <th>Grund</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sperrliste.map((eintrag) => (
                <tr key={eintrag.id}>
                  <td>{eintrag.value}</td>
                  <td>{eintrag.patternType}</td>
                  <td>{eintrag.reason ?? '—'}</td>
                  <td>
                    <button
                      className="etikett"
                      onClick={async () => {
                        await window.jarvis.sperrlisteEntfernen(eintrag.id);
                        await laden();
                      }}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
