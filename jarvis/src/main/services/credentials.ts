/**
 * Zugangsdaten.
 *
 * Nichts davon steht im Quelltext oder in den Einstellungen. Der Speicher ist
 * eine verschlüsselte Datei im Datenverzeichnis:
 *
 *   - In Electron übernimmt `safeStorage` die Verschlüsselung. Der Schlüssel
 *     liegt dann im Schlüsselbund des Betriebssystems (Keychain, DPAPI,
 *     libsecret) und nie auf der Platte.
 *   - Außerhalb von Electron (Tests, Kommandozeile) wird AES-256-GCM mit einer
 *     lokalen Schlüsseldatei (Rechte 0600) verwendet. Das steht dann auch so
 *     in der Statusanzeige, damit niemand den schwächeren Fall übersieht.
 *
 * Zusätzlich wird `process.env` gelesen — praktisch für CI und für Leute,
 * die ihre Schlüssel ohnehin über die Umgebung setzen.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dataPath, FILES } from './runtime'
import type { CredentialStatus } from '@shared/types'

export interface CredentialSpec {
  key: string
  label: string
  description: string
  required: boolean
  helpUrl: string | null
}

/** Alles, was JARVIS je an Zugängen braucht — an einer Stelle. */
export const CREDENTIALS: CredentialSpec[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API-Schlüssel',
    description: 'Sprachmodell (Voreinstellung). Ohne diesen Schlüssel antwortet JARVIS nicht.',
    required: true,
    helpUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API-Schlüssel',
    description: 'Alternatives Sprachmodell, außerdem Spracherkennung (Whisper) und Sprachausgabe.',
    required: false,
    helpUrl: 'https://platform.openai.com/api-keys'
  },
  {
    key: 'DEEPGRAM_API_KEY',
    label: 'Deepgram API-Schlüssel',
    description: 'Alternative Spracherkennung.',
    required: false,
    helpUrl: 'https://console.deepgram.com/'
  },
  {
    key: 'ELEVENLABS_API_KEY',
    label: 'ElevenLabs API-Schlüssel',
    description: 'Alternative Sprachausgabe.',
    required: false,
    helpUrl: 'https://elevenlabs.io/app/settings/api-keys'
  },
  {
    key: 'BRAVE_SEARCH_API_KEY',
    label: 'Brave Search API-Schlüssel',
    description: 'Websuche für die Firmenrecherche. Empfohlen, weil zuverlässiger als die Notlösung.',
    required: false,
    helpUrl: 'https://brave.com/search/api/'
  },
  {
    key: 'TAVILY_API_KEY',
    label: 'Tavily API-Schlüssel',
    description: 'Alternative Websuche.',
    required: false,
    helpUrl: 'https://tavily.com/'
  },
  {
    key: 'SERPAPI_API_KEY',
    label: 'SerpAPI-Schlüssel',
    description: 'Alternative Websuche.',
    required: false,
    helpUrl: 'https://serpapi.com/manage-api-key'
  },
  {
    key: 'SMTP_PASSWORD',
    label: 'SMTP-Passwort',
    description: 'Passwort des Postausgangs-Kontos. Bei Gmail/Microsoft besser OAuth verwenden.',
    required: false,
    helpUrl: null
  },
  {
    key: 'IMAP_PASSWORD',
    label: 'IMAP-Passwort',
    description: 'Passwort des Posteingangs — nur nötig, um Antworten zuzuordnen.',
    required: false,
    helpUrl: null
  },
  {
    key: 'GMAIL_CLIENT_ID',
    label: 'Gmail OAuth Client-ID',
    description: 'Aus einem eigenen Google-Cloud-Projekt (Anwendungstyp: Desktop).',
    required: false,
    helpUrl: 'https://console.cloud.google.com/apis/credentials'
  },
  {
    key: 'GMAIL_CLIENT_SECRET',
    label: 'Gmail OAuth Client-Secret',
    description: 'Gehört zur Client-ID.',
    required: false,
    helpUrl: 'https://console.cloud.google.com/apis/credentials'
  },
  {
    key: 'GMAIL_REFRESH_TOKEN',
    label: 'Gmail Refresh-Token',
    description: 'Wird von JARVIS nach der Anmeldung selbst gesetzt — nicht von Hand eintragen.',
    required: false,
    helpUrl: null
  }
]

