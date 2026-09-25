import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Zweiter Faktor nach RFC 6238 (SecPlan 14).
 *
 * Zeitbasierte Einmalkennwörter, wie sie jede gängige Authenticator-App
 * erzeugt. Bewusst ohne Zusatzpaket: der Algorithmus ist ein HMAC über
 * einen Zähler, das sind zwanzig Zeilen – und eine Abhängigkeit weniger
 * an einer Stelle, an der Abhängigkeiten teuer sind.
 */

const ZEITFENSTER = 30;        // Sekunden je Kennwort
const STELLEN = 6;
const TOLERANZ = 1;            // ein Fenster vor und nach jetzt

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Kodieren(daten: Buffer): string {
  let bits = 0;
  let wert = 0;
  let aus = '';
  for (const byte of daten) {
    wert = (wert << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      aus += BASE32[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) aus += BASE32[(wert << (5 - bits)) & 31];
  return aus;
}

export function base32Dekodieren(text: string): Buffer {
  const sauber = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let wert = 0;
  const bytes: number[] = [];
  for (const zeichen of sauber) {
    const index = BASE32.indexOf(zeichen);
    if (index < 0) continue;
    wert = (wert << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((wert >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Erzeugt ein neues Geheimnis (160 Bit, wie in RFC 4226 empfohlen). */
export function geheimnisErzeugen(): string {
  return base32Kodieren(randomBytes(20));
}

/** Das Kennwort für einen bestimmten Zähler. */
function kennwortFuer(geheimnis: Buffer, zaehler: number): string {
  const puffer = Buffer.alloc(8);
  puffer.writeBigUInt64BE(BigInt(zaehler));
  const hmac = createHmac('sha1', geheimnis).update(puffer).digest();
  // Dynamic Truncation nach RFC 4226 Abschnitt 5.3
  const versatz = hmac[hmac.length - 1]! & 0x0f;
  const zahl = ((hmac[versatz]! & 0x7f) << 24)
    | ((hmac[versatz + 1]! & 0xff) << 16)
    | ((hmac[versatz + 2]! & 0xff) << 8)
    | (hmac[versatz + 3]! & 0xff);
  return String(zahl % 10 ** STELLEN).padStart(STELLEN, '0');
}

/** Das aktuelle Kennwort – für Tests und für die Einrichtungshilfe. */
export function kennwort(geheimnisBase32: string, zeitMs: number = Date.now()): string {
  const zaehler = Math.floor(zeitMs / 1000 / ZEITFENSTER);
  return kennwortFuer(base32Dekodieren(geheimnisBase32), zaehler);
}

/**
 * Prüft eine Eingabe. Ein Fenster Toleranz in beide Richtungen fängt
 * abweichend gehende Uhren ab; mehr wäre eine Einladung.
 *
 * Der Vergleich läuft über timingSafeEqual, damit die Antwortzeit nichts
 * über die Richtigkeit einzelner Stellen verrät.
 */
export function pruefeKennwort(geheimnisBase32: string, eingabe: string, zeitMs: number = Date.now()): boolean {
  const sauber = eingabe.replace(/\D/g, '');
  if (sauber.length !== STELLEN) return false;

  const geheimnis = base32Dekodieren(geheimnisBase32);
  if (geheimnis.length === 0) return false;

  const jetzt = Math.floor(zeitMs / 1000 / ZEITFENSTER);
  const eingabePuffer = Buffer.from(sauber, 'utf8');

  let treffer = false;
  for (let versatz = -TOLERANZ; versatz <= TOLERANZ; versatz += 1) {
    const erwartet = Buffer.from(kennwortFuer(geheimnis, jetzt + versatz), 'utf8');
    // Nicht früh abbrechen: alle Fenster werden geprüft, damit die
    // Laufzeit nicht verrät, welches gepasst hat.
    if (erwartet.length === eingabePuffer.length && timingSafeEqual(erwartet, eingabePuffer)) treffer = true;
  }
  return treffer;
}

/**
 * Die Adresse für den QR-Code der Authenticator-App.
 * Das Geheimnis steht darin – sie gehört nie in ein Protokoll.
 */
export function einrichtungsAdresse(geheimnis: string, konto: string, herausgeber = 'HST Planer'): string {
  const kennung = encodeURIComponent(`${herausgeber}:${konto}`);
  const parameter = new URLSearchParams({
    secret: geheimnis,
    issuer: herausgeber,
    algorithm: 'SHA1',
    digits: String(STELLEN),
    period: String(ZEITFENSTER),
  });
  return `otpauth://totp/${kennung}?${parameter.toString()}`;
}
