import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

/**
 * Passwort-Hashing mit scrypt aus der Node-Standardbibliothek.
 * Kein natives Zusatzpaket nötig, und die Parameter stehen im Hash,
 * sodass sie später erhöht werden können, ohne Altbestand zu brechen.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface PasswordCheck { ok: boolean; message?: string }

/** Mindestanforderungen (Spec 48/71) – bewusst Laenge statt Zeichenakrobatik. */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < 12) return { ok: false, message: 'Das Passwort muss mindestens 12 Zeichen lang sein.' };
  if (password.length > 200) return { ok: false, message: 'Das Passwort ist zu lang.' };
  const weak = ['passwort', 'password', '123456', 'qwertz', 'hstplaner', 'hermservice'];
  const lower = password.toLowerCase();
  if (weak.some((w) => lower.includes(w))) {
    return { ok: false, message: 'Das Passwort enthält einen zu einfachen Bestandteil.' };
  }
  if (new Set(password).size < 5) return { ok: false, message: 'Bitte verwenden Sie mehr unterschiedliche Zeichen.' };
  return { ok: true };
}
