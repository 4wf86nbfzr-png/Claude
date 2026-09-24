'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { toPublicError, ValidationError } from '@/lib/errors';
import { checkPasswordStrength, hashPassword } from '@/lib/auth/password';
import { generateApiKey } from '@/lib/auth/apikey';
import { WEBHOOK_EVENTS } from '@/lib/webhooks';
import { randomBytes } from 'node:crypto';
import type { $Enums } from '@prisma/client';

export interface Ergebnis { fehler?: string; hinweis?: string; geheimnis?: string; erfolg?: boolean }

async function fuehreAus(arbeit: () => Promise<Ergebnis | void>): Promise<Ergebnis> {
  try {
    return (await arbeit()) ?? { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

export async function benutzerAnlegenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.users');
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const name = String(formData.get('name') ?? '').trim();
    const passwort = String(formData.get('passwort') ?? '');
    const rolle = String(formData.get('rolle') ?? 'MITARBEITER') as $Enums.Role;

    if (!email.includes('@')) throw new ValidationError('Bitte geben Sie eine gueltige E-Mail-Adresse an.');
    if (name.length < 2) throw new ValidationError('Bitte geben Sie einen Namen an.');
    const staerke = checkPasswordStrength(passwort);
    if (!staerke.ok) throw new ValidationError(staerke.message!);
    if (await db.user.findUnique({ where: { email } })) throw new ValidationError('Diese E-Mail-Adresse wird bereits verwendet.');

    const neu = await db.user.create({
      data: {
        email, name, role: rolle,
        passwordHash: await hashPassword(passwort),
        mustChangePassword: true,
        employeeId: String(formData.get('employeeId') ?? '') || null,
        partnerId: String(formData.get('partnerId') ?? '') || null,
        customerId: String(formData.get('customerId') ?? '') || null,
      },
    });
    await audit(user, { action: 'user.create', entity: 'User', entityId: neu.id, summary: `Benutzer ${email} (${rolle}) angelegt` });
    revalidatePath('/admin');
    return { erfolg: true, hinweis: `Benutzer ${email} angelegt. Das Passwort muss bei der ersten Anmeldung geaendert werden.` };
  });
}

export async function benutzerAendernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.users');
    const id = String(formData.get('id'));
    const konto = await db.user.findUnique({ where: { id } });
    if (!konto) throw new ValidationError('Der Benutzer wurde nicht gefunden.');

    const rolle = String(formData.get('rolle') ?? konto.role) as $Enums.Role;
    const aktiv = formData.get('aktiv') === 'on';

    if (konto.id === user.id && (!aktiv || rolle !== 'ADMIN') && konto.role === 'ADMIN') {
      throw new ValidationError('Sie koennen sich nicht selbst die Administrationsrechte entziehen.');
    }
    if (!aktiv) {
      const verbleibendeAdmins = await db.user.count({ where: { role: 'ADMIN', active: true, deletedAt: null, id: { not: id } } });
      if (konto.role === 'ADMIN' && verbleibendeAdmins === 0) {
        throw new ValidationError('Es muss mindestens ein aktiver Administrationszugang bestehen bleiben.');
      }
    }

    await db.user.update({ where: { id }, data: { role: rolle, active: aktiv } });
    if (!aktiv) await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

    await audit(user, {
      action: 'user.update', entity: 'User', entityId: id,
      summary: `Benutzer ${konto.email}: Rolle ${konto.role} → ${rolle}, ${aktiv ? 'aktiv' : 'gesperrt'}`,
      before: { rolle: konto.role, aktiv: konto.active }, after: { rolle, aktiv },
    });
    revalidatePath('/admin');
    return { erfolg: true, hinweis: 'Benutzer aktualisiert.' };
  });
}

export async function passwortZuruecksetzenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.users');
    const id = String(formData.get('id'));
    const konto = await db.user.findUnique({ where: { id } });
    if (!konto) throw new ValidationError('Der Benutzer wurde nicht gefunden.');

    // Startpasswort wird erzeugt, nicht vom Administrator gewaehlt.
    const neu = `${randomBytes(9).toString('base64url')}-HST`;
    await db.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(neu), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
    });
    await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(user, { action: 'user.reset_password', entity: 'User', entityId: id, summary: `Passwort fuer ${konto.email} zurueckgesetzt` });
    revalidatePath('/admin');
    return { erfolg: true, geheimnis: neu, hinweis: `Neues Startpasswort fuer ${konto.email}: ${neu} — bitte persoenlich uebergeben. Es wird nicht erneut angezeigt.` };
  });
}

export async function apiSchluesselAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.api');
    const name = String(formData.get('name') ?? '').trim();
    if (name.length < 3) throw new ValidationError('Bitte geben Sie dem Schluessel einen Namen.');

    const scopes = formData.getAll('scopes').map(String).filter(Boolean);
    const erzeugt = generateApiKey();
    await db.apiKey.create({
      data: { name, prefix: erzeugt.prefix, keyHash: erzeugt.keyHash, scopes, createdById: user.id },
    });
    await audit(user, { action: 'apikey.create', entity: 'ApiKey', summary: `API-Schluessel "${name}" erzeugt (${scopes.join(', ') || 'alle Bereiche'})` });
    revalidatePath('/admin');
    return { erfolg: true, geheimnis: erzeugt.plain, hinweis: `Schluessel: ${erzeugt.plain} — bitte jetzt kopieren, er wird nicht erneut angezeigt.` };
  });
}

export async function apiSchluesselSperrenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.api');
    const id = String(formData.get('id'));
    const schluessel = await db.apiKey.findUnique({ where: { id } });
    if (!schluessel) throw new ValidationError('Der Schluessel wurde nicht gefunden.');
    await db.apiKey.update({ where: { id }, data: { active: false } });
    await audit(user, { action: 'apikey.revoke', entity: 'ApiKey', entityId: id, summary: `API-Schluessel "${schluessel.name}" gesperrt` });
    revalidatePath('/admin');
    return { erfolg: true, hinweis: 'Schluessel gesperrt.' };
  });
}

export async function webhookAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.api');
    const name = String(formData.get('name') ?? '').trim();
    const url = String(formData.get('url') ?? '').trim();
    if (name.length < 3) throw new ValidationError('Bitte geben Sie dem Webhook einen Namen.');
    if (!/^https:\/\//.test(url)) throw new ValidationError('Die Zieladresse muss mit https:// beginnen.');

    const events = formData.getAll('events').map(String).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (events.length === 0) throw new ValidationError('Bitte waehlen Sie mindestens ein Ereignis.');

    const geheimnis = randomBytes(24).toString('base64url');
    await db.webhook.create({ data: { name, url, events, secret: geheimnis } });
    await audit(user, { action: 'webhook.create', entity: 'Webhook', summary: `Webhook "${name}" auf ${url} angelegt` });
    revalidatePath('/admin');
    return { erfolg: true, geheimnis, hinweis: `Signaturgeheimnis: ${geheimnis} — bitte beim Empfaenger hinterlegen.` };
  });
}

export async function webhookEntfernenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('admin.api');
    const id = String(formData.get('id'));
    const webhook = await db.webhook.findUnique({ where: { id } });
    if (!webhook) throw new ValidationError('Der Webhook wurde nicht gefunden.');
    await db.webhook.delete({ where: { id } });
    await audit(user, { action: 'webhook.delete', entity: 'Webhook', entityId: id, summary: `Webhook "${webhook.name}" entfernt` });
    revalidatePath('/admin');
    return { erfolg: true, hinweis: 'Webhook entfernt.' };
  });
}
