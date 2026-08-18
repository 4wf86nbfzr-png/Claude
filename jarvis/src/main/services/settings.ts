/**
 * Einstellungen.
 *
 * Voreinstellungen stehen im Code, Abweichungen in der Datenbank. Geheimnisse
 * gehören NICHT hierher — die liegen im verschlüsselten Speicher
 * (credentials.ts).
 */
import { readSetting, writeSetting } from '../db/repos/system'
import type { JarvisSettings } from '@shared/types'

const SETTINGS_KEY = 'settings'

export const DEFAULT_SETTINGS: JarvisSettings = {
  llm: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    effort: 'high',
    maxTokens: 16000
  },
  stt: { provider: 'openai', model: 'whisper-1', language: 'de' },
  tts: { provider: 'openai', voice: 'alloy', enabled: true },
  search: { provider: 'duckduckgo', maxResults: 12 },
  mail: {
    transport: 'none',
    fromName: '',
    fromAddress: '',
    replyTo: null,
    signature: '',
    smtp: { host: '', port: 587, secure: false, user: '' },
    imap: { host: '', port: 993, secure: true, user: '', mailbox: 'INBOX' },
    gmail: { clientId: '', redirectPort: 45219 }
  },
  outreach: {
    dailySendLimit: 40,
    minSecondsBetweenSends: 20,
    requireVerifiedAddress: true,
    reContactBlockDays: 180,
    senderCompany: '',
    senderService: '',
    optOutLine:
      'Wenn Sie keine weiteren Nachrichten von uns möchten, genügt eine kurze Antwort mit "keine Werbung" — dann tragen wir Sie aus.'
  },
  research: {
    userAgent: 'JARVIS-Recherche/1.0 (+geschäftliche Kontaktrecherche; Kontakt siehe Absenderadresse)',
    respectRobotsTxt: true,
    requestDelayMs: 1200,
    maxPagesPerCompany: 6
  },
  files: { allowedRoots: [], calendarSources: [] },
  ui: { locale: 'de', voiceInputEnabled: true }
}

type Plain = Record<string, unknown>

function isPlainObject(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rekursives Zusammenführen: gespeicherte Werte gewinnen, Lücken kommen aus den Voreinstellungen. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base
  if (!isPlainObject(base)) return patch as T
  const out: Plain = { ...(base as unknown as Plain) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = out[key]
    out[key] = isPlainObject(value) && isPlainObject(current) ? deepMerge(current, value) : value
  }
  return out as T
}

let cache: JarvisSettings | null = null

export function getSettings(): JarvisSettings {
  if (cache) return cache
  const raw = readSetting(SETTINGS_KEY)
  if (!raw) {
    cache = DEFAULT_SETTINGS
    return cache
  }
  try {
    cache = deepMerge(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    console.warn('[settings] Gespeicherte Einstellungen sind unlesbar — es gelten die Voreinstellungen.')
    cache = DEFAULT_SETTINGS
  }
  return cache
}

export function updateSettings(patch: unknown): JarvisSettings {
  const next = deepMerge(getSettings(), patch)
  writeSetting(SETTINGS_KEY, JSON.stringify(next))
  cache = next
  return next
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function resetSettingsCache(): void {
  cache = null
}
