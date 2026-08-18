/**
 * Einstellungen und Einrichtung.
 *
 * Oben steht, was noch fehlt — mit der konkreten nächsten Handlung. Darunter
 * die Zugänge (nur eintragen, nie anzeigen) und die übrigen Einstellungen.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { CredentialStatus, JarvisSettings, SetupCheck } from '@shared/types'

interface SettingsViewProps {
  onError(message: string, hint?: string): void
  onNotice(message: string): void
}

export function SettingsView({ onError, onNotice }: SettingsViewProps): ReactElement {
  const [settings, setSettings] = useState<JarvisSettings | null>(null)
  const [checks, setChecks] = useState<SetupCheck[]>([])
  const [credentials, setCredentials] = useState<CredentialStatus[]>([])
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [loadedSettings, loadedCredentials] = await Promise.all([
      window.jarvis.settings.get(),
      window.jarvis.credentials.status()
    ])
    setSettings(loadedSettings)
    setCredentials(loadedCredentials)
    setChecks(await window.jarvis.setup.check())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (value: Record<string, unknown>): Promise<void> => {
    setBusy(true)
    const result = await window.jarvis.settings.set(value)
    setBusy(false)
    if (!result.ok) onError(result.error, result.hint)
    else setSettings(result.data)
  }

  const saveSecret = async (key: string): Promise<void> => {
    const value = secretDrafts[key]
    if (!value) return
    const result = await window.jarvis.credentials.set(key, value)
    if (!result.ok) {
      onError(result.error, result.hint)
      return
    }
    setSecretDrafts((previous) => ({ ...previous, [key]: '' }))
    onNotice(`${key} gespeichert.`)
    await load()
  }

  if (!settings) return <div className="view">Lade ...</div>

  const open = checks.filter((check) => !check.ok)

  return (
    <div className="view enter">
      <h2 className="view__title">Einrichtung und Einstellungen</h2>

      {/* ---------------------------------------------------------- Prüfung */}
      <div className="section" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
        <h3>
          Status
          <button type="button" className="btn btn--quiet" style={{ marginLeft: 12 }} onClick={() => void load()}>
            Neu prüfen
          </button>
        </h3>
        {open.length === 0 ? (
          <p style={{ color: 'var(--good)' }}>Alles eingerichtet.</p>
        ) : (
          <p className="inline-note">{open.length} Punkte fehlen noch. Sie stehen unten mit dem nächsten Schritt.</p>
        )}
        {checks.map((check) => (
          <div className="check-row" key={check.id}>
            <span className="check-row__mark" data-ok={check.ok}>
              {check.ok ? '✓' : '!'}
            </span>
            <div>
              <strong style={{ fontWeight: 500 }}>{check.label}</strong>
              <div className="cell-sub">{check.detail}</div>
              {check.todo ? <div style={{ color: 'var(--warn)', fontSize: 13 }}>{check.todo}</div> : null}
            </div>
          </div>
        ))}
      </div>

      {/* --------------------------------------------------------- Zugänge */}
      <div className="section">
        <h3>Zugänge</h3>
        <p className="inline-note">
          Diese Werte werden verschlüsselt gespeichert und nie wieder angezeigt — auch nicht hier. Zum Aendern einfach
          neu eintragen. Alternativ lassen sie sich als Umgebungsvariablen setzen.
        </p>
        {credentials.map((credential) => (
          <div className="field" key={credential.key}>
            <label htmlFor={`cred-${credential.key}`}>
              {credential.label}
              {credential.required ? ' *' : ''}
              {credential.set ? (
                <span className="pill pill--good" style={{ marginLeft: 8 }}>
                  gesetzt ({credential.origin === 'env' ? 'Umgebung' : credential.origin === 'keychain' ? 'Schlüsselbund' : 'lokale Datei'})
                </span>
              ) : null}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id={`cred-${credential.key}`}
                type="password"
                autoComplete="off"
                placeholder={credential.set ? '••••••••  (neu eintragen zum Ersetzen)' : 'nicht gesetzt'}
                value={secretDrafts[credential.key] ?? ''}
                onChange={(event) =>
                  setSecretDrafts((previous) => ({ ...previous, [credential.key]: event.target.value }))
                }
              />
              <button
                type="button"
                className="btn"
                onClick={() => void saveSecret(credential.key)}
                disabled={!secretDrafts[credential.key]}
              >
                Speichern
              </button>
              {credential.set ? (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={async () => {
                    await window.jarvis.credentials.clear(credential.key)
                    await load()
                  }}
                >
                  Entfernen
                </button>
              ) : null}
            </div>
            <p className="hint">
              {credential.description}
              {credential.helpUrl ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="btn btn--quiet"
                    style={{ padding: 0 }}
                    onClick={() => void window.jarvis.system.openPath(credential.helpUrl as string)}
                  >
                    Anleitung öffnen
                  </button>
                </>
              ) : null}
            </p>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- Sprachmodell */}
      <div className="section">
        <h3>Sprachmodell</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="llm-provider">Anbieter</label>
            <select
              id="llm-provider"
              value={settings.llm.provider}
              onChange={(event) => void patch({ llm: { provider: event.target.value } })}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (lokal)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="llm-model">Modell</label>
            <input
              id="llm-model"
              defaultValue={settings.llm.model}
              onBlur={(event) => void patch({ llm: { model: event.target.value.trim() } })}
            />
          </div>
          <div className="field">
            <label htmlFor="llm-effort">Aufwand (nur Anthropic)</label>
            <select
              id="llm-effort"
              value={settings.llm.effort}
              onChange={(event) => void patch({ llm: { effort: event.target.value } })}
            >
              <option value="low">niedrig</option>
              <option value="medium">mittel</option>
              <option value="high">hoch</option>
              <option value="xhigh">sehr hoch</option>
              <option value="max">maximal</option>
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ E-Mail */}
      <div className="section">
        <h3>E-Mail</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="mail-transport">Versandweg</label>
            <select
              id="mail-transport"
              value={settings.mail.transport}
              onChange={(event) => void patch({ mail: { transport: event.target.value } })}
            >
              <option value="none">keiner (nur Entwürfe)</option>
              <option value="smtp">SMTP</option>
              <option value="gmail">Gmail (OAuth)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="mail-from">Absenderadresse</label>
            <input
              id="mail-from"
              defaultValue={settings.mail.fromAddress}
              onBlur={(event) => void patch({ mail: { fromAddress: event.target.value.trim() } })}
            />
          </div>
          <div className="field">
            <label htmlFor="mail-fromname">Absendername</label>
            <input
              id="mail-fromname"
              defaultValue={settings.mail.fromName}
              onBlur={(event) => void patch({ mail: { fromName: event.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="mail-replyto">Antwortadresse</label>
            <input
              id="mail-replyto"
              defaultValue={settings.mail.replyTo ?? ''}
              onBlur={(event) => void patch({ mail: { replyTo: event.target.value.trim() || null } })}
            />
          </div>
        </div>

        {settings.mail.transport === 'smtp' ? (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="smtp-host">SMTP-Server</label>
              <input
                id="smtp-host"
                defaultValue={settings.mail.smtp.host}
                onBlur={(event) => void patch({ mail: { smtp: { host: event.target.value.trim() } } })}
              />
            </div>
            <div className="field">
              <label htmlFor="smtp-port">Port</label>
              <input
                id="smtp-port"
                type="number"
                defaultValue={settings.mail.smtp.port}
                onBlur={(event) => void patch({ mail: { smtp: { port: Number(event.target.value) || 587 } } })}
              />
            </div>
            <div className="field">
              <label htmlFor="smtp-user">Benutzer</label>
              <input
                id="smtp-user"
                defaultValue={settings.mail.smtp.user}
                onBlur={(event) => void patch({ mail: { smtp: { user: event.target.value.trim() } } })}
              />
            </div>
            <div className="field">
              <label className="checkbox-row" htmlFor="smtp-secure">
                <input
                  id="smtp-secure"
                  type="checkbox"
                  checked={settings.mail.smtp.secure}
                  onChange={(event) => void patch({ mail: { smtp: { secure: event.target.checked } } })}
                />
                SSL/TLS direkt (Port 465)
              </label>
            </div>
          </div>
        ) : null}

        {settings.mail.transport === 'gmail' ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await window.jarvis.mail.startGmailOAuth()
              setBusy(false)
              if (!result.ok) onError(result.error, result.hint)
              else onNotice(`Angemeldet als ${result.data.email}.`)
              await load()
            }}
          >
            Mit Google anmelden
          </button>
        ) : null}

        <div className="grid-2" style={{ marginTop: 18 }}>
          <div className="field">
            <label htmlFor="imap-host">IMAP-Server (für Antworten)</label>
            <input
              id="imap-host"
              defaultValue={settings.mail.imap.host}
              onBlur={(event) => void patch({ mail: { imap: { host: event.target.value.trim() } } })}
            />
          </div>
          <div className="field">
            <label htmlFor="imap-user">IMAP-Benutzer</label>
            <input
              id="imap-user"
              defaultValue={settings.mail.imap.user}
              onBlur={(event) => void patch({ mail: { imap: { user: event.target.value.trim() } } })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="mail-signature">Signatur</label>
          <textarea
            id="mail-signature"
            rows={5}
            defaultValue={settings.mail.signature}
            onBlur={(event) => void patch({ mail: { signature: event.target.value } })}
          />
          <p className="hint">Wird unter jede Mail gesetzt. Pflichtangaben nach Paragraf 5 TMG gehören hier hinein.</p>
        </div>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const result = await window.jarvis.mail.testConnection()
            setBusy(false)
            if (!result.ok) onError(result.error, result.hint)
            else onNotice(result.data.detail)
          }}
        >
          Verbindung testen
        </button>
      </div>

      {/* ----------------------------------------------------------- Akquise */}
      <div className="section">
        <h3>Akquise</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="o-company">Eigener Firmenname</label>
            <input
              id="o-company"
              defaultValue={settings.outreach.senderCompany}
              onBlur={(event) => void patch({ outreach: { senderCompany: event.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="o-service">Eigene Leistungen</label>
            <input
              id="o-service"
              defaultValue={settings.outreach.senderService}
              onBlur={(event) => void patch({ outreach: { senderService: event.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="o-limit">Tageslimit für den Versand</label>
            <input
              id="o-limit"
              type="number"
              min={1}
              defaultValue={settings.outreach.dailySendLimit}
              onBlur={(event) => void patch({ outreach: { dailySendLimit: Number(event.target.value) || 40 } })}
            />
          </div>
          <div className="field">
            <label htmlFor="o-spacing">Mindestabstand in Sekunden</label>
            <input
              id="o-spacing"
              type="number"
              min={0}
              defaultValue={settings.outreach.minSecondsBetweenSends}
              onBlur={(event) => void patch({ outreach: { minSecondsBetweenSends: Number(event.target.value) || 0 } })}
            />
          </div>
          <div className="field">
            <label htmlFor="o-block">Sperrfrist für erneuten Erstkontakt (Tage)</label>
            <input
              id="o-block"
              type="number"
              min={0}
              defaultValue={settings.outreach.reContactBlockDays}
              onBlur={(event) => void patch({ outreach: { reContactBlockDays: Number(event.target.value) || 0 } })}
            />
          </div>
        </div>

        <label className="checkbox-row" htmlFor="o-verified">
          <input
            id="o-verified"
            type="checkbox"
            checked={settings.outreach.requireVerifiedAddress}
            onChange={(event) => void patch({ outreach: { requireVerifiedAddress: event.target.checked } })}
          />
          Nur verifizierte Adressen anschreiben (dringend empfohlen)
        </label>

        <div className="field">
          <label htmlFor="o-optout">Abmeldehinweis</label>
          <textarea
            id="o-optout"
            rows={2}
            defaultValue={settings.outreach.optOutLine}
            onBlur={(event) => void patch({ outreach: { optOutLine: event.target.value } })}
          />
          <p className="hint">Wird an jede Akquise-Mail angehängt.</p>
        </div>
      </div>

      {/* ------------------------------------------------------------ Suche */}
      <div className="section">
        <h3>Recherche</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="s-provider">Suchanbieter</label>
            <select
              id="s-provider"
              value={settings.search.provider}
              onChange={(event) => void patch({ search: { provider: event.target.value } })}
            >
              <option value="duckduckgo">DuckDuckGo (ohne Schlüssel)</option>
              <option value="brave">Brave Search</option>
              <option value="tavily">Tavily</option>
              <option value="serpapi">SerpAPI</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-delay">Pause zwischen Abrufen (ms)</label>
            <input
              id="s-delay"
              type="number"
              min={0}
              defaultValue={settings.research.requestDelayMs}
              onBlur={(event) => void patch({ research: { requestDelayMs: Number(event.target.value) || 0 } })}
            />
          </div>
        </div>
        <label className="checkbox-row" htmlFor="s-robots">
          <input
            id="s-robots"
            type="checkbox"
            checked={settings.research.respectRobotsTxt}
            onChange={(event) => void patch({ research: { respectRobotsTxt: event.target.checked } })}
          />
          robots.txt beachten
        </label>
      </div>

      {/* ----------------------------------------------------------- Sprache */}
      <div className="section">
        <h3>Sprache</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="stt-provider">Spracherkennung</label>
            <select
              id="stt-provider"
              value={settings.stt.provider}
              onChange={(event) => void patch({ stt: { provider: event.target.value } })}
            >
              <option value="openai">OpenAI Whisper</option>
              <option value="deepgram">Deepgram</option>
              <option value="browser">im Fenster (ohne Dienst)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tts-provider">Sprachausgabe</label>
            <select
              id="tts-provider"
              value={settings.tts.provider}
              onChange={(event) => void patch({ tts: { provider: event.target.value } })}
            >
              <option value="openai">OpenAI</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="browser">Systemstimme</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="tts-voice">Stimme</label>
            <input
              id="tts-voice"
              defaultValue={settings.tts.voice}
              onBlur={(event) => void patch({ tts: { voice: event.target.value.trim() } })}
            />
          </div>
        </div>
        <label className="checkbox-row" htmlFor="tts-enabled">
          <input
            id="tts-enabled"
            type="checkbox"
            checked={settings.tts.enabled}
            onChange={(event) => void patch({ tts: { enabled: event.target.checked } })}
          />
          Antworten vorlesen
        </label>
      </div>

      {/* ----------------------------------------------------------- Dateien */}
      <div className="section">
        <h3>Dateien und Kalender</h3>
        <div className="field">
          <label htmlFor="f-roots">Freigegebene Verzeichnisse (eines je Zeile)</label>
          <textarea
            id="f-roots"
            rows={3}
            defaultValue={settings.files.allowedRoots.join('\n')}
            onBlur={(event) =>
              void patch({
                files: { allowedRoots: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) }
              })
            }
          />
          <p className="hint">
            Außerhalb dieser Ordner liest und schreibt JARVIS nicht. Der eigene Arbeitsordner ist immer dabei.
          </p>
        </div>
        <div className="field">
          <label htmlFor="f-cal">Kalenderquellen (.ics-Datei oder Ordner, eines je Zeile)</label>
          <textarea
            id="f-cal"
            rows={3}
            defaultValue={settings.files.calendarSources.join('\n')}
            onBlur={(event) =>
              void patch({
                files: { calendarSources: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) }
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
