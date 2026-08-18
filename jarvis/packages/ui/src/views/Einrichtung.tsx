import { useEffect, useState } from 'react';
import { useDaten, useJarvis } from '../lib/store.js';

interface Status {
  sprachmodell: { anbieter: string; modell: string; bereit: boolean; hinweis: string | null };
  suche: { anbieter: string; hinweis: string | null };
  versand: { id: string; label: string; bereit: boolean; hinweis: string | null };
  posteingang: { anbieter: string; bereit: boolean; hinweis: string | null };
  spracheingabe: { provider: string; bereit: boolean; imFenster: boolean; hinweis: string | null };
  sprachausgabe: { provider: string; bereit: boolean; imFenster: boolean; hinweis: string | null };
  kalender: { bereit: boolean; anbieter: string };
  versandlimits: {
    maxPerHour: number;
    maxPerDay: number;
    minIntervalSeconds: number;
    requireVerifiedRecipient: boolean;
    reContactCooldownDays: number;
  };
  verzeichnisse: string[];
  datenverzeichnis: string;
  offeneFreigaben: number;
}

interface Geheimnis {
  schluessel: string;
  herkunft: 'umgebung' | 'schluesselbund' | 'datei' | null;
  gesetzt: boolean;
}

/** Zugangsdaten, die die Einrichtung anbietet -- mit Erklärung, wofür. */
const ZUGAENGE: Array<{ schluessel: string; titel: string; hilfe: string }> = [
  {
    schluessel: 'ANTHROPIC_API_KEY',
    titel: 'Anthropic (Sprachmodell)',
    hilfe: 'console.anthropic.com → API Keys. Ohne Sprachmodell versteht JARVIS keine Anweisungen.',
  },
  {
    schluessel: 'OPENAI_API_KEY',
    titel: 'OpenAI (Sprachmodell, Transkription, Sprachausgabe)',
    hilfe: 'platform.openai.com → API Keys. Nur nötig, wenn OpenAI als Anbieter eingestellt ist.',
  },
  {
    schluessel: 'TAVILY_API_KEY',
    titel: 'Tavily (Websuche)',
    hilfe: 'tavily.com. Ohne Suchschlüssel läuft die Recherche über DuckDuckGo — das findet deutlich weniger.',
  },
  { schluessel: 'BRAVE_API_KEY', titel: 'Brave Search', hilfe: 'brave.com/search/api — Alternative zu Tavily.' },
  { schluessel: 'SERPAPI_API_KEY', titel: 'SerpAPI (Google)', hilfe: 'serpapi.com — Alternative zu Tavily.' },
  { schluessel: 'SMTP_HOST', titel: 'SMTP-Server', hilfe: 'z. B. smtp.ihr-hoster.de' },
  { schluessel: 'SMTP_USER', titel: 'SMTP-Benutzer', hilfe: 'Meist die vollständige E-Mail-Adresse.' },
  { schluessel: 'SMTP_PASSWORD', titel: 'SMTP-Passwort', hilfe: 'Viele Hoster verlangen ein eigenes App-Passwort.' },
  { schluessel: 'IMAP_HOST', titel: 'IMAP-Server', hilfe: 'Für das Zuordnen eingehender Antworten.' },
  { schluessel: 'IMAP_PASSWORD', titel: 'IMAP-Passwort', hilfe: 'Leer lassen, wenn identisch mit SMTP.' },
  {
    schluessel: 'GOOGLE_CLIENT_ID',
    titel: 'Google OAuth-Client-ID',
    hilfe: 'Google Cloud Console → Anmeldedaten → OAuth-Client-ID vom Typ „Desktop".',
  },
  { schluessel: 'ELEVENLABS_API_KEY', titel: 'ElevenLabs (Sprachausgabe)', hilfe: 'Optional, für eine natürlichere Stimme.' },
];

/**
 * Einrichtung.
 *
 * Sie beantwortet vor allem eine Frage: was fehlt noch, damit JARVIS
 * arbeiten kann? Jeder Punkt sagt im Klartext, was zu tun ist.
 */
