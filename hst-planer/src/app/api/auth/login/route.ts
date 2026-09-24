import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { ok, parseBody, route } from '@/lib/api';
import { AuthError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { verifyPassword } from '@/lib/auth/password';
import { clientIp, createSession, userAgent } from '@/lib/auth/session';
import { homeFor, type Role } from '@/lib/auth/rbac';

const SCHEMA = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Anmeldung fuer Skripte und die spaetere native App.
 * Setzt dasselbe Sitzungs-Cookie wie das Anmeldeformular.
 */
export const POST = route(async (request: Request) => {
  const eingabe = await parseBody(request, SCHEMA);
  const ip = (await clientIp()) ?? 'unbekannt';

  if (!rateLimit(`api-login:${ip}`, 20, 300).ok || !rateLimit(`api-login:konto:${eingabe.email}`, 10, 300).ok) {
    return NextResponse.json({ error: 'Zu viele Anmeldeversuche. Bitte warten Sie einige Minuten.', code: 'ZU_VIELE_ANFRAGEN' }, { status: 429 });
  }

  const user = await db.user.findUnique({ where: { email: eingabe.email } });
  const abgelehnt = new AuthError('E-Mail-Adresse oder Passwort ist nicht korrekt.');

  if (!user || !user.active || user.deletedAt) {
    await verifyPassword(eingabe.password, 'scrypt$32768$8$1$AAAA$AAAA');
    throw abgelehnt;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('Das Konto ist voruebergehend gesperrt.');
  }
  if (!(await verifyPassword(eingabe.password, user.passwordHash))) {
    const fehlversuche = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: fehlversuche, lockedUntil: fehlversuche >= 8 ? new Date(Date.now() + 15 * 60000) : null },
    });
    await audit(null, { action: 'auth.login.failed', entity: 'User', entityId: user.id, summary: `Fehlgeschlagene Anmeldung (API) fuer ${user.email}`, ip });
    throw abgelehnt;
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, { ip, userAgent: await userAgent() });
  await audit({ id: user.id, name: user.name, email: user.email }, {
    action: 'auth.login', entity: 'User', entityId: user.id, summary: `${user.name} hat sich ueber die API angemeldet`, ip,
  });

  return ok({
    benutzer: { id: user.id, name: user.name, email: user.email, rolle: user.role },
    startseite: homeFor(user.role as Role),
    passwortAendern: user.mustChangePassword,
  });
});
