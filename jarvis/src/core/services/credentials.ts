import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Verschlüsselung für den lokalen Zugangsdaten-Tresor.
 *
 * In der Desktop-App wird `safeStorage` von Electron eingehängt (nutzt den
 * Schlüsselbund des Betriebssystems). Ohne Electron – etwa in Tests oder im
 * Einrichtungsassistenten – tritt die Passphrasen-Variante an ihre Stelle.
 */
export interface Encryptor {
  readonly label: string;
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

/** AES-256-GCM mit aus einer Passphrase abgeleitetem Schlüssel. */
export class PassphraseEncryptor implements Encryptor {
  readonly label = 'Passphrase (JARVIS_MASTER_KEY)';

  constructor(private readonly passphrase: string) {}

  available(): boolean {
    return this.passphrase.length >= 8;
  }

  encrypt(plain: string): Buffer {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(this.passphrase, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const payload = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([salt, iv, cipher.getAuthTag(), payload]);
  }

  decrypt(data: Buffer): string {
    const salt = data.subarray(0, 16);
    const iv = data.subarray(16, 28);
    const tag = data.subarray(28, 44);
    const payload = data.subarray(44);
    const key = scryptSync(this.passphrase, salt, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  }
}

/** Kein Tresor verfügbar: Speichern wird verweigert, Lesen aus der Umgebung bleibt möglich. */
export class NullEncryptor implements Encryptor {
  readonly label = 'nicht verfügbar';
  available(): boolean {
    return false;
  }
  encrypt(): Buffer {
    throw new Error('Kein Verschlüsselungsverfahren verfügbar.');
  }
  decrypt(): string {
    throw new Error('Kein Verschlüsselungsverfahren verfügbar.');
  }
}

export interface SecretDefinition {
  name: string;
  label: string;
  hint: string;
  /** Für welchen Anbieter/welche Funktion der Wert gebraucht wird. */
  group: 'llm' | 'stt' | 'tts' | 'suche' | 'mail' | 'kalender';
}

/** Katalog aller Geheimnisse, die JARVIS kennt. Wird auch vom Setup benutzt. */
export const SECRET_CATALOG: SecretDefinition[] = [
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API-Schlüssel', hint: 'console.anthropic.com → API Keys', group: 'llm' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI-kompatibler Schlüssel', hint: 'Für OpenAI, Azure oder lokale Server', group: 'llm' },
  { name: 'JARVIS_STT_API_KEY', label: 'Schlüssel für Spracherkennung', hint: 'Leer lassen, wenn OPENAI_API_KEY gilt', group: 'stt' },
  { name: 'JARVIS_TTS_API_KEY', label: 'Schlüssel für Sprachausgabe', hint: 'Leer lassen, wenn OPENAI_API_KEY gilt', group: 'tts' },
  { name: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API-Schlüssel', hint: 'Nur bei Sprachausgabe über ElevenLabs', group: 'tts' },
  { name: 'BRAVE_API_KEY', label: 'Brave Search API-Schlüssel', hint: 'api.search.brave.com', group: 'suche' },
  { name: 'TAVILY_API_KEY', label: 'Tavily API-Schlüssel', hint: 'tavily.com', group: 'suche' },
  { name: 'SERPAPI_API_KEY', label: 'SerpAPI-Schlüssel', hint: 'serpapi.com', group: 'suche' },
  { name: 'SMTP_PASSWORD', label: 'SMTP-Passwort', hint: 'Bei Gmail: App-Passwort oder OAuth benutzen', group: 'mail' },
  { name: 'IMAP_PASSWORD', label: 'IMAP-Passwort', hint: 'Für das Zuordnen eingehender Antworten', group: 'mail' },
  { name: 'GOOGLE_CLIENT_ID', label: 'Google OAuth Client-ID', hint: 'Desktop-App-Client aus der Google Cloud Console', group: 'mail' },
  { name: 'GOOGLE_CLIENT_SECRET', label: 'Google OAuth Client-Secret', hint: 'Gehört zum selben Client', group: 'mail' },
  { name: 'GOOGLE_REFRESH_TOKEN', label: 'Google Refresh-Token', hint: 'Wird vom OAuth-Ablauf selbst hinterlegt', group: 'mail' }
];

export type SecretSource = 'umgebung' | 'tresor' | 'fehlt';

export interface SecretState {
  name: string;
  label: string;
  hint: string;
  group: SecretDefinition['group'];
  source: SecretSource;
}

/**
 * Verwaltung aller Zugangsdaten (§3).
 *
 * Reihenfolge beim Lesen: Umgebungsvariable vor Tresordatei. Zugangsdaten
 * werden nie in die Datenbank, nie ins Protokoll und nie an die Oberfläche
 * gegeben – nach außen geht ausschließlich, ob ein Wert vorhanden ist.
 */
export class CredentialService {
  private cache: Record<string, string> | null = null;

  constructor(
    private readonly storePath: string,
    private readonly encryptor: Encryptor,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  get vaultLabel(): string {
    return this.encryptor.available() ? this.encryptor.label : 'nicht verfügbar';
  }

  get(name: string): string | null {
    const fromEnv = this.env[name];
    if (fromEnv) return fromEnv;
    return this.readStore()[name] ?? null;
  }

  has(name: string): boolean {
    return Boolean(this.get(name));
  }

  /**
   * Ersatzkette: erster gesetzter Wert gewinnt. Damit reicht ein
   * OPENAI_API_KEY für Chat, Spracherkennung und Sprachausgabe.
   */
  getFirst(...names: string[]): string | null {
    for (const name of names) {
      const value = this.get(name);
      if (value) return value;
    }
    return null;
  }

  set(name: string, value: string): void {
    if (!this.encryptor.available()) {
      throw new Error(
        'Kein Tresor verfügbar. Setzen Sie JARVIS_MASTER_KEY oder starten Sie JARVIS als Desktop-App, ' +
          'damit der Schlüsselbund des Betriebssystems benutzt werden kann.'
      );
    }
    const store = { ...this.readStore(), [name]: value };
    this.writeStore(store);
  }

  remove(name: string): void {
    const store = this.readStore();
    if (!(name in store)) return;
    delete store[name];
    this.writeStore(store);
  }

  /** Übersicht für die Oberfläche – enthält absichtlich keine Werte. */
  describe(): SecretState[] {
    const store = this.readStore();
    return SECRET_CATALOG.map((definition) => ({
      name: definition.name,
      label: definition.label,
      hint: definition.hint,
      group: definition.group,
      source: this.env[definition.name]
        ? 'umgebung'
        : store[definition.name]
          ? 'tresor'
          : 'fehlt'
    }));
  }

  private readStore(): Record<string, string> {
    if (this.cache) return { ...this.cache };
    if (!existsSync(this.storePath) || !this.encryptor.available()) {
      this.cache = {};
      return {};
    }
    try {
      const raw = JSON.parse(readFileSync(this.storePath, 'utf8')) as Record<string, string>;
      const decrypted: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        try {
          decrypted[key] = this.encryptor.decrypt(Buffer.from(value, 'base64'));
        } catch {
          // Ein nicht entschlüsselbarer Eintrag (anderer Schlüssel, anderes Gerät)
          // wird übersprungen, statt den Start zu verhindern.
        }
      }
      this.cache = decrypted;
      return { ...decrypted };
    } catch {
      this.cache = {};
      return {};
    }
  }

  private writeStore(store: Record<string, string>): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const encrypted = Object.fromEntries(
      Object.entries(store).map(([key, value]) => [key, this.encryptor.encrypt(value).toString('base64')])
    );
    writeFileSync(this.storePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    try {
      chmodSync(this.storePath, 0o600);
    } catch {
      // Auf Windows ohne Wirkung – dort schützt die Benutzerprofil-ACL.
    }
    this.cache = { ...store };
  }
}
