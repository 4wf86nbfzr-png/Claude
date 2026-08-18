/**
 * Einrichtungsprüfung.
 *
 * Beantwortet die Frage "was fehlt noch, damit JARVIS arbeiten kann" — und
 * sagt bei jedem Punkt dazu, was zu tun ist. Die Oberfläche zeigt das beim
 * ersten Start als Assistenten an.
 */
import { getDb } from '../db'
import { cipherKind, credentialStatus, getSecret } from './credentials'
import { getSettings } from './settings'
import { getMailTransport } from '../mail'
import { MailConfigError } from '../mail/types'
import type { SetupCheck } from '@shared/types'

export async function runSetupChecks(): Promise<SetupCheck[]> {
  const settings = getSettings()
  const credentials = credentialStatus()
  const has = (key: string): boolean => credentials.find((c) => c.key === key)?.set ?? false
  const checks: SetupCheck[] = []

  // ---- Datenbank ----------------------------------------------------------
  try {
    const db = getDb()
    const row = db.prepare('SELECT COUNT(*) AS n FROM companies').get<{ n: number }>()
    checks.push({
      id: 'datenbank',
      label: 'Datenbank',
      ok: true,
      detail: `Erreichbar über ${db.driver}; ${Number(row?.n ?? 0)} Firmen gespeichert.`,
      todo: null
    })
  } catch (err) {
    checks.push({
      id: 'datenbank',
      label: 'Datenbank',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      todo: 'Die Anwendung neu starten. Bleibt es dabei, ist das Datenverzeichnis nicht beschreibbar.'
    })
  }

  // ---- Zugangsspeicher ----------------------------------------------------
  const kind = cipherKind()
  checks.push({
    id: 'zugangsspeicher',
    label: 'Zugangsdaten',
    ok: true,
    detail:
      kind === 'keychain'
        ? 'Verschlüsselt über den Schlüsselbund des Betriebssystems.'
        : 'Verschlüsselt mit einer lokalen Schlüsseldatei (Rechte 0600).',
    todo:
      kind === 'keychain'
        ? null
        : 'Der Schlüsselbund war nicht verfügbar. Innerhalb der Anwendung sollte hier "Schlüsselbund" stehen — sonst prüfen, ob der Systemdienst läuft (Linux: gnome-keyring / libsecret).'
  })

  // ---- Sprachmodell -------------------------------------------------------
  const llmKey =
    settings.llm.provider === 'anthropic'
      ? 'ANTHROPIC_API_KEY'
      : settings.llm.provider === 'openai'
        ? 'OPENAI_API_KEY'
        : null

  if (llmKey) {
    checks.push({
      id: 'sprachmodell',
      label: `Sprachmodell (${settings.llm.provider}, ${settings.llm.model})`,
      ok: has(llmKey),
      detail: has(llmKey) ? 'Schlüssel hinterlegt.' : `Es fehlt ${llmKey}.`,
      todo: has(llmKey) ? null : `Einstellungen -> Zugänge -> ${llmKey} eintragen.`
    })
  } else {
    checks.push({
      id: 'sprachmodell',
      label: `Sprachmodell (Ollama, ${settings.llm.model})`,
      ok: true,
      detail: `Lokales Modell unter ${settings.llm.baseUrl ?? 'http://127.0.0.1:11434'}.`,
      todo: 'Sicherstellen, dass "ollama serve" läuft und das Modell Funktionsaufrufe beherrscht.'
    })
  }

  // ---- Websuche -----------------------------------------------------------
  const searchKeyByProvider: Record<string, string | null> = {
    brave: 'BRAVE_SEARCH_API_KEY',
    tavily: 'TAVILY_API_KEY',
    serpapi: 'SERPAPI_API_KEY',
    duckduckgo: null
  }
  const searchKey = searchKeyByProvider[settings.search.provider]
  checks.push({
    id: 'suche',
    label: `Websuche (${settings.search.provider})`,
    ok: searchKey === null ? true : has(searchKey),
    detail:
      searchKey === null
        ? 'Notlösung ohne Schlüssel. Funktioniert, wird aber häufig gedrosselt.'
        : has(searchKey)
          ? 'Schlüssel hinterlegt.'
          : `Es fehlt ${searchKey}.`,
    todo:
      searchKey === null
        ? 'Für verlässliche Recherche BRAVE_SEARCH_API_KEY hinterlegen und den Anbieter umstellen.'
        : has(searchKey)
          ? null
          : `Einstellungen -> Zugänge -> ${searchKey} eintragen.`
  })

  // ---- Absender -----------------------------------------------------------
  const senderOk = Boolean(settings.mail.fromAddress && settings.outreach.senderCompany)
  checks.push({
    id: 'absender',
    label: 'Absender und Firmenangaben',
    ok: senderOk,
    detail: senderOk
      ? `${settings.outreach.senderCompany} <${settings.mail.fromAddress}>`
      : 'Firmenname oder Absenderadresse fehlen.',
    todo: senderOk ? null : 'Einstellungen -> E-Mail und Akquise: Firmenname, Leistung und Absenderadresse eintragen.'
  })

  // ---- Versandweg ---------------------------------------------------------
  if (settings.mail.transport === 'none') {
    checks.push({
      id: 'versand',
      label: 'Versandweg',
      ok: false,
      detail: 'Kein Versandweg eingerichtet. Entwürfe funktionieren, Versand nicht.',
      todo: 'Einstellungen -> E-Mail: SMTP eintragen oder Gmail per OAuth verbinden.'
    })
  } else {
    try {
      const transport = getMailTransport()
      const verified = await transport.verify()
      checks.push({
        id: 'versand',
        label: `Versandweg (${settings.mail.transport})`,
        ok: verified.ok,
        detail: verified.detail,
        todo: verified.ok ? null : 'Zugangsdaten und Servereinstellungen prüfen.'
      })
    } catch (err) {
      const message = err instanceof MailConfigError ? err.message : String(err)
      const hint = err instanceof MailConfigError ? err.hint : 'Einstellungen -> E-Mail prüfen.'
      checks.push({ id: 'versand', label: 'Versandweg', ok: false, detail: message, todo: hint })
    }
  }

  // ---- Posteingang --------------------------------------------------------
  const inboxConfigured = settings.mail.transport === 'gmail' || Boolean(settings.mail.imap.host)
  checks.push({
    id: 'posteingang',
    label: 'Posteingang (Antworten zuordnen)',
    ok: inboxConfigured,
    detail: inboxConfigured ? 'Eingerichtet.' : 'Nicht eingerichtet — Antworten werden nicht automatisch zugeordnet.',
    todo: inboxConfigured ? null : 'Optional: Einstellungen -> E-Mail -> Posteingang (IMAP) ausfüllen.'
  })

  // ---- Sprache ------------------------------------------------------------
  const sttOk = settings.stt.provider === 'browser' || has(settings.stt.provider === 'deepgram' ? 'DEEPGRAM_API_KEY' : 'OPENAI_API_KEY')
  checks.push({
    id: 'spracherkennung',
    label: `Spracherkennung (${settings.stt.provider})`,
    ok: sttOk,
    detail: sttOk ? 'Einsatzbereit.' : 'Der Schlüssel für den gewählten Dienst fehlt.',
    todo: sttOk ? null : 'Schlüssel hinterlegen oder in den Einstellungen auf "browser" umstellen.'
  })

  const ttsOk =
    !settings.tts.enabled ||
    settings.tts.provider === 'browser' ||
    has(settings.tts.provider === 'elevenlabs' ? 'ELEVENLABS_API_KEY' : 'OPENAI_API_KEY')
  checks.push({
    id: 'sprachausgabe',
    label: `Sprachausgabe (${settings.tts.enabled ? settings.tts.provider : 'aus'})`,
    ok: ttsOk,
    detail: ttsOk ? 'Einsatzbereit.' : 'Der Schlüssel für den gewählten Dienst fehlt.',
    todo: ttsOk ? null : 'Schlüssel hinterlegen oder auf "browser" (Systemstimme) umstellen.'
  })

  // ---- Kalender -----------------------------------------------------------
  checks.push({
    id: 'kalender',
    label: 'Kalender',
    ok: settings.files.calendarSources.length > 0,
    detail:
      settings.files.calendarSources.length > 0
        ? `${settings.files.calendarSources.length} Quelle(n) eingerichtet.`
        : 'Keine Kalenderquelle eingerichtet.',
    todo:
      settings.files.calendarSources.length > 0
        ? null
        : 'Optional: Einstellungen -> Dateien: Pfad zu einer .ics-Datei oder einem Ordner damit eintragen.'
  })

  // ---- Gmail-Sonderfall ---------------------------------------------------
  if (settings.mail.transport === 'gmail' && !getSecret('GMAIL_REFRESH_TOKEN')) {
    checks.push({
      id: 'gmail-anmeldung',
      label: 'Gmail-Anmeldung',
      ok: false,
      detail: 'Client-Daten liegen vor, die Anmeldung fehlt noch.',
      todo: 'Einstellungen -> E-Mail -> "Mit Google anmelden" ausführen.'
    })
  }

  return checks
}
