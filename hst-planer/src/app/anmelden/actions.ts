'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { verifyPassword } from '@/lib/auth/password';
import { pruefeKennwort } from '@/lib/auth/totp';
import { clientIp, createSession, destroySession, userAgent } from '@/lib/auth/session';
import { homeFor, type Role } from '@/lib/auth/rbac';
import { feld, pflichtfeld } from '@/lib/formular';

const SCHEMA = z.object({
  email: z.string().trim().toLowerCase().email('Bitte geben Sie eine gültige E-Mail-Adresse an.'),
  passwort: z.string().min(1, 'Bitte geben Sie Ihr Passwort ein.'),
  /** Zweiter Faktor – nur gefordert, wenn das Konto einen eingerichtet hat. */
  code: z.string().trim().optional(),
});

const MAX_FEHLVERSUCHE = 8;
const SPERRE_MINUTEN = 15;

export interface AnmeldeZustand {
  fehler?: string;
  /** true, sobald Passwort stimmt und nur noch der zweite Faktor fehlt. */
  faktorNoetig?: boolean;
  /** Die Adresse zurückgeben, damit das Feld beim zweiten Schritt gefüllt bleibt. */
  email?: string;
}

export async function anmelden(_zustand: AnmeldeZustand, formData: FormData): Promise<AnmeldeZustand> {
  const eingabe = SCHEMA.safeParse({
    email: pflichtfeld(formData, 'email'),
    passwort: pflichtfeld(formData, 'passwort'),
    // Das Feld steht erst im zweiten Schritt im Formular (siehe lib/formular.ts).
    code: feld(formData, 'code'),
  });
  if (!eingabe.success) {
    return { fehler: eingabe.error.issues[0]?.message ?? 'Bitte prüfen Sie Ihre Eingaben.' };
  }

  const ip = (await clientIp()) ?? 'unbekannt';
  // Zwei Schranken: pro Adresse und pro Konto (Spec 71).
  if (!rateLimit(`login:ip:${ip}`, 20, 300).ok || !rateLimit(`login:konto:${eingabe.data.email}`, 10, 300).ok) {
    return { fehler: 'Zu viele Anmeldeversuche. Bitte warten Sie einige Minuten.' };
  }

  const user = await db.user.findUnique({ where: { email: eingabe.data.email } });

  // Immer dieselbe Meldung – sonst liesse sich herausfinden, welche
  // Adressen im System bekannt sind.
  const abgelehnt = { fehler: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' };

  if (!user || !user.active || user.deletedAt) {
    // Gleich lange Laufzeit, damit sich kein Konto am Antwortverhalten erkennen lässt.
    await verifyPassword(eingabe.data.passwort, 'scrypt$32768$8$1$AAAA$AAAA');
    return abgelehnt;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { fehler: `Das Konto ist vorübergehend gesperrt. Bitte versuchen Sie es in ${Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)} Minuten erneut.` };
  }

  if (!(await verifyPassword(eingabe.data.passwort, user.passwordHash))) {
    const fehlversuche = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: fehlversuche,
        lockedUntil: fehlversuche >= MAX_FEHLVERSUCHE ? new Date(Date.now() + SPERRE_MINUTEN * 60000) : null,
      },
    });
    await audit(null, { action: 'auth.login.failed', entity: 'User', entityId: user.id, summary: `Fehlgeschlagene Anmeldung für ${user.email}`, ip });
    return abgelehnt;
  }

  /*
    Zweiter Faktor (SecPlan 14).

    Erst hier, nach der Passwortprüfung: solange das Passwort falsch ist,
    soll nicht erkennbar sein, ob ein Konto überhaupt einen zweiten
    Faktor hat. Ein Fehlversuch beim Code zählt wie ein Fehlversuch beim
    Passwort – sonst wäre der Code allein zu billig zu raten.
  */
  if (user.totpEnabled && user.totpSecret) {
    const code = eingabe.data.code ?? '';
    if (!code) {
      return { faktorNoetig: true, email: user.email };
    }
    if (!pruefeKennwort(user.totpSecret, code)) {
      const fehlversuche = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: fehlversuche,
          lockedUntil: fehlversuche >= MAX_FEHLVERSUCHE ? new Date(Date.now() + SPERRE_MINUTEN * 60000) : null,
        },
      });
      await audit(null, {
        action: 'auth.mfa.failed', entity: 'User', entityId: user.id,
        summary: `Falscher zweiter Faktor für ${user.email}`, ip,
      });
      return { faktorNoetig: true, email: user.email, fehler: 'Der Code stimmt nicht. Bitte den aktuellen Code aus Ihrer App eingeben.' };
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, { ip, userAgent: await userAgent() });
  await audit({ id: user.id, name: user.name, email: user.email }, {
    action: 'auth.login', entity: 'User', entityId: user.id, summary: `${user.name} hat sich angemeldet`, ip,
  });

  redirect(user.mustChangePassword ? '/konto/passwort' : homeFor(user.role as Role));
}

export async function abmelden(): Promise<void> {
  await destroySession();
  redirect('/anmelden');
}
