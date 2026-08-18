import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, CredentialKey, CredentialStatus, JarvisError } from '../../shared/types.js';

interface Props {
  onError(error: JarvisError): void;
}

const CREDENTIAL_LABELS: Record<CredentialKey, { label: string; hint: string }> = {
  'anthropic.apiKey': {
    label: 'Anthropic API Key',
    hint: 'console.anthropic.com → API Keys. Wird für das Sprachmodell benötigt.',
  },
  'openai.apiKey': {
    label: 'OpenAI API Key',
    hint: 'Nur nötig für Whisper-Spracherkennung, OpenAI-Sprachausgabe oder das OpenAI-Modell.',
  },
  'elevenlabs.apiKey': { label: 'ElevenLabs API Key', hint: 'Optional, für natürlichere Sprachausgabe.' },
  'brave.apiKey': { label: 'Brave Search API Key', hint: 'Optional. Bessere Recherchetreffer als DuckDuckGo.' },
  'tavily.apiKey': { label: 'Tavily API Key', hint: 'Alternative Suchquelle.' },
  'serpapi.apiKey': { label: 'SerpAPI Key', hint: 'Alternative Suchquelle (Google-Ergebnisse).' },
  'smtp.password': { label: 'SMTP-Passwort', hint: 'Bei den meisten Anbietern ein App-Passwort.' },
  'imap.password': { label: 'IMAP-Passwort', hint: 'Für das Zuordnen von Antworten.' },
  'gmail.clientSecret': { label: 'Gmail Client Secret', hint: 'Aus der Google Cloud Console (OAuth-Client).' },
  'gmail.refreshToken': {
    label: 'Gmail Refresh Token',
    hint: 'Einmalig erzeugen mit: node scripts/gmail-auth.mjs',
  },
};

