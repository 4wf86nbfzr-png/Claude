import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomBytes } from 'node:crypto';

/**
 * Zeitbasierte Einmalcodes nach RFC 6238 (TOTP).
 *
 * Warum das hier ueberhaupt liegt: am Telefon ist die Freigabe-PIN ein
 * brauchbarer zweiter Faktor - sie wird getippt und ist danach weg. Im Chat
 * ist sie das nicht. Eine getippte PIN bleibt im Nachrichtenverlauf stehen.
 * Wer spaeter Zugriff auf das Geraet oder das Konto hat, liest sie dort ab -
 * und damit ist sie kein Faktor mehr, sondern nur noch ein Ritual.
 *
 * Ein TOTP-Code loest genau das: er steht zwar auch im Verlauf, ist aber nach
 * einer halben Minute wertlos. Der Preis ist eine Authenticator-App auf dem
 * Handy und ein einmaliger Einrichtungsschritt.
 *
 * Bewusst ohne Fremdbibliothek: HMAC-SHA1 und Base32 sind hier zusammen
 * knapp hundert Zeilen, und eine Abhaengigkeit im Pfad der Freigabe ist ein
 * schlechter Tausch.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpOptions {
  /** Stellen des Codes. RFC-Standard und Praxis: 6. */
  readonly digits?: number;
  /** Laenge eines Zeitfensters in Sekunden. Praxis: 30. */
  readonly periodSeconds?: number;
  /**
   * Wie viele Fenster vor und nach dem aktuellen akzeptiert werden.
   * 1 faengt eine abweichende Handyuhr und die Tippdauer ab. Mehr nicht:
   * jedes zusaetzliche Fenster verlaengert die Gueltigkeit eines
   * mitgelesenen Codes.
   */
  readonly windowSteps?: number;
}

const DEFAULTS = { digits: 6, periodSeconds: 30, windowSteps: 1 } as const;

/** Erzeugt ein neues Geheimnis (160 Bit, wie von RFC 4226 empfohlen). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Der Code fuer einen Zeitpunkt. `unixSeconds` wird uebergeben statt
 * intern gelesen, damit die Tests ohne echte Uhr auskommen.
 */
export function totpCode(secretBase32: string, unixSeconds: number, options: TotpOptions = {}): string {
  const { digits, periodSeconds } = { ...DEFAULTS, ...options };
  const step = Math.floor(unixSeconds / periodSeconds);
  return codeForStep(secretBase32, step, digits);
}

/**
 * Prueft einen eingegebenen Code.
 *
 * Der Vergleich laeuft in konstanter Zeit. Das ist hier weniger wichtig als
 * bei einem Passwort - der Suchraum ist ohnehin klein -, kostet aber nichts.
 * Gegen blosses Durchprobieren hilft nicht der Vergleich, sondern die
 * Begrenzung der Versuche beim Aufrufer.
 */
export function verifyTotp(
  secretBase32: string,
  candidate: string,
  unixSeconds: number,
  options: TotpOptions = {},
): { ok: boolean; step: number | null } {
  const { digits, periodSeconds, windowSteps } = { ...DEFAULTS, ...options };
  const cleaned = candidate.replace(/\D/g, '');
  if (cleaned.length !== digits) return { ok: false, step: null };

  const current = Math.floor(unixSeconds / periodSeconds);
  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const step = current + offset;
    if (constantTimeDigitsEqual(cleaned, codeForStep(secretBase32, step, digits))) {
      return { ok: true, step };
    }
  }
  return { ok: false, step: null };
}

/**
 * Die Zeichenkette fuer den QR-Code der Authenticator-App.
 * Das Geheimnis steht darin im Klartext - diese URI gehoert deshalb auf den
 * Bildschirm und in keine Datei, kein Protokoll und keine Nachricht.
 */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Jarvis Pro'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULTS.digits),
    period: String(DEFAULTS.periodSeconds),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */

function codeForStep(secretBase32: string, step: number, digits: number): string {
  const key = base32Decode(secretBase32);
  // 8 Byte, big endian. Bis 2038 passt der Zaehler in 32 Bit; die oberen vier
  // Byte werden trotzdem korrekt gefuellt, damit es danach nicht bricht.
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac('sha1', key).update(counter).digest();
  // Dynamic truncation nach RFC 4226, Abschnitt 5.4.
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

function constantTimeDigitsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  // Leerzeichen und Polsterung werden geschluckt: Authenticator-Apps zeigen
  // das Geheimnis in Vierergruppen an, und genau so tippt man es ab.
  const cleaned = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`Ungueltiges Zeichen im Base32-Geheimnis: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
