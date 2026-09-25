/**
 * Zweiter Faktor nach RFC 6238 (SecPlan 14).
 *
 * Die Prüfwerte stammen aus dem Anhang B von RFC 6238. Wenn diese Tests
 * grün sind, spricht die Umsetzung dieselbe Sprache wie jede
 * Authenticator-App.
 */
import { describe, expect, it } from 'vitest';
import {
  base32Dekodieren, base32Kodieren, einrichtungsAdresse,
  geheimnisErzeugen, kennwort, pruefeKennwort,
} from '@/lib/auth/totp';

/** Das Testgeheimnis aus RFC 6238: die ASCII-Zeichen "12345678901234567890". */
const RFC_GEHEIMNIS = base32Kodieren(Buffer.from('12345678901234567890', 'utf8'));

describe('Base32', () => {
  it('kodiert und dekodiert verlustfrei', () => {
    const daten = Buffer.from('12345678901234567890', 'utf8');
    expect(base32Dekodieren(base32Kodieren(daten)).equals(daten)).toBe(true);
  });

  it('überliest Leerzeichen und Kleinschreibung', () => {
    const geheimnis = geheimnisErzeugen();
    const zerlegt = geheimnis.toLowerCase().replace(/(.{4})/g, '$1 ');
    expect(base32Dekodieren(zerlegt).equals(base32Dekodieren(geheimnis))).toBe(true);
  });
});

describe('Kennwörter nach RFC 6238', () => {
  // Anhang B, SHA-1-Spalte. Die Zeiten sind Sekunden seit 1970.
  const proben: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  for (const [sekunden, erwartet] of proben) {
    it(`stimmt bei ${sekunden} Sekunden`, () => {
      expect(kennwort(RFC_GEHEIMNIS, sekunden * 1000)).toBe(erwartet);
    });
  }
});

describe('Prüfung', () => {
  it('nimmt das aktuelle Kennwort an', () => {
    const geheimnis = geheimnisErzeugen();
    const jetzt = Date.now();
    expect(pruefeKennwort(geheimnis, kennwort(geheimnis, jetzt), jetzt)).toBe(true);
  });

  it('lässt eine Uhr durch, die ein Fenster abweicht', () => {
    const geheimnis = geheimnisErzeugen();
    const jetzt = Date.now();
    expect(pruefeKennwort(geheimnis, kennwort(geheimnis, jetzt - 30_000), jetzt)).toBe(true);
    expect(pruefeKennwort(geheimnis, kennwort(geheimnis, jetzt + 30_000), jetzt)).toBe(true);
  });

  it('weist ein Kennwort von vor zwei Minuten ab', () => {
    const geheimnis = geheimnisErzeugen();
    const jetzt = Date.now();
    expect(pruefeKennwort(geheimnis, kennwort(geheimnis, jetzt - 120_000), jetzt)).toBe(false);
  });

  it('weist Unsinn ab, ohne zu werfen', () => {
    const geheimnis = geheimnisErzeugen();
    expect(pruefeKennwort(geheimnis, '')).toBe(false);
    expect(pruefeKennwort(geheimnis, '12345')).toBe(false);
    expect(pruefeKennwort(geheimnis, 'abcdef')).toBe(false);
    expect(pruefeKennwort('', '123456')).toBe(false);
  });

  it('akzeptiert die Eingabe mit Leerzeichen, wie sie Apps anzeigen', () => {
    const geheimnis = geheimnisErzeugen();
    const jetzt = Date.now();
    const wert = kennwort(geheimnis, jetzt);
    expect(pruefeKennwort(geheimnis, `${wert.slice(0, 3)} ${wert.slice(3)}`, jetzt)).toBe(true);
  });
});

describe('Einrichtung', () => {
  it('erzeugt ein Geheimnis, das lang genug ist', () => {
    // 20 Byte ergeben 32 Base32-Zeichen.
    expect(geheimnisErzeugen()).toHaveLength(32);
    expect(geheimnisErzeugen()).not.toBe(geheimnisErzeugen());
  });

  it('baut eine otpauth-Adresse, die Apps verstehen', () => {
    const adresse = einrichtungsAdresse('JBSWY3DPEHPK3PXP', 'dispo@hermserviceteam.com');
    expect(adresse).toContain('otpauth://totp/HST%20Planer%3Adispo%40hermserviceteam.com');
    expect(adresse).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(adresse).toContain('issuer=HST+Planer');
    expect(adresse).toContain('digits=6');
    expect(adresse).toContain('period=30');
  });
});
