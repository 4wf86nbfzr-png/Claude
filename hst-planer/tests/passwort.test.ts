/**
 * Passwort-Hashing und Staerkepruefung (Spec 48/71).
 */
import { describe, expect, it } from 'vitest';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateApiKey } from '@/lib/auth/apikey';
import { signPayload, verifySignature } from '@/lib/webhooks';

describe('Passwörter', () => {
  it('erzeugt bei gleichem Passwort unterschiedliche Hashes', async () => {
    const a = await hashPassword('Hafencity!2026');
    const b = await hashPassword('Hafencity!2026');
    expect(a).not.toBe(b);           // eigener Zufallswert je Hash
    expect(a.startsWith('scrypt$')).toBe(true);
  });

  it('prüft Passwörter korrekt', async () => {
    const hash = await hashPassword('Hafencity!2026');
    expect(await verifyPassword('Hafencity!2026', hash)).toBe(true);
    expect(await verifyPassword('hafencity!2026', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('fällt bei beschaedigten Hashes nicht um', async () => {
    expect(await verifyPassword('irgendwas', 'kaputt')).toBe(false);
    expect(await verifyPassword('irgendwas', 'scrypt$x$y$z$AAAA$AAAA')).toBe(false);
  });

  it('verlangt eine Mindestlaenge und lehnt Offensichtliches ab', () => {
    expect(checkPasswordStrength('kurz').ok).toBe(false);
    expect(checkPasswordStrength('passwort1234567').ok).toBe(false);
    expect(checkPasswordStrength('aaaaaaaaaaaaaaa').ok).toBe(false);
    expect(checkPasswordStrength('Hafencity im Nebel').ok).toBe(true);
  });
});

describe('API-Schlüssel', () => {
  it('haben ein erkennbares Format und werden nur als Hash gespeichert', () => {
    const schluessel = generateApiKey();
    expect(schluessel.plain.startsWith('hst_')).toBe(true);
    expect(schluessel.plain.split('_')).toHaveLength(3);
    expect(schluessel.keyHash).toHaveLength(64);
    expect(schluessel.keyHash).not.toContain(schluessel.plain);
  });

  it('erzeugt bei jedem Aufruf einen anderen Schlüssel', () => {
    expect(generateApiKey().plain).not.toBe(generateApiKey().plain);
  });
});

describe('Webhook-Signatur', () => {
  it('signiert und prüft einen Rumpf', () => {
    const geheimnis = 'testgeheimnis';
    const zeit = 1_700_000_000;
    const rumpf = JSON.stringify({ event: 'request.created' });
    const signatur = signPayload(geheimnis, zeit, rumpf);

    expect(verifySignature(geheimnis, zeit, rumpf, signatur)).toBe(true);
    expect(verifySignature('anderes', zeit, rumpf, signatur)).toBe(false);
    expect(verifySignature(geheimnis, zeit + 1, rumpf, signatur)).toBe(false);
    expect(verifySignature(geheimnis, zeit, `${rumpf} `, signatur)).toBe(false);
  });
});
