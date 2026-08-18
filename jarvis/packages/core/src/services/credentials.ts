import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Logger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';

/**
 * Zugangsdaten werden nie im Code und nie in der Datenbank abgelegt.
 *
 * Reihenfolge beim Lesen:
 *   1. Umgebungsvariable (z.B. aus .env oder dem Systemstart)
 *   2. externer Speicher, falls gesetzt -- im Desktop ist das Electron
 *      `safeStorage`, also der Schluesselbund des Betriebssystems
 *   3. verschluesselte Datei im Datenverzeichnis (AES-256-GCM)
 *
 * Geschrieben wird immer nur in 2. bzw. 3. -- die Umgebung fassen wir nicht an.
 */

export interface ExternalSecretStore {
  readonly name: string;
  isAvailable(): boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  keys(): string[];
}

export interface CredentialServiceOptions {
  secretsFile: string;
  keyFile: string;
  passphrase?: string | undefined;
  env?: NodeJS.ProcessEnv;
  external?: ExternalSecretStore | undefined;
  logger?: Logger;
}

interface EncryptedBlob {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

export class CredentialService {
  private readonly logger: Logger;
  private cache: Record<string, string> | null = null;

  constructor(private readonly options: CredentialServiceOptions) {
    this.logger = options.logger ?? silentLogger;
  }

  private get env(): NodeJS.ProcessEnv {
    return this.options.env ?? process.env;
  }

  /** Woher stammt der Wert? Fuer den Einrichtungsassistenten. */
  origin(key: string): 'umgebung' | 'schluesselbund' | 'datei' | null {
    const fromEnv = this.env[key];
    if (fromEnv && fromEnv.trim() !== '') return 'umgebung';
    const ext = this.options.external;
    if (ext?.isAvailable()) {
      const v = ext.get(key);
      if (v) return 'schluesselbund';
    }
    const store = this.load();
    return store[key] ? 'datei' : null;
  }

  get(key: string): string | null {
    const fromEnv = this.env[key];
    if (fromEnv && fromEnv.trim() !== '') return fromEnv;

    const ext = this.options.external;
    if (ext?.isAvailable()) {
      const v = ext.get(key);
      if (v) return v;
    }

    const store = this.load();
    return store[key] ?? null;
  }

  require(key: string, hint: string): string {
    const v = this.get(key);
    if (!v) {
      throw new Error(`Zugangsdaten fehlen: ${key}. ${hint}`);
    }
    return v;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  set(key: string, value: string): void {
    const ext = this.options.external;
    if (ext?.isAvailable()) {
      ext.set(key, value);
      this.logger.info('Zugangsdaten im Schluesselbund gespeichert', { key });
      return;
    }
    const store = this.load();
    store[key] = value;
    this.persist(store);
    this.logger.info('Zugangsdaten verschluesselt in Datei gespeichert', { key });
  }

  delete(key: string): void {
    this.options.external?.delete(key);
    const store = this.load();
    if (key in store) {
      delete store[key];
      this.persist(store);
    }
  }

  /** Nur die Namen -- Werte verlassen den Service nie in Listenform. */
  keys(): string[] {
    const names = new Set<string>(Object.keys(this.load()));
    if (this.options.external?.isAvailable()) {
      for (const k of this.options.external.keys()) names.add(k);
    }
    for (const k of Object.keys(this.env)) {
      if (/^(ANTHROPIC|OPENAI|GOOGLE|MS_|SMTP|IMAP|TAVILY|BRAVE|SERPAPI|ELEVENLABS)/.test(k)) names.add(k);
    }
    return [...names].sort();
  }

  // --- verschluesselte Datei ---------------------------------------------

  private key(): Buffer {
    const pass = this.options.passphrase ?? this.env.JARVIS_SECRETS_PASSPHRASE;
    if (pass && pass.length > 0) {
      // Salt liegt neben der Datei; ohne Passwort ist die Datei wertlos.
      const salt = this.saltFile();
      return scryptSync(pass, salt, 32);
    }
    // Ohne Passphrase: Zufallsschluessel in einer Datei mit 0600.
    // Schuetzt gegen versehentliches Mitkopieren, nicht gegen einen
    // Angreifer mit Vollzugriff auf das Benutzerkonto -- das steht so im README.
    if (existsSync(this.options.keyFile)) {
      return Buffer.from(readFileSync(this.options.keyFile, 'utf8').trim(), 'base64');
    }
    const k = randomBytes(32);
    writeFileSync(this.options.keyFile, k.toString('base64'), { mode: 0o600 });
    chmodSync(this.options.keyFile, 0o600);
    return k;
  }

  private saltFile(): Buffer {
    const path = `${this.options.keyFile}.salt`;
    if (existsSync(path)) return Buffer.from(readFileSync(path, 'utf8').trim(), 'base64');
    const salt = randomBytes(16);
    writeFileSync(path, salt.toString('base64'), { mode: 0o600 });
    return salt;
  }

  private load(): Record<string, string> {
    if (this.cache) return this.cache;
    if (!existsSync(this.options.secretsFile)) {
      this.cache = {};
      return this.cache;
    }
    try {
      const blob = JSON.parse(readFileSync(this.options.secretsFile, 'utf8')) as EncryptedBlob;
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(blob.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
      const plain = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
      this.cache = JSON.parse(plain.toString('utf8')) as Record<string, string>;
    } catch (e) {
      this.logger.error('Geheimnis-Datei konnte nicht entschluesselt werden', {
        file: this.options.secretsFile,
        grund: e instanceof Error ? e.message : String(e),
      });
      // Nicht ueberschreiben -- sonst waeren die Daten endgueltig weg.
      throw new Error(
        `Die Datei ${this.options.secretsFile} laesst sich nicht entschluesseln. ` +
          'Stimmt JARVIS_SECRETS_PASSPHRASE bzw. liegt die Schluesseldatei noch daneben?',
      );
    }
    return this.cache;
  }

  private persist(store: Record<string, string>): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()]);
    const blob: EncryptedBlob = {
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
    writeFileSync(this.options.secretsFile, JSON.stringify(blob), { mode: 0o600 });
    chmodSync(this.options.secretsFile, 0o600);
    this.cache = store;
  }
}

/** Konstantzeit-Vergleich, z.B. fuer OAuth-State-Parameter. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