// ---------------------------------------------------------------------------
// Verschlüsselung
// ---------------------------------------------------------------------------

interface Cipher {
  kind: 'keychain' | 'local-key'
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

let cipher: Cipher | null = null

function loadElectronSafeStorage(): Cipher | null {
  try {
    const require = createRequire(import.meta.url)
    const electron = require('electron') as {
      safeStorage?: {
        isEncryptionAvailable(): boolean
        encryptString(plain: string): Buffer
        decryptString(data: Buffer): string
      }
    }
    const safe = electron?.safeStorage
    if (!safe || !safe.isEncryptionAvailable()) return null
    return {
      kind: 'keychain',
      encrypt: (plain) => safe.encryptString(plain),
      decrypt: (data) => safe.decryptString(data)
    }
  } catch {
    return null
  }
}

function loadLocalKeyCipher(): Cipher {
  const keyFile = dataPath(FILES.secretKey)
  let key: Buffer
  if (existsSync(keyFile)) {
    key = Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'base64')
    if (key.length !== 32) throw new Error(`Schlüsseldatei ${keyFile} ist beschädigt (erwartet 32 Byte).`)
  } else {
    key = randomBytes(32)
    writeFileSync(keyFile, key.toString('base64'), { mode: 0o600 })
    try {
      chmodSync(keyFile, 0o600)
    } catch {
      /* Auf Windows nicht relevant. */
    }
  }
  return {
    kind: 'local-key',
    encrypt(plain) {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), enc])
    },
    decrypt(data) {
      const iv = data.subarray(0, 12)
      const tag = data.subarray(12, 28)
      const enc = data.subarray(28)
      const d = createDecipheriv('aes-256-gcm', key, iv)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
    }
  }
}

function getCipher(): Cipher {
  if (!cipher) cipher = loadElectronSafeStorage() ?? loadLocalKeyCipher()
  return cipher
}

/** Nur für Tests. */
export function resetCredentialCache(): void {
  cipher = null
  store = null
}

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------

let store: Record<string, string> | null = null

function loadStore(): Record<string, string> {
  if (store) return store
  const file = dataPath(FILES.secrets)
  if (!existsSync(file)) {
    store = {}
    return store
  }
  try {
    const raw = getCipher().decrypt(readFileSync(file))
    store = JSON.parse(raw) as Record<string, string>
  } catch (err) {
    console.error('[credentials] Der Zugangsspeicher ließ sich nicht entschlüsseln:', err)
    // Nicht überschreiben — sonst wären die Daten endgültig weg.
    store = {}
  }
  return store
}

function persist(): void {
  const file = dataPath(FILES.secrets)
  const data = getCipher().encrypt(JSON.stringify(store ?? {}))
  writeFileSync(file, data, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    /* Windows */
  }
}

/** Liest einen Zugang: erst der verschlüsselte Speicher, dann die Umgebung. */
export function getSecret(key: string): string | null {
  const value = loadStore()[key]
  if (value) return value
  const fromEnv = process.env[key]
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null
}

export function setSecret(key: string, value: string): void {
  const s = loadStore()
  const trimmed = value.trim()
  if (!trimmed) {
    delete s[key]
  } else {
    s[key] = trimmed
  }
  persist()
}

export function clearSecret(key: string): void {
  const s = loadStore()
  delete s[key]
  persist()
}

export function credentialStatus(): CredentialStatus[] {
  const s = loadStore()
  return CREDENTIALS.map((spec) => {
    const inStore = Boolean(s[spec.key])
    const inEnv = Boolean(process.env[spec.key]?.trim())
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      required: spec.required,
      helpUrl: spec.helpUrl,
      set: inStore || inEnv,
      origin: inStore ? getCipher().kind : inEnv ? 'env' : null
    }
  })
}

/** Wie die Geheimnisse gerade geschützt sind — für die Einrichtungsprüfung. */
export function cipherKind(): 'keychain' | 'local-key' {
  return getCipher().kind
}
