import { useState } from 'react';
import { useDaten, useJarvis } from '../lib/store.js';

interface LlmStatus {
  aktiv: { anbieter: string; modell: string; bereit: boolean; hinweis: string | null };
  durchUmgebungFestgelegt: boolean;
  lokal: {
    adresse: string;
    laeuft: boolean;
    installiert: boolean;
    hinweis: string | null;
    modelle: Array<{ name: string; groesseBytes: number; geaendertAm: string }>;
  };
  empfehlungen: Array<{ name: string; groesse: string; ram: string; eignung: string }>;
}

interface Pruefung {
  modell: string;
  ruftWerkzeugeAuf: boolean;
  argumenteKorrekt: boolean;
  dauerMs: number;
  stattdessen?: string;
  urteil: string;
}

const LEER: LlmStatus = {
  aktiv: { anbieter: '—', modell: '—', bereit: false, hinweis: null },
  durchUmgebungFestgelegt: false,
  lokal: { adresse: '', laeuft: false, installiert: false, hinweis: null, modelle: [] },
  empfehlungen: [],
};

/**
 * Sprachmodell wählen — Cloud oder lokal.
 *
 * Der wichtigste Knopf ist „Werkzeugtest": viele lokale Modelle behaupten,
 * Werkzeuge zu beherrschen, schreiben dann aber nur „Ich rufe jetzt X auf"
 * als Fließtext. Mit einem solchen Modell passiert in JARVIS gar nichts,
 * und der Benutzer sucht den Fehler bei sich. Deshalb wird es ausprobiert.
 */
