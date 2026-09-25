/**
 * Passwort zurücksetzen (SecPlan 14).
 *
 * Die interessanten Fälle sind die, in denen nichts passieren darf:
 * unbekannte Adresse, abgelaufener Link, zweiter Aufruf desselben Links.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './hilfen/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  passwortNeuSetzen, tokenAufraeumen, tokenPruefen, zuruecksetzenAnfordern,
} from '@/lib/auth/zuruecksetzen';

const MARKE = `RESET-${Date.now()}`;
const EMAIL = `${MARKE}@example.org`.toLowerCase();
const BASIS = 'https://planer.example.org';
let userId = '';

beforeAll(async () => {
  const benutzer = await db.user.create({
    data: {
      email: EMAIL, name: `Test ${MARKE}`, role: 'MITARBEITER',
      passwordHash: await hashPassword('Blankenese-Hang!7421'),
    },
  });
  userId = benutzer.id;
});

afterAll(async () => {
  await db.passwordReset.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { entityId: userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
});

/** Holt den zuletzt erzeugten Klartext-Token aus dem Rückgabewert. */
async function token(): Promise<string> {
  const ergebnis = await zuruecksetzenAnfordern(EMAIL, BASIS, '127.0.0.1');
  expect(ergebnis.tokenFuerProtokoll).toBeDefined();
  return ergebnis.tokenFuerProtokoll!;
}

describe('Anfordern', () => {
  it('legt einen Eintrag an und gibt den Token nur intern heraus', async () => {
    const wert = await token();
    expect(wert).toMatch(/^[0-9a-f]{64}$/);
    // In der Datenbank steht nur der Hash.
    const eintraege = await db.passwordReset.findMany({ where: { userId } });
    expect(eintraege.length).toBeGreaterThan(0);
    for (const eintrag of eintraege) expect(eintrag.tokenHash).not.toBe(wert);
  });

  it('verrät bei einer unbekannten Adresse nichts', async () => {
    const ergebnis = await zuruecksetzenAnfordern('gibt-es-nicht@example.org', BASIS, '127.0.0.1');
    expect(ergebnis.versendet).toBe(false);
    expect(ergebnis.tokenFuerProtokoll).toBeUndefined();
  });

  it('entwertet einen älteren offenen Link', async () => {
    const alt = await token();
    const neu = await token();
    expect(await tokenPruefen(alt)).toBeNull();
    expect(await tokenPruefen(neu)).not.toBeNull();
  });

  it('tut für einen gesperrten Zugang nichts', async () => {
    await db.user.update({ where: { id: userId }, data: { active: false } });
    const ergebnis = await zuruecksetzenAnfordern(EMAIL, BASIS, '127.0.0.1');
    expect(ergebnis.tokenFuerProtokoll).toBeUndefined();
    await db.user.update({ where: { id: userId }, data: { active: true } });
  });
});

describe('Einlösen', () => {
  it('setzt das Passwort und beendet alle Sitzungen', async () => {
    await db.session.create({
      data: { userId, tokenHash: `sitzung-${Date.now()}`, expiresAt: new Date(Date.now() + 86400000) },
    });

    const wert = await token();
    await passwortNeuSetzen(wert, 'Elbchaussee-Wind!3308', '127.0.0.1');

    const benutzer = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword('Elbchaussee-Wind!3308', benutzer.passwordHash)).toBe(true);
    expect(benutzer.mustChangePassword).toBe(false);
    expect(benutzer.failedLogins).toBe(0);

    const offen = await db.session.count({ where: { userId, revokedAt: null } });
    expect(offen).toBe(0);
  });

  it('nimmt denselben Link kein zweites Mal', async () => {
    const wert = await token();
    await passwortNeuSetzen(wert, 'Landungsbruecken!5517');
    await expect(passwortNeuSetzen(wert, 'Speicherstadt-Kai!9142')).rejects.toThrow(/gilt nicht mehr/);
  });

  it('nimmt keinen abgelaufenen Link', async () => {
    const wert = await token();
    await db.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await tokenPruefen(wert)).toBeNull();
    await expect(passwortNeuSetzen(wert, 'Alsterfleet-Steg!6285')).rejects.toThrow(/gilt nicht mehr/);
  });

  it('nimmt keinen erfundenen Link', async () => {
    await expect(passwortNeuSetzen('a'.repeat(64), 'Michel-Turmblick!4073')).rejects.toThrow(/gilt nicht mehr/);
    await expect(passwortNeuSetzen('unsinn', 'Reeperbahn-Nacht!8316')).rejects.toThrow(/gilt nicht mehr/);
    expect(await tokenPruefen('unsinn')).toBeNull();
  });

  it('prüft das neue Passwort auf Stärke, bevor der Link verbraucht wird', async () => {
    // Die Reihenfolge ist Absicht: erst die Stärke, dann der Token.
    // Sonst verbrennt ein Tippfehler im Passwortfeld den Link.
    const wert = await token();
    await expect(passwortNeuSetzen(wert, 'kurz')).rejects.toThrow();
    // Der Link gilt weiter – ein zu kurzes Passwort soll ihn nicht verbrennen.
    expect(await tokenPruefen(wert)).not.toBeNull();
  });
});

describe('Aufräumen', () => {
  it('entfernt abgelaufene und verbrauchte Einträge', async () => {
    await token();
    await db.passwordReset.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const entfernt = await tokenAufraeumen();
    expect(entfernt).toBeGreaterThan(0);
    expect(await db.passwordReset.count({ where: { userId } })).toBe(0);
  });
});
