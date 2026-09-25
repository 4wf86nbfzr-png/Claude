'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/auth/password';
import { einrichtungsAdresse, geheimnisErzeugen, pruefeKennwort } from '@/lib/auth/totp';
import { toPublicError, ValidationError } from '@/lib/errors';

export interface Ergebnis {
  fehler?: string;
  hinweis?: string;
  erfolg?: boolean;
  /** Nur beim Einrichten: das neue Geheimnis und die otpauth-Adresse. */
  geheimnis?: string;
  adresse?: string;
}

async function fuehreAus(arbeit: () => Promise<Ergebnis>): Promise<Ergebnis> {
  try {
    return await arbeit();
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    const { body } = toPublicError(error);
    return { fehler: body.error };
  }
}

/**
 * Schritt 1: ein Geheimnis erzeugen und anzeigen.
 *
 * Es wird schon gespeichert, aber mit totpEnabled=false – erst der
 * bestätigte Code schaltet es scharf. Sonst sperrt sich aus, wer den
 * QR-Code scannt und dann den Browser schließt.
 */
export async function faktorVorbereiten(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite();
    const passwort = String(formData.get('passwort') ?? '');

    const konto = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, totpEnabled: true } });
    if (!konto) throw new ValidationError('Das Konto wurde nicht gefunden.');
    if (konto.totpEnabled) throw new ValidationError('Für dieses Konto ist bereits ein zweiter Faktor eingerichtet.');
    // Das Passwort wird verlangt, damit ein fremder Browser mit offener
    // Sitzung nicht still einen eigenen zweiten Faktor hinterlegen kann.
    if (!(await verifyPassword(passwort, konto.passwordHash))) {
      throw new ValidationError('Das Passwort stimmt nicht.');
    }

    const geheimnis = geheimnisErzeugen();
    await db.user.update({ where: { id: user.id }, data: { totpSecret: geheimnis, totpEnabled: false } });

    return {
      erfolg: true,
      geheimnis,
      adresse: einrichtungsAdresse(geheimnis, user.email),
      hinweis: 'Bitte jetzt in der App einrichten und den ersten Code unten bestätigen.',
    };
  });
}

/** Schritt 2: den ersten Code bestätigen – erst damit gilt der Faktor. */
export async function faktorBestaetigen(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite();
    const code = String(formData.get('code') ?? '');

    const konto = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true, totpEnabled: true } });
    if (!konto?.totpSecret) throw new ValidationError('Es ist kein Geheimnis hinterlegt. Bitte zuerst die Einrichtung starten.');
    if (konto.totpEnabled) throw new ValidationError('Der zweite Faktor ist bereits aktiv.');
    if (!pruefeKennwort(konto.totpSecret, code)) {
      throw new ValidationError('Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.');
    }

    await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    await audit(user, {
      action: 'auth.mfa.enabled', entity: 'User', entityId: user.id,
      summary: `${user.name} hat einen zweiten Faktor eingerichtet`, ip: await clientIp(),
    });
    revalidatePath('/konto/sicherheit');
    return { erfolg: true, hinweis: 'Der zweite Faktor ist aktiv. Ab der nächsten Anmeldung wird er verlangt.' };
  });
}

/**
 * Abschalten – nur mit Passwort UND gültigem Code.
 *
 * Wer nur das Passwort hat, soll den zweiten Faktor nicht entfernen
 * können; genau davor soll er ja schützen. Wer die App verloren hat,
 * wendet sich an die Systemadministration.
 */
export async function faktorAbschalten(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite();
    const passwort = String(formData.get('passwort') ?? '');
    const code = String(formData.get('code') ?? '');

    const konto = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, totpSecret: true, totpEnabled: true } });
    if (!konto?.totpEnabled || !konto.totpSecret) throw new ValidationError('Für dieses Konto ist kein zweiter Faktor aktiv.');
    if (!(await verifyPassword(passwort, konto.passwordHash))) throw new ValidationError('Das Passwort stimmt nicht.');
    if (!pruefeKennwort(konto.totpSecret, code)) throw new ValidationError('Der Code stimmt nicht.');

    await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
    await audit(user, {
      action: 'auth.mfa.disabled', entity: 'User', entityId: user.id,
      summary: `${user.name} hat den zweiten Faktor abgeschaltet`, ip: await clientIp(),
    });
    revalidatePath('/konto/sicherheit');
    return { erfolg: true, hinweis: 'Der zweite Faktor ist abgeschaltet.' };
  });
}

/** Alle anderen Sitzungen beenden – nach einem Verdacht der erste Schritt. */
export async function sitzungenBeenden(_zustand: Ergebnis): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite();
    const { count } = await db.session.updateMany({
      where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(user, {
      action: 'auth.sessions.revoked', entity: 'User', entityId: user.id,
      summary: `${user.name} hat ${count} weitere Sitzungen beendet`, ip: await clientIp(),
    });
    revalidatePath('/konto/sicherheit');
    return {
      erfolg: true,
      hinweis: count === 0 ? 'Es war keine weitere Sitzung offen.' : `${count} weitere ${count === 1 ? 'Sitzung wurde' : 'Sitzungen wurden'} beendet.`,
    };
  });
}
