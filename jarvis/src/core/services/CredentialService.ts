import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CredentialKey, CredentialStatus, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import { nowIso } from '../util/id.js';
import type { Database } from '../db/database.js';

/**
 * Encrypts and decrypts a secret. Implemented by the OS keychain wrapper in
 * Electron (`safeStorage`) and by the local AES-256-GCM fallback below.
 */
export interface SecretBox {
  readonly name: string;
  available(): boolean;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

/**
 * Fallback secret box: AES-256-GCM with a key derived from a random 32-byte
 * seed stored next to the database with 0600 permissions.
 *
 * This is meaningfully weaker than the OS keychain — anyone who can read the
 * user's home directory can read the seed — which is why the setup assistant
 * reports which box is active. It exists so the app never silently stores a
 * secret in plaintext.
 */
export class LocalSecretBox implements SecretBox {
  readonly name = 'lokal (AES-256-GCM)';
  private key: Buffer | null = null;

  constructor(private readonly seedFile: string) {}

  available(): boolean {
    return true;
  }

  private getKey(): Buffer {
    if (this.key) return this.key;
    mkdirSync(dirname(this.seedFile), { recursive: true });
    let seed: Buffer;
    if (existsSync(this.seedFile)) {
      seed = Buffer.from(readFileSync(this.seedFile, 'utf8').trim(), 'base64');
      if (seed.length !== 32) {
        throw new Error(`Ungültige Schlüsseldatei: ${this.seedFile}`);
      }
    } else {
      seed = randomBytes(32);
      writeFileSync(this.seedFile, seed.toString('base64'), { mode: 0o600 });
      try {
        chmodSync(this.seedFile, 0o600);
      } catch {
        // Windows has no POSIX modes; the file inherits directory ACLs.
      }
    }
    this.key = scryptSync(seed, 'jarvis-credential-store', 32);
    return this.key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${body.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const [version, ivB64, tagB64, bodyB64] = ciphertext.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !bodyB64) {
      throw new Error('Unlesbarer Geheimnis-Datensatz');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64')), decipher.final()]).toString('utf8');
  }
}

/** Environment variable that may supply each credential (see .env.example). */
const ENV_NAMES: Record<CredentialKey, string> = {
  'anthropic.apiKey': 'ANTHROPIC_API_KEY',
  'openai.apiKey': 'OPENAI_API_KEY',
  'elevenlabs.apiKey': 'ELEVENLABS_API_KEY',
  'brave.apiKey': 'BRAVE_SEARCH_API_KEY',
  'tavily.apiKey': 'TAVILY_API_KEY',
  'serpapi.apiKey': 'SERPAPI_API_KEY',
  'smtp.password': 'SMTP_PASSWORD',
  'imap.password': 'IMAP_PASSWORD',
  'gmail.clientSecret': 'GMAIL_CLIENT_SECRET',
  'gmail.refreshToken': 'GMAIL_REFRESH_TOKEN',
};

export const CREDENTIAL_KEYS = Object.keys(ENV_NAMES) as CredentialKey[];

/**
 * Single point of access for every secret in the application.
 *
 * Resolution order per key: encrypted store → environment variable. Secrets
 * are never written to the audit log, never returned to the renderer and never
 * embedded in a prompt.
 */
export class CredentialService {
  private readonly cache = new Map<CredentialKey, string>();

  constructor(
    private readonly db: Database,
    private readonly box: SecretBox,
  ) {}

  static localBoxFor(dataDir: string): SecretBox {
    return new LocalSecretBox(join(dataDir, 'credential.key'));
  }

  get boxName(): string {
    return this.box.name;
  }

  get(key: CredentialKey): string | null {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const row = this.db
      .prepare('SELECT ciphertext FROM credentials WHERE key = ?')
      .get<{ ciphertext: string }>(key);
    if (row) {
      try {
        const value = this.box.decrypt(row.ciphertext);
        this.cache.set(key, value);
        return value;
      } catch {
        // A corrupted or foreign-machine record must not crash the app; the
        // status view will show the credential as missing so it can be re-set.
        return this.fromEnv(key);
      }
    }
    return this.fromEnv(key);
  }

  private fromEnv(key: CredentialKey): string | null {
    const value = process.env[ENV_NAMES[key]];
    return value && value.trim() ? value.trim() : null;
  }

  set(key: CredentialKey, value: string): Result<true> {
    const trimmed = value.trim();
    if (!trimmed) return this.clear(key);
    try {
      const ciphertext = this.box.encrypt(trimmed);
      this.db
        .prepare(
          `INSERT INTO credentials (key, ciphertext, hint, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET ciphertext = excluded.ciphertext,
             hint = excluded.hint, updated_at = excluded.updated_at`,
        )
        .run(key, ciphertext, trimmed.slice(-4), nowIso());
      this.cache.set(key, trimmed);
      return ok(true);
    } catch (error) {
      return err(
        makeError('credentials.encrypt_failed', 'Das Geheimnis konnte nicht verschlüsselt werden.', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  clear(key: CredentialKey): Result<true> {
    this.db.prepare('DELETE FROM credentials WHERE key = ?').run(key);
    this.cache.delete(key);
    return ok(true);
  }

  status(): CredentialStatus[] {
    const rows = this.db
      .prepare('SELECT key, hint FROM credentials')
      .all<{ key: string; hint: string | null }>();
    const stored = new Map(rows.map((row) => [row.key, row.hint]));

    return CREDENTIAL_KEYS.map((key) => {
      if (stored.has(key)) {
        return { key, present: true, origin: 'store' as const, hint: stored.get(key) ?? undefined };
      }
      const envValue = this.fromEnv(key);
      if (envValue) {
        return { key, present: true, origin: 'env' as const, hint: envValue.slice(-4) };
      }
      return { key, present: false, origin: 'none' as const };
    });
  }

  /** Constant-time comparison helper for callers verifying a shared secret. */
  static equals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /** Redacts anything that looks like one of the stored secrets from a string. */
  redact(text: string): string {
    let result = text;
    for (const key of CREDENTIAL_KEYS) {
      const secret = this.get(key);
      if (secret && secret.length >= 8) {
        result = result.split(secret).join('«geheim»');
      }
    }
    return result;
  }
}
