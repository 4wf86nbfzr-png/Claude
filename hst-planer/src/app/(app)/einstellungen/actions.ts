'use server';

import { revalidatePath } from 'next/cache';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { toPublicError, ValidationError } from '@/lib/errors';

export interface Ergebnis { fehler?: string; hinweis?: string; erfolg?: boolean }

async function fuehreAus(arbeit: () => Promise<Ergebnis | void>): Promise<Ergebnis> {
  try {
    return (await arbeit()) ?? { erfolg: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return { fehler: toPublicError(error).body.error };
  }
}

export async function firmaSpeichernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('settings.edit');
    const wert = {
      name: String(formData.get('name') ?? '').trim(),
      ort: String(formData.get('ort') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      telefon: String(formData.get('telefon') ?? '').trim(),
      website: String(formData.get('website') ?? '').trim(),
    };
    if (!wert.name) throw new ValidationError('Bitte geben Sie den Firmennamen an.');
    await db.setting.upsert({ where: { key: 'firma' }, create: { key: 'firma', value: wert, updatedById: user.id }, update: { value: wert, updatedById: user.id } });
    await audit(user, { action: 'setting.update', entity: 'Setting', entityId: 'firma', summary: 'Firmendaten geaendert', after: wert });
    revalidatePath('/einstellungen');
    return { erfolg: true, hinweis: 'Firmendaten gespeichert.' };
  });
}

export async function regelnSpeichernAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('settings.edit');
    const abgleich = {
      toleranzMinuten: Math.max(0, Math.min(240, Number(formData.get('toleranz') ?? 15))),
      pausenToleranzMinuten: Math.max(0, Math.min(240, Number(formData.get('pausenToleranz') ?? 15))),
      autoZuordnungAb: Math.max(0.5, Math.min(1, Number(formData.get('autoZuordnung') ?? 0.92))),
    };
    const benachrichtigungen = {
      dokumentVorlaufTage: Math.max(1, Math.min(180, Number(formData.get('dokumentVorlauf') ?? 30))),
      eventVorlaufStunden: Math.max(1, Math.min(168, Number(formData.get('eventVorlauf') ?? 24))),
      unterbesetzungAbTagen: Math.max(1, Math.min(60, Number(formData.get('unterbesetzung') ?? 3))),
    };
    await db.$transaction([
      db.setting.upsert({ where: { key: 'abgleich' }, create: { key: 'abgleich', value: abgleich, updatedById: user.id }, update: { value: abgleich, updatedById: user.id } }),
      db.setting.upsert({ where: { key: 'benachrichtigungen' }, create: { key: 'benachrichtigungen', value: benachrichtigungen, updatedById: user.id }, update: { value: benachrichtigungen, updatedById: user.id } }),
    ]);
    await audit(user, { action: 'setting.update', entity: 'Setting', summary: 'Regeln fuer Abgleich und Benachrichtigungen geaendert', after: { abgleich, benachrichtigungen } });
    revalidatePath('/einstellungen');
    return { erfolg: true, hinweis: 'Regeln gespeichert.' };
  });
}

export async function leistungsartAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('settings.edit');
    const code = String(formData.get('code') ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const name = String(formData.get('name') ?? '').trim();
    if (!code || !name) throw new ValidationError('Bitte geben Sie Kuerzel und Bezeichnung an.');
    await db.serviceType.upsert({
      where: { code },
      create: { code, name, color: String(formData.get('color') ?? '#3B82F6') },
      update: { name, color: String(formData.get('color') ?? '#3B82F6') },
    });
    await audit(user, { action: 'servicetype.save', entity: 'ServiceType', entityId: code, summary: `Leistungsart ${code} gespeichert` });
    revalidatePath('/einstellungen');
    return { erfolg: true, hinweis: 'Leistungsart gespeichert.' };
  });
}

export async function qualifikationAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('settings.edit');
    const code = String(formData.get('code') ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    const name = String(formData.get('name') ?? '').trim();
    if (!code || !name) throw new ValidationError('Bitte geben Sie Kuerzel und Bezeichnung an.');
    await db.qualification.upsert({
      where: { code },
      create: { code, name, expires: formData.get('expires') === 'on' },
      update: { name, expires: formData.get('expires') === 'on' },
    });
    await audit(user, { action: 'qualification.save', entity: 'Qualification', entityId: code, summary: `Qualifikation ${code} gespeichert` });
    revalidatePath('/einstellungen');
    return { erfolg: true, hinweis: 'Qualifikation gespeichert.' };
  });
}

export async function vorlageLoeschenAktion(_zustand: Ergebnis, formData: FormData): Promise<Ergebnis> {
  return fuehreAus(async () => {
    const user = await seite('settings.edit');
    const id = String(formData.get('id'));
    const vorlage = await db.importTemplate.findUnique({ where: { id } });
    if (!vorlage) return { fehler: 'Die Vorlage wurde nicht gefunden.' };
    await db.importTemplate.delete({ where: { id } });
    await audit(user, { action: 'template.delete', entity: 'ImportTemplate', entityId: id, summary: `Importvorlage "${vorlage.name}" entfernt` });
    revalidatePath('/einstellungen');
    return { erfolg: true, hinweis: 'Vorlage entfernt.' };
  });
}
