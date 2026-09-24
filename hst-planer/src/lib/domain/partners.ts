import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit, diff } from '../audit';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import type { SessionUser } from '../auth/session';

/** Kunden und Partner teilen sich Aufbau und Pruefungen (Spec 14/15). */
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const email = z.union([z.string().trim().toLowerCase().email('Bitte eine gueltige E-Mail-Adresse angeben.'), z.literal('')])
  .optional().transform((v) => (v ? v : null));
const betrag = z.union([z.string().trim(), z.literal('')]).optional().transform((v) => (v ? v.replace(',', '.') : null));

export const KUNDE_SCHEMA = z.object({
  name: z.string().trim().min(2, 'Bitte geben Sie den Firmennamen an.').max(160),
  shortName: optional(60),
  email, phone: optional(60),
  street: optional(160), zip: optional(10), city: optional(100),
  billingAddress: optional(400),
  vatId: optional(40),
  hourlyRate: betrag,
  contractNote: optional(2000),
  notesInternal: optional(2000),
  active: z.coerce.boolean().default(true),
});

export const PARTNER_SCHEMA = z.object({
  name: z.string().trim().min(2, 'Bitte geben Sie den Firmennamen an.').max(160),
  contactName: optional(120),
  email, phone: optional(60),
  street: optional(160), zip: optional(10), city: optional(100),
  hourlyRate: betrag,
  notesInternal: optional(2000),
  active: z.coerce.boolean().default(true),
});

function lies<S extends z.ZodTypeAny>(schema: S, formData: FormData): z.infer<S> {
  const roh = Object.fromEntries(formData.entries()) as Record<string, unknown>;
  roh.active = formData.get('active') === 'on';
  const ergebnis = schema.safeParse(roh);
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte pruefen Sie Ihre Eingaben.');
  return ergebnis.data;
}

export async function kundeSpeichern(user: SessionUser, id: string | null, formData: FormData) {
  const daten = lies(KUNDE_SCHEMA, formData);
  if (id) {
    const vorher = await db.customer.findFirst({ where: { id, deletedAt: null } });
    if (!vorher) throw new NotFoundError('Der Kunde wurde nicht gefunden.');
    const kunde = await db.customer.update({ where: { id }, data: { ...daten, updatedById: user.id } });
    const unterschied = diff(vorher as unknown as Record<string, unknown>, daten as Record<string, unknown>);
    await audit(user, {
      action: 'customer.update', entity: 'Customer', entityId: id,
      summary: `Kunde ${kunde.name} geaendert (${unterschied.changed.join(', ')})`,
      before: unterschied.before, after: unterschied.after,
    });
    return kunde;
  }
  const kunde = await db.customer.create({ data: { ...daten, createdById: user.id, updatedById: user.id } });
  await audit(user, { action: 'customer.create', entity: 'Customer', entityId: kunde.id, summary: `Kunde ${kunde.name} angelegt` });
  return kunde;
}

export async function partnerSpeichern(user: SessionUser, id: string | null, formData: FormData) {
  const daten = lies(PARTNER_SCHEMA, formData);
  if (id) {
    const vorher = await db.partner.findFirst({ where: { id, deletedAt: null } });
    if (!vorher) throw new NotFoundError('Der Partner wurde nicht gefunden.');
    const partner = await db.partner.update({ where: { id }, data: { ...daten, updatedById: user.id } });
    const unterschied = diff(vorher as unknown as Record<string, unknown>, daten as Record<string, unknown>);
    await audit(user, {
      action: 'partner.update', entity: 'Partner', entityId: id,
      summary: `Partner ${partner.name} geaendert (${unterschied.changed.join(', ')})`,
      before: unterschied.before, after: unterschied.after,
    });
    return partner;
  }
  const partner = await db.partner.create({ data: { ...daten, createdById: user.id, updatedById: user.id } });
  await audit(user, { action: 'partner.create', entity: 'Partner', entityId: partner.id, summary: `Partner ${partner.name} angelegt` });
  return partner;
}

export async function ansprechpartnerSpeichern(user: SessionUser, customerId: string, formData: FormData) {
  const schema = z.object({
    name: z.string().trim().min(2, 'Bitte geben Sie einen Namen an.').max(120),
    role: optional(80), email, phone: optional(60),
  });
  const ergebnis = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte pruefen Sie Ihre Eingaben.');

  const kontakt = await db.customerContact.create({
    data: { ...ergebnis.data, customerId, primary: formData.get('primary') === 'on' },
  });
  if (kontakt.primary) {
    await db.customerContact.updateMany({ where: { customerId, id: { not: kontakt.id } }, data: { primary: false } });
  }
  await audit(user, {
    action: 'customer.contact.create', entity: 'CustomerContact', entityId: kontakt.id,
    summary: `Ansprechpartner ${kontakt.name} hinzugefuegt`,
  });
}

/** Kunden werden nur deaktiviert, solange noch Events daran haengen. */
export async function kundeDeaktivieren(user: SessionUser, id: string) {
  const kunde = await db.customer.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { events: { where: { deletedAt: null, date: { gte: new Date() } } } } } },
  });
  if (!kunde) throw new NotFoundError('Der Kunde wurde nicht gefunden.');
  if (kunde._count.events > 0) {
    throw new ConflictError(`Dem Kunden sind noch ${kunde._count.events} kommende Events zugeordnet.`);
  }
  await db.customer.update({ where: { id }, data: { active: false, updatedById: user.id } });
  await audit(user, { action: 'customer.deactivate', entity: 'Customer', entityId: id, summary: `Kunde ${kunde.name} deaktiviert` });
}