export function Sprachmodell(): JSX.Element {
  const jarvis = useJarvis();
  const { daten: status, neu } = useDaten<LlmStatus>({ kind: 'llm.status' }, LEER);
  const [laeuftGerade, setLaeuftGerade] = useState<string | null>(null);
  const [pruefung, setPruefung] = useState<Pruefung | null>(null);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'gefahr'; text: string } | null>(null);

  // Der Downloadfortschritt kommt über den Ereignisbus im Store an.
  const fortschritt =
    laeuftGerade && jarvis.fortschritt?.task.includes(laeuftGerade)
      ? `${jarvis.fortschritt.note ?? 'lädt'} — ${jarvis.fortschritt.done} %`
      : null;

  const laden = async (modell: string) => {
    setLaeuftGerade(modell);
    setMeldung(null);
    const r = await jarvis.senden({ kind: 'llm.pull', model: modell });
    setLaeuftGerade(null);
    setMeldung(
      r.ok
        ? { art: 'ok', text: `${modell} geladen. Jetzt bitte den Werkzeugtest ausführen.` }
        : { art: 'gefahr', text: `${r.error.message}${r.error.hint ? ` — ${r.error.hint}` : ''}` },
    );
    neu();
  };

  const testen = async (modell: string) => {
    setLaeuftGerade(modell);
    setPruefung(null);
    setMeldung(null);
    const r = await jarvis.senden({ kind: 'llm.test', model: modell });
    setLaeuftGerade(null);
    if (r.ok) setPruefung(r.data as Pruefung);
    else setMeldung({ art: 'gefahr', text: r.error.message });
  };

  const uebernehmen = async (anbieter: 'anthropic' | 'openai' | 'ollama', modell?: string) => {
    const r = await jarvis.senden({
      kind: 'llm.use',
      provider: anbieter,
      ...(modell ? { model: modell } : {}),
    });
    setMeldung(
      r.ok
        ? { art: 'ok', text: (r.data as { hinweis: string }).hinweis }
        : { art: 'gefahr', text: r.error.message },
    );
    neu();
  };

  return (
    <div className="abschnitt">
      <div className="abschnitt__kopf">
        <h2>Sprachmodell</h2>
        <span className="leise" style={{ fontSize: '0.8rem' }}>
          {status.aktiv.anbieter} · {status.aktiv.modell}{' '}
          <span className={status.aktiv.bereit ? 'merkmal merkmal--ok' : 'merkmal merkmal--warn'}>
            {status.aktiv.bereit ? 'bereit' : 'offen'}
          </span>
        </span>
      </div>

      {status.aktiv.hinweis && <p className="hinweis hinweis--warn">{status.aktiv.hinweis}</p>}
      {status.durchUmgebungFestgelegt && (
        <p className="hinweis hinweis--warn">
          <code>JARVIS_LLM_PROVIDER</code> ist in der Umgebung gesetzt und hat Vorrang. Eine Umstellung
          hier bleibt wirkungslos, solange die Variable steht.
        </p>
      )}
      {meldung && <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'gefahr'}`}>{meldung.text}</p>}

      {/* --- Cloud --------------------------------------------------------- */}
      <div className="zweispalt" style={{ marginTop: '1.25rem' }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>
            In der Cloud
          </p>
          <p className="feld__hilfe" style={{ marginTop: 0 }}>
            Schneller und genauer, kostet aber pro Anfrage und schickt den Text an den Anbieter.
          </p>
          <div className="knopfreihe" style={{ marginTop: '0.6rem' }}>
            <button type="button" className="knopf" onClick={() => void uebernehmen('anthropic')}>
              Anthropic verwenden
            </button>
            <button type="button" className="knopf" onClick={() => void uebernehmen('openai')}>
              OpenAI verwenden
            </button>
          </div>
        </div>

        <div>
          <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>
            Auf diesem Rechner
          </p>
          <p className="feld__hilfe" style={{ marginTop: 0 }}>
            Kostet nichts und kein Text verlässt das Gerät. Braucht Arbeitsspeicher und ist langsamer.
          </p>
          <p style={{ margin: '0.6rem 0 0' }}>
            Ollama{' '}
            <span className={status.lokal.laeuft ? 'merkmal merkmal--ok' : 'merkmal merkmal--warn'}>
              {status.lokal.laeuft ? 'läuft' : status.lokal.installiert ? 'installiert, läuft nicht' : 'nicht installiert'}
            </span>
          </p>
          {status.lokal.hinweis && (
            <pre
              className="dialog__block"
              style={{ marginTop: '0.6rem', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}
            >
              {status.lokal.hinweis}
            </pre>
          )}
        </div>
      </div>

      {/* --- Lokale Modelle ------------------------------------------------- */}
      {status.lokal.laeuft && (
        <>
          {status.lokal.modelle.length > 0 && (
            <>
              <h3 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Geladene Modelle</h3>
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Modell</th>
                    <th>Größe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {status.lokal.modelle.map((m) => (
                    <tr key={m.name}>
                      <td>{m.name}</td>
                      <td className="leise" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {(m.groesseBytes / 1_000_000_000).toFixed(1)} GB
                      </td>
                      <td>
                        <div className="knopfreihe">
                          <button
                            type="button"
                            className="knopf knopf--klein"
                            disabled={laeuftGerade !== null}
                            onClick={() => void testen(m.name)}
                          >
                            {laeuftGerade === m.name ? 'prüft …' : 'Werkzeugtest'}
                          </button>
                          <button
                            type="button"
                            className="knopf knopf--klein"
                            onClick={() => void uebernehmen('ollama', m.name)}
                          >
                            Verwenden
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3 style={{ marginTop: '1.5rem', marginBottom: '0.6rem' }}>Empfohlen</h3>
          <p className="feld__hilfe" style={{ marginTop: 0 }}>
            Alle beherrschen Werkzeugaufrufe — das ist die Voraussetzung dafür, dass JARVIS etwas tut,
            statt nur darüber zu reden.
          </p>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Modell</th>
                <th>Download</th>
                <th>RAM</th>
                <th>Eignung</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {status.empfehlungen.map((e) => {
                const schonDa = status.lokal.modelle.some((m) => m.name === e.name);
                return (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td className="leise">{e.groesse}</td>
                    <td className="leise">{e.ram}</td>
                    <td style={{ maxWidth: '24rem' }} className="leise">
                      {e.eignung}
                    </td>
                    <td>
                      {schonDa ? (
                        <span className="merkmal merkmal--ok">geladen</span>
                      ) : (
                        <button
                          type="button"
                          className="knopf knopf--klein"
                          disabled={laeuftGerade !== null}
                          onClick={() => void laden(e.name)}
                        >
                          {laeuftGerade === e.name ? 'lädt …' : 'Laden'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {fortschritt && <p className="hinweis">{fortschritt}</p>}
        </>
      )}

      {/* --- Ergebnis des Werkzeugtests -------------------------------------- */}
      {pruefung && (
        <div
          className={`hinweis hinweis--${pruefung.ruftWerkzeugeAuf && pruefung.argumenteKorrekt ? 'ok' : pruefung.ruftWerkzeugeAuf ? 'warn' : 'gefahr'}`}
          style={{ marginTop: '1.25rem' }}
        >
          <p style={{ margin: 0, fontWeight: 500 }}>{pruefung.modell}</p>
          <p style={{ margin: '0.35rem 0 0' }}>{pruefung.urteil}</p>
          <p className="leise" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
            Werkzeugaufruf {pruefung.ruftWerkzeugeAuf ? '✓' : '✗'} · Argumente{' '}
            {pruefung.argumenteKorrekt ? '✓' : '✗'} · {(pruefung.dauerMs / 1000).toFixed(1)} s
          </p>
          {pruefung.stattdessen && (
            <p className="leise" style={{ margin: '0.35rem 0 0', fontSize: '0.82rem' }}>
              Antwortete stattdessen: „{pruefung.stattdessen}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Freigegebene Verzeichnisse.
 *
 * Das ist die Grenze, innerhalb derer JARVIS überhaupt Dateien sehen darf.
 * Sie hier zu ändern ist bewusst eine Handlung des Benutzers — kein Agent
 * kann sich seinen eigenen Zugriff erweitern.
 */
export function Verzeichnisse(): JSX.Element {
  const jarvis = useJarvis();
  const { daten, neu } = useDaten<{ pfade: string[] }>({ kind: 'system.roots' }, { pfade: [] });
  const { daten: apps } = useDaten<{ programme: string[] }>({ kind: 'system.knownApps' }, { programme: [] });
  const [neuerPfad, setNeuerPfad] = useState('');
  const [meldung, setMeldung] = useState<string | null>(null);

  const setzen = async (pfade: string[]) => {
    const r = await jarvis.senden({ kind: 'system.setRoots', pfade });
    setMeldung(r.ok ? 'Gespeichert.' : r.error.message);
    neu();
  };

  return (
    <div className="abschnitt">
      <div className="abschnitt__kopf">
        <h2>Zugriff auf den Rechner</h2>
      </div>
      <p className="leise" style={{ maxWidth: 'var(--measure)', marginTop: 0 }}>
        JARVIS liest und schreibt ausschließlich innerhalb dieser Verzeichnisse. Alles darüber
        hinaus wird abgelehnt — auch wenn er ausdrücklich danach gefragt wird.
      </p>

      <table className="tabelle" style={{ marginTop: '0.75rem' }}>
        <thead>
          <tr>
            <th>Verzeichnis</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {daten.pfade.length === 0 ? (
            <tr>
              <td colSpan={2} className="leise">
                Kein Verzeichnis freigegeben — Dateizugriff ist damit vollständig gesperrt.
              </td>
            </tr>
          ) : (
            daten.pfade.map((p) => (
              <tr key={p}>
                <td>{p}</td>
                <td>
                  <button
                    type="button"
                    className="knopf knopf--klein"
                    onClick={() => void setzen(daten.pfade.filter((x) => x !== p))}
                  >
                    Entfernen
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          type="text"
          placeholder="/Users/ich/Projekte"
          value={neuerPfad}
          onChange={(e) => setNeuerPfad(e.target.value)}
          aria-label="Verzeichnis freigeben"
          style={{
            flex: 1,
            background: 'var(--ink-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-s)',
            padding: '0.5rem 0.75rem',
          }}
        />
        <button
          type="button"
          className="knopf"
          disabled={!neuerPfad.trim()}
          onClick={() => {
            void setzen([...daten.pfade, neuerPfad.trim()]);
            setNeuerPfad('');
          }}
        >
          Freigeben
        </button>
      </div>
      {meldung && <p className="hinweis" style={{ marginTop: '0.75rem' }}>{meldung}</p>}

      <h3 style={{ marginTop: '1.75rem', marginBottom: '0.5rem' }}>Programme, die ohne Umweg verstanden werden</h3>
      <p className="leise" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        „Öffne den Browser" oder „mach Excel auf" genügt. Andere Programme lassen sich mit ihrem
        installierten Namen starten — die Liste ist eine Abkürzung, keine Grenze.
      </p>
      <div className="bereit" style={{ marginTop: '0.75rem' }}>
        {apps.programme.map((p) => (
          <span key={p} className="bereit__punkt">
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}