export function SettingsView({ onError }: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [credentials, setCredentials] = useState<CredentialStatus[]>([]);
  const [secrets, setSecrets] = useState<Partial<Record<CredentialKey, string>>>({});
  const [testResults, setTestResults] = useState<Partial<Record<CredentialKey, string>>>({});
  const [version, setVersion] = useState<{ app: string; electron: string; node: string; dataDir: string } | null>(
    null,
  );
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [current, status, info] = await Promise.all([
      window.jarvis.settings.get(),
      window.jarvis.credentials.status(),
      window.jarvis.system.version(),
    ]);
    setSettings(current);
    setCredentials(status);
    setVersion(info);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return <div className="view">Lädt …</div>;

  const patch = (change: Partial<AppSettings>): void => {
    setSettings({ ...settings, ...change } as AppSettings);
  };

  const save = async (): Promise<void> => {
    const result = await window.jarvis.settings.update(settings);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setSettings(result.value);
    setSavedAt(new Date().toLocaleTimeString('de-DE'));
  };

  const storeSecret = async (key: CredentialKey): Promise<void> => {
    const value = secrets[key] ?? '';
    const result = value
      ? await window.jarvis.credentials.set(key, value)
      : await window.jarvis.credentials.clear(key);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setSecrets({ ...secrets, [key]: '' });
    setCredentials(await window.jarvis.credentials.status());
  };

  const testSecret = async (key: CredentialKey): Promise<void> => {
    setTestResults({ ...testResults, [key]: 'Wird geprüft …' });
    const result = await window.jarvis.credentials.test(key);
    setTestResults({
      ...testResults,
      [key]: result.ok ? `✓ ${result.value}` : `✕ ${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ''}`,
    });
  };

  const checklist = buildChecklist(settings, credentials);

  return (
    <div className="view">
      <h1>Einrichtung</h1>

      <h2>Was noch fehlt</h2>
      <div className="stack" style={{ marginBottom: 8 }}>
        {checklist.map((item) => (
          <div key={item.label} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span className={`tag ${item.done ? 'tag--ok' : 'tag--warn'}`}>{item.done ? 'ok' : 'offen'}</span>
            <div>
              <div>{item.label}</div>
              {!item.done ? <div className="muted" style={{ fontSize: 13 }}>{item.hint}</div> : null}
            </div>
          </div>
        ))}
      </div>

      <hr className="divider" />

      <h2>Ihr Unternehmen</h2>
      <p>Diese Angaben fließen in jede Akquise-Mail ein.</p>
      <div className="grid-2">
        <Field label="Firmenname">
          <input
            className="input"
            value={settings.company.name}
            onChange={(event) => patch({ company: { ...settings.company, name: event.target.value } })}
          />
        </Field>
        <Field label="Website">
          <input
            className="input"
            value={settings.company.website}
            onChange={(event) => patch({ company: { ...settings.company, website: event.target.value } })}
          />
        </Field>
        <Field label="Telefon">
          <input
            className="input"
            value={settings.company.phone}
            onChange={(event) => patch({ company: { ...settings.company, phone: event.target.value } })}
          />
        </Field>
        <Field label="Anschrift">
          <input
            className="input"
            value={settings.company.address}
            onChange={(event) => patch({ company: { ...settings.company, address: event.target.value } })}
          />
        </Field>
      </div>
      <Field label="Leistungen">
        <textarea
          className="textarea"
          style={{ minHeight: 70 }}
          value={settings.company.services}
          onChange={(event) => patch({ company: { ...settings.company, services: event.target.value } })}
        />
      </Field>
      <Field label="Positionierung / Kurzprofil">
        <textarea
          className="textarea"
          style={{ minHeight: 70 }}
          value={settings.company.pitch}
          onChange={(event) => patch({ company: { ...settings.company, pitch: event.target.value } })}
        />
      </Field>

      <hr className="divider" />

      <h2>Sprachmodell</h2>
      <div className="grid-2">
        <Field label="Anbieter">
          <select
            className="select"
            value={settings.llm.provider}
            onChange={(event) =>
              patch({ llm: { ...settings.llm, provider: event.target.value as AppSettings['llm']['provider'] } })
            }
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI-kompatibel</option>
            <option value="ollama">Ollama (lokal)</option>
          </select>
        </Field>
        <Field label="Modell">
          <input
            className="input"
            value={settings.llm.model}
            onChange={(event) => patch({ llm: { ...settings.llm, model: event.target.value } })}
          />
        </Field>
        <Field label="Aufwand">
          <select
            className="select"
            value={settings.llm.effort}
            onChange={(event) =>
              patch({ llm: { ...settings.llm, effort: event.target.value as AppSettings['llm']['effort'] } })
            }
          >
            {['low', 'medium', 'high', 'xhigh', 'max'].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Basis-URL (optional)">
          <input
            className="input"
            value={settings.llm.baseUrl ?? ''}
            placeholder="z. B. http://127.0.0.1:11434/v1"
            onChange={(event) => patch({ llm: { ...settings.llm, baseUrl: event.target.value || undefined } })}
          />
        </Field>
      </div>

      <hr className="divider" />

      <h2>Postfach</h2>
      <div className="grid-2">
        <Field label="Versandweg">
          <select
            className="select"
            value={settings.mail.transport}
            onChange={(event) =>
              patch({
                mail: { ...settings.mail, transport: event.target.value as AppSettings['mail']['transport'] },
              })
            }
          >
            <option value="none">— nicht eingerichtet —</option>
            <option value="smtp">SMTP</option>
            <option value="gmail">Gmail (OAuth)</option>
            <option value="graph">Microsoft Graph (in Version 1 nicht aktiv)</option>
          </select>
        </Field>
        <Field label="Absendername">
          <input
            className="input"
            value={settings.mail.identity.name}
            onChange={(event) =>
              patch({ mail: { ...settings.mail, identity: { ...settings.mail.identity, name: event.target.value } } })
            }
          />
        </Field>
        <Field label="Absenderadresse">
          <input
            className="input"
            value={settings.mail.identity.email}
            onChange={(event) =>
              patch({
                mail: { ...settings.mail, identity: { ...settings.mail.identity, email: event.target.value } },
              })
            }
          />
        </Field>
        <Field label="Antwort an (optional)">
          <input
            className="input"
            value={settings.mail.identity.replyTo ?? ''}
            onChange={(event) =>
              patch({
                mail: {
                  ...settings.mail,
                  identity: { ...settings.mail.identity, replyTo: event.target.value || undefined },
                },
              })
            }
          />
        </Field>
      </div>
      <Field label="Signatur">
        <textarea
          className="textarea"
          style={{ minHeight: 80 }}
          value={settings.mail.identity.signature ?? ''}
          onChange={(event) =>
            patch({
              mail: {
                ...settings.mail,
                identity: { ...settings.mail.identity, signature: event.target.value },
              },
            })
          }
        />
      </Field>

      {settings.mail.transport === 'smtp' ? (
        <div className="grid-2">
          <Field label="SMTP-Host">
            <input
              className="input"
              value={settings.mail.smtp?.host ?? ''}
              onChange={(event) =>
                patch({
                  mail: {
                    ...settings.mail,
                    smtp: { ...defaultSmtp(settings), host: event.target.value },
                  },
                })
              }
            />
          </Field>
          <Field label="Port">
            <input
              className="input"
              type="number"
              value={settings.mail.smtp?.port ?? 587}
              onChange={(event) =>
                patch({
                  mail: {
                    ...settings.mail,
                    smtp: {
                      ...defaultSmtp(settings),
                      port: Number.parseInt(event.target.value, 10) || 587,
                      secure: (Number.parseInt(event.target.value, 10) || 587) === 465,
                    },
                  },
                })
              }
            />
          </Field>
          <Field label="Benutzer">
            <input
              className="input"
              value={settings.mail.smtp?.user ?? ''}
              onChange={(event) =>
                patch({
                  mail: { ...settings.mail, smtp: { ...defaultSmtp(settings), user: event.target.value } },
                })
              }
            />
          </Field>
        </div>
      ) : null}

      {settings.mail.transport === 'gmail' ? (
        <Field
          label="Gmail Client-ID"
          hint={'Aus der Google Cloud Console, OAuth-Client vom Typ „Desktop".'}
        >
          <input
            className="input"
            value={settings.mail.gmail?.clientId ?? ''}
            onChange={(event) =>
              patch({
                mail: {
                  ...settings.mail,
                  gmail: {
                    clientId: event.target.value,
                    redirectUri: settings.mail.gmail?.redirectUri ?? 'http://127.0.0.1:8765/oauth',
                  },
                },
              })
            }
          />
        </Field>
      ) : null}

      <h2>Posteingang (IMAP, optional)</h2>
      <div className="grid-2">
        <Field label="IMAP-Host">
          <input
            className="input"
            value={settings.mail.imap?.host ?? ''}
            onChange={(event) =>
              patch({ mail: { ...settings.mail, imap: { ...defaultImap(settings), host: event.target.value } } })
            }
          />
        </Field>
        <Field label="Benutzer">
          <input
            className="input"
            value={settings.mail.imap?.user ?? ''}
            onChange={(event) =>
              patch({ mail: { ...settings.mail, imap: { ...defaultImap(settings), user: event.target.value } } })
            }
          />
        </Field>
      </div>

      <hr className="divider" />

      <h2>Recherche</h2>
      <div className="grid-2">
        <Field label="Suchanbieter">
          <select
            className="select"
            value={settings.research.searchProvider}
            onChange={(event) =>
              patch({
                research: {
                  ...settings.research,
                  searchProvider: event.target.value as AppSettings['research']['searchProvider'],
                },
              })
            }
          >
            <option value="duckduckgo">DuckDuckGo (ohne Schlüssel)</option>
            <option value="brave">Brave Search</option>
            <option value="tavily">Tavily</option>
            <option value="serpapi">SerpAPI</option>
          </select>
        </Field>
        <Field label="Seiten je Unternehmen">
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            value={settings.research.maxPagesPerCompany}
            onChange={(event) =>
              patch({
                research: {
                  ...settings.research,
                  maxPagesPerCompany: Number.parseInt(event.target.value, 10) || 6,
                },
              })
            }
          />
        </Field>
        <Field label="Pause zwischen Abrufen (ms)">
          <input
            className="input"
            type="number"
            min={0}
            max={20000}
            value={settings.research.crawlDelayMs}
            onChange={(event) =>
              patch({
                research: { ...settings.research, crawlDelayMs: Number.parseInt(event.target.value, 10) || 1500 },
              })
            }
          />
        </Field>
        <Field label="robots.txt beachten">
          <select
            className="select"
            value={settings.research.respectRobotsTxt ? 'ja' : 'nein'}
            onChange={(event) =>
              patch({ research: { ...settings.research, respectRobotsTxt: event.target.value === 'ja' } })
            }
          >
            <option value="ja">ja</option>
            <option value="nein">nein</option>
          </select>
        </Field>
      </div>

      <hr className="divider" />

      <h2>Versandregeln</h2>
      <div className="grid-2">
        <Field label="Nur verifizierte Adressen" hint="Empfohlen. Verhindert Versand an unbelegte Adressen.">
          <select
            className="select"
            value={settings.compliance.requireVerifiedAddress ? 'ja' : 'nein'}
            onChange={(event) =>
              patch({
                compliance: { ...settings.compliance, requireVerifiedAddress: event.target.value === 'ja' },
              })
            }
          >
            <option value="ja">ja</option>
            <option value="nein">nein</option>
          </select>
        </Field>
        <Field label="Tageslimit">
          <input
            className="input"
            type="number"
            min={1}
            max={500}
            value={settings.compliance.dailySendLimit}
            onChange={(event) =>
              patch({
                compliance: {
                  ...settings.compliance,
                  dailySendLimit: Number.parseInt(event.target.value, 10) || 40,
                },
              })
            }
          />
        </Field>
        <Field label="Mindestabstand (Sekunden)">
          <input
            className="input"
            type="number"
            min={0}
            max={3600}
            value={settings.compliance.minSecondsBetweenSends}
            onChange={(event) =>
              patch({
                compliance: {
                  ...settings.compliance,
                  minSecondsBetweenSends: Number.parseInt(event.target.value, 10) || 30,
                },
              })
            }
          />
        </Field>
        <Field label="Sperrfrist für Erstkontakt (Tage)">
          <input
            className="input"
            type="number"
            min={0}
            max={3650}
            value={settings.compliance.reContactBlockDays}
            onChange={(event) =>
              patch({
                compliance: {
                  ...settings.compliance,
                  reContactBlockDays: Number.parseInt(event.target.value, 10) || 90,
                },
              })
            }
          />
        </Field>
      </div>

      <hr className="divider" />

      <h2>Sprache</h2>
      <div className="grid-2">
        <Field label="Spracheingabe">
          <select
            className="select"
            value={settings.voice.sttProvider}
            onChange={(event) =>
              patch({
                voice: { ...settings.voice, sttProvider: event.target.value as AppSettings['voice']['sttProvider'] },
              })
            }
          >
            <option value="webspeech">Systemeigene Erkennung</option>
            <option value="openai">OpenAI Whisper</option>
            <option value="off">aus</option>
          </select>
        </Field>
        <Field label="Sprachausgabe">
          <select
            className="select"
            value={settings.voice.ttsProvider}
            onChange={(event) =>
              patch({
                voice: { ...settings.voice, ttsProvider: event.target.value as AppSettings['voice']['ttsProvider'] },
              })
            }
          >
            <option value="webspeech">Systemeigene Stimme</option>
            <option value="openai">OpenAI</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="off">aus</option>
          </select>
        </Field>
        <Field label="Sprache">
          <input
            className="input"
            value={settings.voice.language}
            onChange={(event) => patch({ voice: { ...settings.voice, language: event.target.value } })}
          />
        </Field>
        <Field label="Weckwort" hint="Leer lassen, um ohne Weckwort zu arbeiten.">
          <input
            className="input"
            value={settings.voice.wakeWord}
            onChange={(event) => patch({ voice: { ...settings.voice, wakeWord: event.target.value } })}
          />
        </Field>
      </div>

      <hr className="divider" />

      <h2>Integrationen</h2>
      <Field label="Kalender (ICS-Adressen oder Dateipfade, eine pro Zeile)">
        <textarea
          className="textarea"
          style={{ minHeight: 70 }}
          value={settings.integrations.calendarIcsSources.join('\n')}
          onChange={(event) =>
            patch({
              integrations: {
                ...settings.integrations,
                calendarIcsSources: splitLines(event.target.value),
              },
            })
          }
        />
      </Field>
      <Field
        label="Freigegebene Ordner (eine pro Zeile)"
        hint="Nur in diesen Ordnern darf JARVIS Dateien lesen und schreiben."
      >
        <textarea
          className="textarea"
          style={{ minHeight: 70 }}
          value={settings.integrations.fileRoots.join('\n')}
          onChange={(event) =>
            patch({
              integrations: { ...settings.integrations, fileRoots: splitLines(event.target.value) },
            })
          }
        />
      </Field>

      <div className="row" style={{ margin: '18px 0 8px' }}>
        <button type="button" className="btn btn--primary btn--small" onClick={() => void save()}>
          Einstellungen speichern
        </button>
        {!settings.setupCompleted ? (
          <button
            type="button"
            className="btn btn--small"
            onClick={async () => {
              patch({ setupCompleted: true });
              const result = await window.jarvis.settings.update({ ...settings, setupCompleted: true });
              if (!result.ok) onError(result.error);
              else setSettings(result.value);
            }}
          >
            Einrichtung abschließen
          </button>
        ) : null}
        {savedAt ? <span className="muted mono">gespeichert {savedAt}</span> : null}
      </div>

      <hr className="divider" />

      <h2>Zugänge</h2>
      <p>
        Geheimnisse werden verschlüsselt gespeichert und nie im Protokoll oder in Prompts sichtbar. Alternativ
        können sie als Umgebungsvariablen gesetzt werden — siehe <span className="mono">.env.example</span>.
      </p>

      <div className="stack">
        {credentials.map((entry) => {
          const meta = CREDENTIAL_LABELS[entry.key];
          return (
            <div key={entry.key} className="field" style={{ marginBottom: 4 }}>
              <span className="field__label">
                {meta.label}{' '}
                {entry.present ? (
                  <span className={`tag ${entry.origin === 'env' ? '' : 'tag--ok'}`}>
                    {entry.origin === 'env' ? 'aus Umgebung' : `hinterlegt ····${entry.hint ?? ''}`}
                  </span>
                ) : (
                  <span className="tag tag--warn">fehlt</span>
                )}
              </span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  placeholder={entry.present ? 'Neuen Wert eintragen, um zu ersetzen' : 'Wert eintragen'}
                  value={secrets[entry.key] ?? ''}
                  onChange={(event) => setSecrets({ ...secrets, [entry.key]: event.target.value })}
                />
                <button type="button" className="btn btn--small" onClick={() => void storeSecret(entry.key)}>
                  Speichern
                </button>
                <button type="button" className="btn btn--small" onClick={() => void testSecret(entry.key)}>
                  Testen
                </button>
                {entry.present && entry.origin === 'store' ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={async () => {
                      const result = await window.jarvis.credentials.clear(entry.key);
                      if (!result.ok) onError(result.error);
                      else setCredentials(await window.jarvis.credentials.status());
                    }}
                  >
                    Entfernen
                  </button>
                ) : null}
              </div>
              <span className="field__hint">{meta.hint}</span>
              {testResults[entry.key] ? (
                <span className="field__hint mono">{testResults[entry.key]}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {version ? (
        <p className="mono muted" style={{ marginTop: 28 }}>
          JARVIS {version.app} · Electron {version.electron} · Node {version.node}
          <br />
          Daten: {version.dataDir}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

function defaultSmtp(settings: AppSettings): NonNullable<AppSettings['mail']['smtp']> {
  return settings.mail.smtp ?? { host: '', port: 587, secure: false, user: '' };
}

function defaultImap(settings: AppSettings): NonNullable<AppSettings['mail']['imap']> {
  return settings.mail.imap ?? { host: '', port: 993, secure: true, user: '', mailbox: 'INBOX' };
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildChecklist(
  settings: AppSettings,
  credentials: CredentialStatus[],
): Array<{ label: string; done: boolean; hint: string }> {
  const present = new Set(credentials.filter((entry) => entry.present).map((entry) => entry.key));
  const modelKeyPresent =
    settings.llm.provider === 'ollama' ||
    present.has(settings.llm.provider === 'anthropic' ? 'anthropic.apiKey' : 'openai.apiKey');

  return [
    {
      label: 'Sprachmodell erreichbar',
      done: modelKeyPresent,
      hint: 'Ohne Modellzugang kann JARVIS weder recherchieren noch formulieren.',
    },
    {
      label: 'Eigenes Unternehmen beschrieben',
      done: Boolean(settings.company.name && settings.company.services),
      hint: 'Firmenname und Leistungen werden für jede Akquise-Mail gebraucht.',
    },
    {
      label: 'Absender eingerichtet',
      done: Boolean(settings.mail.identity.email && settings.mail.transport !== 'none'),
      hint: 'Versandweg und Absenderadresse festlegen.',
    },
    {
      label: 'Postausgang getestet',
      done:
        settings.mail.transport === 'smtp'
          ? present.has('smtp.password')
          : settings.mail.transport === 'gmail'
            ? present.has('gmail.clientSecret') && present.has('gmail.refreshToken')
            : false,
      hint: 'Zugangsdaten hinterlegen und mit „Testen" prüfen.',
    },
    {
      label: 'Suchanbieter gewählt',
      done: true,
      hint: '',
    },
    {
      label: 'Posteingang für Antworten (optional)',
      done: Boolean(settings.mail.imap?.host && present.has('imap.password')),
      hint: 'Ohne IMAP können eingehende Antworten nicht automatisch zugeordnet werden.',
    },
  ];
}
