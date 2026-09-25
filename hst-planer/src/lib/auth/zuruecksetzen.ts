import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db';
import { audit } from '../audit';
import { hashPassword, checkPasswordStrength } from './password';
import { emailSenden, versandKonfiguriert } from '../email/versand';
import { ValidationError } from '../errors';

/**
 * Passwort zurücksetzen (SecPlan 14).
 *
 * Drei Grundsätze:
 *
 *  1. **Kein Rückschluss auf vorhandene Konten.** Die Antwort ist immer
 *     dieselbe, ob die Adresse bekannt ist oder nicht. Sonst wäre das
 *     Formular eine Auskunft darüber, wer hier ein Konto hat.
 *  2. **Nur der Hash wird gespeichert.** Wer die Datenbank liest, kommt
 *     damit in kein Konto.
 *  3. **Ein Token gilt eine Stunde und genau einmal.** Beim Einlösen
 *     werden außerdem alle Sitzungen beendet – wer das Passwort
 *     zurücksetzt, hat meist einen Grund dafür.
 */

export const GUELTIG_MINUTEN = 60;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AnforderungsErgebnis {
  /** Nur für die Entwicklung ohne Mailversand – nie in die Antwort an den Browser. */
  tokenFuerProtokoll?: string;
  versendet: boolean;
}

export async function zuruecksetzenAnfordern(
  email: string,
  basisAdresse: string,
  ip?: string,
): Promise<AnforderungsErgebnis> {
  const benutzer = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, active: true, deletedAt: true },
  });

  // Unbekannt, gesperrt oder gelöscht: nichts tun, aber genauso antworten.
  if (!benutzer || !benutzer.active || benutzer.deletedAt) {
    await audit(null, {
      action: 'auth.reset.unbekannt', entity: 'User',
      summary: `Zurücksetzen für eine unbekannte oder gesperrte Adresse angefordert`, ip,
    });
    return { versendet: false };
  }

  // Ältere offene Token derselben Person entwerten.
  await db.passwordReset.updateMany({
    where: { userId: benutzer.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomBytes(32).toString('hex');
  await db.passwordReset.create({
    data: {
      tokenHash: hash(token),
      userId: benutzer.id,
      expiresAt: new Date(Date.now() + GUELTIG_MINUTEN * 60_000),
      ip: ip ?? null,
    },
  });

  await audit(null, {
    action: 'auth.reset.angefordert', entity: 'User', entityId: benutzer.id,
    summary: `${benutzer.name} hat das Zurücksetzen des Passworts angefordert`, ip,
  });

  const adresse = `${basisAdresse.replace(/\/$/, '')}/passwort-neu?token=${token}`;

  if (!versandKonfiguriert()) {
    // Ohne eingerichteten Versand geht nichts hinaus. Der Token wandert
    // in die Serverkonsole, damit sich der Weg in der Entwicklung
    // ausprobieren lässt – niemals in die Antwort an den Browser.
    console.warn(`[Passwort zurücksetzen] Kein SMTP eingerichtet. Link für ${benutzer.email}: ${adresse}`);
    return { versendet: false, tokenFuerProtokoll: token };
  }

  await emailSenden({
    an: benutzer.email,
    betreff: 'HST Planer – Passwort zurücksetzen',
    text: [
      `Hallo ${benutzer.name},`,
      '',
      'für Ihren Zugang zum HST Planer wurde ein neues Passwort angefordert.',
      'Über den folgenden Link können Sie eines vergeben:',
      '',
      adresse,
      '',
      `Der Link gilt ${GUELTIG_MINUTEN} Minuten und genau einmal.`,
      '',
      'Waren Sie das nicht, ist nichts passiert – der Link läuft von selbst ab.',
      'Melden Sie sich in dem Fall bitte trotzdem bei der Administration.',
      '',
      'HERM Service Team e.K.',
    ].join('\n'),
  });

  return { versendet: true };
}

export interface EinloesungsErgebnis {
  userId: string;
  name: string;
}

/** Prüft einen Token, ohne ihn zu verbrauchen – für die Anzeige des Formulars. */
export async function tokenPruefen(token: string): Promise<EinloesungsErgebnis | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const eintrag = await db.passwordReset.findUnique({ where: { tokenHash: hash(token) } });
  if (!eintrag || eintrag.usedAt || eintrag.expiresAt < new Date()) return null;

  const benutzer = await db.user.findFirst({
    where: { id: eintrag.userId, active: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!benutzer) return null;
  return { userId: benutzer.id, name: benutzer.name };
}

/** Löst den Token ein und setzt das neue Passwort. */
export async function passwortNeuSetzen(token: string, neu: string, ip?: string): Promise<void> {
  const staerke = checkPasswordStrength(neu);
  if (!staerke.ok) throw new ValidationError(staerke.message!);

  // Absichtlich dieselbe Meldung für abgelaufen, verbraucht und unbekannt.
  const ungueltig = new ValidationError(
    'Dieser Link gilt nicht mehr. Bitte fordern Sie das Zurücksetzen erneut an.',
  );

  if (!/^[0-9a-f]{64}$/.test(token)) throw ungueltig;
  const eintrag = await db.passwordReset.findUnique({ where: { tokenHash: hash(token) } });
  if (!eintrag || eintrag.usedAt || eintrag.expiresAt < new Date()) throw ungueltig;

  const benutzer = await db.user.findFirst({
    where: { id: eintrag.userId, active: true, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (!benutzer) throw ungueltig;

  await db.$transaction([
    db.passwordReset.update({ where: { id: eintrag.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: benutzer.id },
      data: {
        passwordHash: await hashPassword(neu),
        mustChangePassword: false,
        failedLogins: 0,
        lockedUntil: null,
      },
    }),
    // Wer sein Passwort zurücksetzt, hat meist einen Grund. Alle
    // Sitzungen enden – auch die, von der niemand weiß.
    db.session.updateMany({
      where: { userId: benutzer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await audit({ id: benutzer.id, name: benutzer.name, email: benutzer.email }, {
    action: 'auth.reset.eingeloest', entity: 'User', entityId: benutzer.id,
    summary: `${benutzer.name} hat das Passwort über einen Zurücksetz-Link neu vergeben`, ip,
  });
}

/** Abgelaufene Token aufräumen – läuft mit den täglichen Aufgaben. */
export async function tokenAufraeumen(): Promise<number> {
  const { count } = await db.passwordReset.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  });
  return count;
}
