import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, createCipheriv, createDecipheriv } from "node:crypto";
import { env } from "./env";

type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOpts): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// ---------------------------------------------------------------------------
// Passwörter: scrypt (OWASP-konform, in Node eingebaut, keine nativen Abhängigkeiten)
// Format: scrypt$N$r$p$salt$hash  (alles base64url außer Parametern)
// ---------------------------------------------------------------------------
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
      // Gleichlange Laufzeit auch ohne hinterlegtes Passwort (kein User-Enumeration-Timing).
    await scrypt("x", randomBytes(16), KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
    return false;
  }
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---------------------------------------------------------------------------
// Zufallstoken + Hashes (Sitzungen, Reset-Links, API-Schlüssel)
// ---------------------------------------------------------------------------
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Symmetrische Verschlüsselung für gespeicherte Geheimnisse (AES-256-GCM)
// Format: v1.<iv>.<tag>.<ciphertext> (base64url)
// ---------------------------------------------------------------------------
function encryptionKey(): Buffer {
  const raw = env().APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    if (env().APP_ENV === "production") throw new Error("APP_ENCRYPTION_KEY fehlt");
    // Entwicklungs-/Testschlüssel: deterministisch, aber nie für echte Daten geeignet.
    return createHash("sha256").update("disporex-dev-key-not-for-production").digest();
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(stored: string): string {
  const [v, ivB, tagB, dataB] = stored.split(".");
  if (v !== "v1" || !ivB || !tagB || !dataB) throw new Error("Ungültiges Geheimnisformat");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

/** HMAC-SHA256 für Webhook-Signaturen. */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
