import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/**
 * Secret Store. Geheimnisse liegen nie im Repository und nach Moeglichkeit
 * auch nicht in einer .env-Datei, sondern im Schluesselbund des Betriebssystems.
 *
 *  - macOS:  `security` (Keychain)
 *  - Linux:  `secret-tool` (libsecret / GNOME Keyring)
 *  - Fallback fuer Entwicklung/Tests: Umgebungsvariablen bzw. Speicher
 *
 * Das Sprachmodell erhaelt niemals einen Verweis auf dieses Modul. Es gibt kein
 * Tool, ueber das ein Geheimnis abgefragt werden koennte.
 */
export interface SecretStore {
  readonly kind: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Nur Schluesselnamen, nie Werte. Fuer `pnpm doctor`. */
  has(key: string): Promise<boolean>;
}

const SERVICE = 'de.hermservice.jarvis-pro';

export class KeychainSecretStore implements SecretStore {
  readonly kind = 'macos-keychain';

  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await exec('security', [
        'find-generic-password',
        '-s',
        SERVICE,
        '-a',
        key,
        '-w',
      ]);
      return stdout.replace(/\n$/, '');
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    // -U aktualisiert einen bestehenden Eintrag, statt zu scheitern.
    // Der Wert geht ueber argv - auf einem Einzelplatzrechner akzeptabel,
    // in `scripts/` wird deshalb immer interaktiv eingelesen, nie aus der Historie.
    await exec('security', [
      'add-generic-password',
      '-U',
      '-s',
      SERVICE,
      '-a',
      key,
      '-w',
      value,
    ]);
  }

  async delete(key: string): Promise<void> {
    try {
      await exec('security', ['delete-generic-password', '-s', SERVICE, '-a', key]);
    } catch {
      /* nicht vorhanden ist in Ordnung */
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}

export class LibsecretSecretStore implements SecretStore {
  readonly kind = 'linux-libsecret';

  async get(key: string): Promise<string | null> {
    try {
      const { stdout } = await exec('secret-tool', ['lookup', 'service', SERVICE, 'account', key]);
      return stdout.replace(/\n$/, '');
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        'secret-tool',
        ['store', '--label', `${SERVICE}:${key}`, 'service', SERVICE, 'account', key],
        (err) => (err ? reject(err) : resolve()),
      );
      child.stdin?.end(value);
    });
  }

  async delete(key: string): Promise<void> {
    try {
      await exec('secret-tool', ['clear', 'service', SERVICE, 'account', key]);
    } catch {
      /* nicht vorhanden ist in Ordnung */
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}

/** Nur fuer lokale Entwicklung und Tests. Schreiben ist bewusst fluechtig. */
export class EnvSecretStore implements SecretStore {
  readonly kind = 'env';
  private readonly overrides = new Map<string, string>();

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private envName(key: string): string {
    return key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  }

  async get(key: string): Promise<string | null> {
    const o = this.overrides.get(key);
    if (o !== undefined) return o;
    return this.env[this.envName(key)] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.overrides.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.overrides.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}

export class MemorySecretStore implements SecretStore {
  readonly kind = 'memory';
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }
}

/**
 * Waehlt den Store passend zur Plattform, faellt auf Umgebungsvariablen zurueck,
 * wenn kein Schluesselbund erreichbar ist.
 */
export async function detectSecretStore(): Promise<SecretStore> {
  if (process.platform === 'darwin') {
    try {
      await exec('security', ['-h']);
      return new KeychainSecretStore();
    } catch {
      /* weiter unten */
    }
  }
  if (process.platform === 'linux') {
    try {
      await exec('secret-tool', ['--help']);
      return new LibsecretSecretStore();
    } catch {
      /* weiter unten */
    }
  }
  return new EnvSecretStore();
}

/** Kanonische Schluesselnamen. Zentral, damit sie sich nicht auseinanderlaufen. */
export const SECRET_KEYS = {
  anthropicApiKey: 'anthropic-api-key',
  msRefreshToken: 'ms-refresh-token',
  msClientId: 'ms-client-id',
  googleRefreshToken: 'google-refresh-token',
  whatsappAccessToken: 'whatsapp-access-token',
  whatsappAppSecret: 'whatsapp-app-secret',
  whatsappVerifyToken: 'whatsapp-verify-token',
  ariPassword: 'ari-password',
  loginPinHash: 'login-pin-hash',
  approvalPinHash: 'approval-pin-hash',
  dbEncryptionKey: 'db-encryption-key',
} as const;

export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];