export function Einrichtung(): JSX.Element {
  const jarvis = useJarvis();
  const { daten: status } = useDaten<Status | null>({ kind: 'status' }, null);
  const { daten: geheimnisse, neu: geheimnisseNeu } = useDaten<Geheimnis[]>({ kind: 'secrets.list' }, []);
  const { daten: sperrliste, neu: sperrlisteNeu } = useDaten<
    Array<{ id: string; scope: string; value_norm: string; reason: string | null }>
  >({ kind: 'suppression.list' }, []);
  const { daten: gedaechtnis, neu: gedaechtnisNeu } = useDaten<
    Array<{ id: string; kind: string; key: string; value: string }>
  >({ kind: 'memory.list' }, []);

  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'gefahr'; text: string } | null>(null);
  const [pruefung, setPruefung] = useState<string | null>(null);
  const [neuerEintrag, setNeuerEintrag] = useState({ scope: 'email', value: '', reason: '' });

  useEffect(() => {
    if (!meldung) return;
    const timer = window.setTimeout(() => setMeldung(null), 8000);
    return () => window.clearTimeout(timer);
  }, [meldung]);

  const speichern = async (schluessel: string) => {
    const wert = (entwuerfe[schluessel] ?? '').trim();
    if (!wert) return;
    const r = await jarvis.senden({ kind: 'secrets.set', key: schluessel, value: wert });
    setMeldung(
      r.ok
        ? { art: 'ok', text: `${schluessel} gespeichert. Für den vollen Effekt bitte JARVIS neu starten.` }
        : { art: 'gefahr', text: r.error.message },
    );
    setEntwuerfe((alt) => ({ ...alt, [schluessel]: '' }));
    geheimnisseNeu();
  };

  const versandPruefen = async () => {
    setPruefung('Wird geprüft …');
    const r = await jarvis.senden({ kind: 'mail.verifyTransport' });
    setPruefung(r.ok ? `In Ordnung: ${(r.data as { info: string }).info}` : `Fehlgeschlagen: ${r.error.message}`);
  };

  const oauth = async (provider: 'google' | 'microsoft') => {
    setPruefung('Anmeldung läuft — bitte im Browser bestätigen …');
    const r = await jarvis.senden({ kind: 'oauth.start', provider });
    setPruefung(r.ok ? `Verbunden: ${(r.data as { info: string }).info}` : `Fehlgeschlagen: ${r.error.message}`);
    geheimnisseNeu();
  };

  return (
    <>
      <div className="buehne__kopf">
        <div>
          <p className="eyebrow">System</p>
          <h1>Einrichtung</h1>
        </div>
      </div>

      {meldung && <p className={`hinweis hinweis--${meldung.art === 'ok' ? 'ok' : 'gefahr'}`}>{meldung.text}</p>}

      {/* --- Was fehlt noch? -------------------------------------------- */}
      <div className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Bereitschaft</h2>
        </div>
        {!status ? (
          <p className="leise">Wird geladen …</p>
        ) : (
          <div className="zweispalt">
            <Punkt
              titel="Sprachmodell"
              wert={`${status.sprachmodell.anbieter} · ${status.sprachmodell.modell}`}
              bereit={status.sprachmodell.bereit}
              hinweis={status.sprachmodell.hinweis}
            />
            <Punkt
              titel="Websuche"
              wert={status.suche.anbieter}
              bereit={!status.suche.hinweis}
              hinweis={status.suche.hinweis}
            />
            <Punkt
              titel="Versandweg"
              wert={status.versand.label}
              bereit={status.versand.bereit}
              hinweis={status.versand.hinweis}
            />
            <Punkt
              titel="Posteingang"
              wert={status.posteingang.anbieter}
              bereit={status.posteingang.bereit}
              hinweis={status.posteingang.hinweis}
            />
            <Punkt
              titel="Spracheingabe"
              wert={status.spracheingabe.imFenster ? 'Im Fenster (Web Speech)' : status.spracheingabe.provider}
              bereit={status.spracheingabe.bereit}
              hinweis={status.spracheingabe.hinweis}
            />
            <Punkt
              titel="Sprachausgabe"
              wert={status.sprachausgabe.imFenster ? 'Im Fenster (System-Stimme)' : status.sprachausgabe.provider}
              bereit={status.sprachausgabe.bereit}
              hinweis={status.sprachausgabe.hinweis}
            />
          </div>
        )}

        <div className="knopfreihe" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="knopf" onClick={versandPruefen}>
            Versandweg prüfen
          </button>
          <button type="button" className="knopf" onClick={() => void oauth('google')}>
            Google-Konto verbinden
          </button>
          <button type="button" className="knopf" onClick={() => void oauth('microsoft')}>
            Microsoft-Konto verbinden
          </button>
        </div>
        {pruefung && <p className="hinweis" style={{ marginTop: '0.75rem' }}>{pruefung}</p>}
      </div>

      {/* --- Zugangsdaten ------------------------------------------------ */}
      <div className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Zugangsdaten</h2>
        </div>
        <p className="leise" style={{ maxWidth: 'var(--measure)', marginTop: 0 }}>
          Schlüssel werden im Schlüsselbund des Betriebssystems abgelegt, ersatzweise verschlüsselt im
          Datenverzeichnis. Sie stehen nie im Klartext in der Datenbank und tauchen nicht im Protokoll auf.
          Bereits über Umgebungsvariablen gesetzte Werte werden hier nur angezeigt, nicht überschrieben.
        </p>

        {ZUGAENGE.map((zugang) => {
          const vorhanden = geheimnisse.find((g) => g.schluessel === zugang.schluessel);
          return (
            <div className="feld" key={zugang.schluessel}>
              <label className="feld__label" htmlFor={`zugang-${zugang.schluessel}`}>
                {zugang.titel}
                {vorhanden?.gesetzt && (
                  <span className="merkmal merkmal--ok" style={{ marginLeft: '0.5rem' }}>
                    gesetzt ({vorhanden.herkunft})
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  id={`zugang-${zugang.schluessel}`}
                  type={/PASSWORD|KEY|SECRET/.test(zugang.schluessel) ? 'password' : 'text'}
                  placeholder={vorhanden?.gesetzt ? '•••••••• (überschreiben)' : zugang.schluessel}
                  value={entwuerfe[zugang.schluessel] ?? ''}
                  onChange={(e) => setEntwuerfe((alt) => ({ ...alt, [zugang.schluessel]: e.target.value }))}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="knopf"
                  onClick={() => void speichern(zugang.schluessel)}
                  disabled={!(entwuerfe[zugang.schluessel] ?? '').trim()}
                >
                  Speichern
                </button>
              </div>
              <p className="feld__hilfe">{zugang.hilfe}</p>
            </div>
          );
        })}
      </div>

      {/* --- Versandregeln ------------------------------------------------ */}
      {status && (
        <div className="abschnitt">
          <div className="abschnitt__kopf">
            <h2>Versandregeln</h2>
          </div>
          <div className="protokoll" style={{ fontSize: '0.85rem' }}>
            <div className="protokoll__zeile">
              <span className="protokoll__zeit">Stunde</span>
              <span>höchstens {status.versandlimits.maxPerHour} Mails</span>
            </div>
            <div className="protokoll__zeile">
              <span className="protokoll__zeit">Tag</span>
              <span>höchstens {status.versandlimits.maxPerDay} Mails</span>
            </div>
            <div className="protokoll__zeile">
              <span className="protokoll__zeit">Abstand</span>
              <span>mindestens {status.versandlimits.minIntervalSeconds} Sekunden zwischen zwei Sendungen</span>
            </div>
            <div className="protokoll__zeile">
              <span className="protokoll__zeit">Empfänger</span>
              <span>
                {status.versandlimits.requireVerifiedRecipient
                  ? 'nur verifizierte Adressen'
                  : 'auch nicht verifizierte Adressen (nicht empfohlen)'}
              </span>
            </div>
            <div className="protokoll__zeile">
              <span className="protokoll__zeit">Erstkontakt</span>
              <span>frühestens {status.versandlimits.reContactCooldownDays} Tage nach dem letzten</span>
            </div>
          </div>
          <p className="leise" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Änderbar über die Umgebungsvariablen JARVIS_MAX_SENDS_PER_HOUR, JARVIS_MAX_SENDS_PER_DAY,
            JARVIS_MIN_SEND_INTERVAL_SECONDS und JARVIS_REQUIRE_VERIFIED_RECIPIENT.
          </p>
        </div>
      )}

      {/* --- Sperrliste --------------------------------------------------- */}
      <div className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Sperrliste</h2>
          <span className="leise" style={{ fontSize: '0.8rem' }}>
            Wer hier steht, wird nie angeschrieben.
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <select
            value={neuerEintrag.scope}
            onChange={(e) => setNeuerEintrag({ ...neuerEintrag, scope: e.target.value })}
            aria-label="Art des Eintrags"
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', padding: '0.5rem' }}
          >
            <option value="email">E-Mail</option>
            <option value="domain">Domain</option>
            <option value="firma">Firma</option>
          </select>
          <input
            type="text"
            placeholder="Wert"
            value={neuerEintrag.value}
            onChange={(e) => setNeuerEintrag({ ...neuerEintrag, value: e.target.value })}
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', padding: '0.5rem', flex: '1 1 14rem' }}
          />
          <input
            type="text"
            placeholder="Grund (optional)"
            value={neuerEintrag.reason}
            onChange={(e) => setNeuerEintrag({ ...neuerEintrag, reason: e.target.value })}
            style={{ background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', padding: '0.5rem', flex: '1 1 14rem' }}
          />
          <button
            type="button"
            className="knopf"
            disabled={!neuerEintrag.value.trim()}
            onClick={async () => {
              await jarvis.senden({
                kind: 'suppression.add',
                scope: neuerEintrag.scope as 'email' | 'domain' | 'firma',
                value: neuerEintrag.value.trim(),
                ...(neuerEintrag.reason ? { reason: neuerEintrag.reason } : {}),
              });
              setNeuerEintrag({ scope: neuerEintrag.scope, value: '', reason: '' });
              sperrlisteNeu();
            }}
          >
            Sperren
          </button>
        </div>

        {sperrliste.length === 0 ? (
          <p className="leise">Die Sperrliste ist leer.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Art</th>
                <th>Wert</th>
                <th>Grund</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sperrliste.map((s) => (
                <tr key={s.id}>
                  <td className="leise">{s.scope}</td>
                  <td>{s.value_norm}</td>
                  <td className="leise">{s.reason ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="knopf knopf--klein"
                      onClick={async () => {
                        await jarvis.senden({ kind: 'suppression.remove', id: s.id });
                        sperrlisteNeu();
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
      </div>

      {/* --- Gedächtnis ---------------------------------------------------- */}
      <div className="abschnitt">
        <div className="abschnitt__kopf">
          <h2>Gedächtnis</h2>
          <span className="leise" style={{ fontSize: '0.8rem' }}>
            Nur das hier Aufgeführte merkt sich JARVIS dauerhaft.
          </span>
        </div>
        {gedaechtnis.length === 0 ? (
          <p className="leise">Nichts gespeichert.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Art</th>
                <th>Schlüssel</th>
                <th>Inhalt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gedaechtnis.map((m) => (
                <tr key={m.id}>
                  <td className="leise">{m.kind}</td>
                  <td>{m.key}</td>
                  <td style={{ maxWidth: '26rem' }}>{m.value}</td>
                  <td>
                    <button
                      type="button"
                      className="knopf knopf--klein"
                      onClick={async () => {
                        await jarvis.senden({ kind: 'memory.delete', id: m.id });
                        gedaechtnisNeu();
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
      </div>

      {/* --- Ablageorte ---------------------------------------------------- */}
      {status && (
        <div className="abschnitt">
          <div className="abschnitt__kopf">
            <h2>Daten und Zugriff</h2>
          </div>
          <div className="dialog__zeile">
            <span className="dialog__label">Datenverzeichnis</span>
            <span className="dialog__wert">{status.datenverzeichnis}</span>
          </div>
          <div className="dialog__zeile">
            <span className="dialog__label">Dateizugriff</span>
            <span className="dialog__wert">
              {status.verzeichnisse.map((v) => (
                <div key={v}>{v}</div>
              ))}
              <p className="leise" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                Außerhalb dieser Verzeichnisse liest und schreibt JARVIS nichts.
              </p>
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Punkt({
  titel,
  wert,
  bereit,
  hinweis,
}: {
  titel: string;
  wert: string;
  bereit: boolean;
  hinweis: string | null;
}): JSX.Element {
  return (
    <div>
      <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>{titel}</p>
      <p style={{ margin: '0 0 0.35rem' }}>
        {wert} <span className={bereit ? 'merkmal merkmal--ok' : 'merkmal merkmal--warn'}>{bereit ? 'bereit' : 'offen'}</span>
      </p>
      {hinweis && <p className="feld__hilfe">{hinweis}</p>}
    </div>
  );
}
