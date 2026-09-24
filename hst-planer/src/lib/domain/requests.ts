import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { nextReference } from '../refs';
import { NotFoundError, ValidationError } from '../errors';
import { notifyDispo } from '../notify';
import { parseRequestEmail, type ParsedRequest } from '../email/parser';
import { nameSimilarity } from '../match';
import { eventAnlegen } from './events';
import { toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

/**
 * Personalanfragen (Spec 16–18).
 *
 * Grundregel: Eine eingehende Anfrage ist NIE eine Buchung. Sie wird immer
 * mit `needsReview` angelegt und muss von der Disposition geprueft werden.
 */

export const OEFFENTLICHE_ANFRAGE = z.object({
  company: z.string().trim().max(160).optional(),
  contactPerson: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().email('Bitte geben Sie eine gueltige E-Mail-Adresse an.'),
  phone: z.string().trim().max(60).optional(),
  eventName: z.string().trim().max(200).optional(),
  eventDate: z.string().trim().max(40).optional(),
  startTime: z.string().trim().max(10).optional(),
  endTime: z.string().trim().max(10).optional(),
  location: z.string().trim().max(200).optional(),
  employeesNeeded: z.union([z.number(), z.string()]).optional(),
  serviceType: z.string().trim().max(60).optional(),
  message: z.string().trim().max(5000).optional(),
});

export type OeffentlicheAnfrage = z.infer<typeof OEFFENTLICHE_ANFRAGE>;

function zahl(wert: unknown): number | null {
  if (wert == null || wert === '') return null;
  const n = Number(String(wert).replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
}

function zeit(wert: unknown): string | null {
  const text = String(wert ?? '').trim();
  const treffer = text.match(/^(\d{1,2})[:.]?(\d{2})?$/);
  if (!treffer) return null;
  const stunde = Number(treffer[1]);
  const minute = Number(treffer[2] ?? 0);
  if (stunde > 23 || minute > 59) return null;
  return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Anfrage aus dem Website-Formular oder ueber die API (Spec 16). */
export async function anfrageAusFormular(eingabe: OeffentlicheAnfrage, meta: { kanal?: $Enums.RequestChannel; ip?: string } = {}) {
  const reference = await nextReference('AN');
  const datum = eingabe.eventDate ? toDateOnly(`${eingabe.eventDate}T00:00:00Z`) : null;

  const fehlend: string[] = [];
  if (!datum || Number.isNaN(datum.getTime())) fehlend.push('Datum');
  if (!eingabe.startTime) fehlend.push('Startzeit');
  if (!eingabe.endTime) fehlend.push('Endzeit');
  if (!eingabe.location) fehlend.push('Ort');
  if (!zahl(eingabe.employeesNeeded)) fehlend.push('Anzahl Mitarbeiter');

  const anfrage = await db.request.create({
    data: {
      reference,
      channel: meta.kanal ?? 'WEBSITE',
      status: 'NEU',
      company: eingabe.company || null,
      contactPerson: eingabe.contactPerson || null,
      email: eingabe.email,
      phone: eingabe.phone || null,
      eventName: eingabe.eventName || null,
      eventDate: datum && !Number.isNaN(datum.getTime()) ? datum : null,
      startTime: zeit(eingabe.startTime),
      endTime: zeit(eingabe.endTime),
      location: eingabe.location || null,
      employeesNeeded: zahl(eingabe.employeesNeeded),
      serviceType: eingabe.serviceType || null,
      message: eingabe.message || null,
      missingFields: fehlend,
      confidence: fehlend.length === 0 ? 1 : Math.max(0, 1 - fehlend.length * 0.2),
      needsReview: true,
      customerId: await kundeErraten(eingabe.company, eingabe.email),
      sourceIp: meta.ip ?? null,
    },
  });

  await audit(null, {
    action: 'request.create', entity: 'Request', entityId: anfrage.id,
    summary: `Neue Personalanfrage ${reference} ueber ${anfrage.channel.toLowerCase()} von ${eingabe.email}`,
    ip: meta.ip,
  });
  await notifyDispo({
    kind: 'NEUE_ANFRAGE',
    title: `Neue Personalanfrage – Pruefung erforderlich (${reference})`,
    body: [eingabe.company, eingabe.eventName, eingabe.eventDate].filter(Boolean).join(' · ') || eingabe.email,
    link: `/anfragen/${anfrage.id}`,
    dedupeKey: `anfrage:${anfrage.id}`,
    webhookEvent: 'request.created',
    webhookPayload: { id: anfrage.id, reference, email: eingabe.email },
  });

  return anfrage;
}

/** Anfrage aus einer eingegangenen E-Mail (Spec 17). */
export async function anfrageAusEmail(emailMessageId: string, geparst?: ParsedRequest) {
  const mail = await db.emailMessage.findUnique({ where: { id: emailMessageId }, include: { request: { select: { id: true } } } });
  if (!mail) throw new NotFoundError('Die E-Mail wurde nicht gefunden.');
  // Bereits verarbeitet – ein zweiter Durchlauf darf keine Dublette erzeugen.
  if (mail.request) return null;

  const ergebnis = geparst ?? parseRequestEmail({
    subject: mail.subject, body: mail.textBody ?? '', fromName: mail.fromName, fromEmail: mail.fromEmail,
  });

  const reference = await nextReference('AN');
  const anfrage = await db.request.create({
    data: {
      reference,
      channel: 'EMAIL',
      status: 'NEU',
      company: ergebnis.company.value,
      contactPerson: ergebnis.contactPerson.value,
      email: ergebnis.email.value ?? mail.fromEmail,
      phone: ergebnis.phone.value,
      eventName: ergebnis.eventName.value,
      eventDate: ergebnis.eventDate.value ? toDateOnly(`${ergebnis.eventDate.value}T00:00:00Z`) : null,
      startTime: ergebnis.startTime.value,
      endTime: ergebnis.endTime.value,
      meetingTime: ergebnis.meetingTime.value,
      location: ergebnis.location.value,
      employeesNeeded: ergebnis.employeesNeeded.value,
      serviceType: ergebnis.serviceType.value,
      message: ergebnis.message,
      parsedFields: ergebnis as unknown as object,
      missingFields: ergebnis.missingFields,
      confidence: ergebnis.confidence,
      needsReview: true,
      emailMessageId: mail.id,
      customerId: await kundeErraten(ergebnis.company.value, ergebnis.email.value ?? mail.fromEmail),
    },
  });

  await db.emailMessage.update({ where: { id: mail.id }, data: { status: 'VERARBEITET', isRequest: true } });
  await audit(null, {
    action: 'request.create_from_email', entity: 'Request', entityId: anfrage.id,
    summary: `Personalanfrage ${reference} aus E-Mail von ${mail.fromEmail} erzeugt (Konfidenz ${Math.round(ergebnis.confidence * 100)} %)`,
  });
  await notifyDispo({
    kind: 'NEUE_ANFRAGE',
    title: `Neue Personalanfrage per E-Mail – Pruefung erforderlich (${reference})`,
    body: ergebnis.missingFields.length
      ? `Angaben unvollstaendig: ${ergebnis.missingFields.join(', ')}`
      : (mail.subject ?? mail.fromEmail),
    link: `/anfragen/${anfrage.id}`,
    dedupeKey: `anfrage:${anfrage.id}`,
    webhookEvent: 'request.created',
    webhookPayload: { id: anfrage.id, reference, quelle: 'email' },
  });

  return anfrage;
}

/**
 * Sucht einen passenden Bestandskunden – ueber die E-Mail-Domain oder den
 * Firmennamen. Bei Unsicherheit bleibt das Feld leer; der Disponent
 * entscheidet dann selbst.
 */
async function kundeErraten(firma: string | null | undefined, email: string | null | undefined): Promise<string | null> {
  const domain = email?.split('@')[1]?.toLowerCase();
  if (domain) {
    const ueberDomain = await db.customer.findFirst({
      where: { deletedAt: null, email: { endsWith: `@${domain}` } },
      select: { id: true },
    });
    if (ueberDomain) return ueberDomain.id;
  }
  if (firma && firma.length >= 4) {
    const kandidaten = await db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    const treffer = kandidaten
      .map((k) => ({ id: k.id, score: nameSimilarity(k.name, firma) }))
      .sort((a, b) => b.score - a.score)[0];
    if (treffer && treffer.score >= 0.9) return treffer.id;
  }
  return null;
}

const UEBERNAHME = z.object({
  eventName: z.string().trim().min(3, 'Bitte geben Sie dem Event einen Namen.').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitte ein Datum waehlen.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal('')),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal('')),
  customerId: z.string().trim().optional(),
  serviceTypeId: z.string().trim().optional(),
  positionTitle: z.string().trim().max(150).optional(),
  requiredCount: z.coerce.number().int().min(0).max(999).default(0),
});

/**
 * Anfrage in ein Event ueberfuehren (Spec 3).
 * Die Position wird gleich mit angelegt, damit der Disponent direkt
 * Personal suchen kann – das spart den haeufigsten Zwischenschritt.
 */
export async function anfrageUebernehmen(user: SessionUser, id: string, formData: FormData) {
  const anfrage = await db.request.findFirst({ where: { id, deletedAt: null } });
  if (!anfrage) throw new NotFoundError('Die Anfrage wurde nicht gefunden.');
  if (anfrage.eventId) throw new ValidationError('Aus dieser Anfrage wurde bereits ein Event erzeugt.');

  const ergebnis = UEBERNAHME.safeParse(Object.fromEntries(formData.entries()));
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte pruefen Sie Ihre Eingaben.');
  const daten = ergebnis.data;

  const event = await eventAnlegen(user, {
    name: daten.eventName,
    customerId: daten.customerId || null,
    serviceTypeId: daten.serviceTypeId || null,
    contactName: anfrage.contactPerson,
    contactPhone: anfrage.phone,
    contactEmail: anfrage.email,
    venue: anfrage.location,
    street: null, zip: null, city: null,
    date: daten.date,
    startTime: daten.startTime || null,
    endTime: daten.endTime || null,
    buildUpTime: null, teardownTime: null,
    meetingPoint: null,
    meetingTime: anfrage.meetingTime,
    eventKind: null,
    priority: 'NORMAL',
    status: 'PLANUNG',
    dressCode: null, tasks: null,
    hints: null,
    notesInternal: `Aus Anfrage ${anfrage.reference} uebernommen.\n\n${anfrage.message ?? ''}`.trim(),
    operationLeadId: null,
    revenue: null,
  });

  if (daten.requiredCount > 0) {
    await db.position.create({
      data: {
        eventId: event.id,
        title: daten.positionTitle?.trim() || 'Personal',
        serviceTypeId: daten.serviceTypeId || null,
        requiredCount: daten.requiredCount,
        startTime: daten.startTime || null,
        endTime: daten.endTime || null,
      },
    });
  }

  await db.request.update({
    where: { id },
    data: { status: 'UEBERNOMMEN', eventId: event.id, needsReview: false, customerId: daten.customerId || anfrage.customerId, updatedById: user.id },
  });
  await audit(user, {
    action: 'request.convert', entity: 'Request', entityId: id,
    summary: `Anfrage ${anfrage.reference} in Event ${event.reference} ueberfuehrt`,
  });

  return event;
}

export async function anfrageStatus(user: SessionUser, id: string, status: $Enums.RequestStatus, notiz?: string) {
  const anfrage = await db.request.findFirst({ where: { id, deletedAt: null } });
  if (!anfrage) throw new NotFoundError('Die Anfrage wurde nicht gefunden.');

  await db.request.update({
    where: { id },
    data: {
      status,
      needsReview: status === 'NEU',
      message: notiz ? `${anfrage.message ?? ''}\n\n[${new Date().toLocaleDateString('de-DE')} ${user.name}] ${notiz}`.trim() : anfrage.message,
      updatedById: user.id,
    },
  });
  await audit(user, {
    action: 'request.status', entity: 'Request', entityId: id,
    summary: `Anfrage ${anfrage.reference}: "${anfrage.status}" → "${status}"${notiz ? ` (${notiz})` : ''}`,
    before: { status: anfrage.status }, after: { status },
  });
}
