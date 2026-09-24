import 'server-only';
import { db } from '../db';
import { audit } from '../audit';
import { NotFoundError, ValidationError } from '../errors';
import { removeStored, storeUpload } from '../storage';
import { toDateOnly } from '../time';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

/** Dokumentenverwaltung (Spec 30). Dateien liegen ausserhalb des Web-Roots. */
export interface DokumentEingabe {
  datei: File;
  typ: $Enums.DocumentType;
  titel?: string;
  gueltigBis?: string | null;
  fuerMitarbeiterSichtbar?: boolean;
  employeeId?: string | null;
  customerId?: string | null;
  eventId?: string | null;
  partnerId?: string | null;
}

export async function dokumentAnlegen(user: SessionUser, eingabe: DokumentEingabe) {
  const zuordnungen = [eingabe.employeeId, eingabe.customerId, eingabe.eventId, eingabe.partnerId].filter(Boolean);
  if (zuordnungen.length === 0) {
    throw new ValidationError('Bitte ordnen Sie das Dokument einem Mitarbeiter, Kunden, Event oder Partner zu.');
  }
  if (zuordnungen.length > 1) {
    throw new ValidationError('Bitte wählen Sie genau eine Zuordnung.');
  }

  const ordner = eingabe.employeeId ? `mitarbeiter/${eingabe.employeeId}`
    : eingabe.eventId ? `events/${eingabe.eventId}`
    : eingabe.customerId ? `kunden/${eingabe.customerId}`
    : `partner/${eingabe.partnerId}`;

  const gespeichert = await storeUpload(eingabe.datei, ordner);

  const dokument = await db.document.create({
    data: {
      type: eingabe.typ,
      title: eingabe.titel?.trim() || gespeichert.fileName,
      fileName: gespeichert.fileName,
      filePath: gespeichert.filePath,
      mimeType: gespeichert.mimeType,
      sizeBytes: gespeichert.sizeBytes,
      checksum: gespeichert.checksum,
      expiresAt: eingabe.gueltigBis ? toDateOnly(`${eingabe.gueltigBis}T00:00:00Z`) : null,
      visibleToEmployee: eingabe.fuerMitarbeiterSichtbar ?? false,
      employeeId: eingabe.employeeId ?? null,
      customerId: eingabe.customerId ?? null,
      eventId: eingabe.eventId ?? null,
      partnerId: eingabe.partnerId ?? null,
      createdById: user.id,
    },
  });

  await audit(user, {
    action: 'document.create', entity: 'Document', entityId: dokument.id,
    summary: `Dokument "${dokument.title}" (${dokument.type}) hochgeladen`,
    after: { typ: dokument.type, datei: dokument.fileName, groesse: dokument.sizeBytes },
  });
  return dokument;
}

export async function dokumentEntfernen(user: SessionUser, id: string) {
  const dokument = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!dokument) throw new NotFoundError('Das Dokument wurde nicht gefunden.');

  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  // Die Datei selbst wird erst beim Aufräumjob entfernt – so bleibt ein
  // versehentliches Löschen eine Weile reparierbar.
  await audit(user, {
    action: 'document.delete', entity: 'Document', entityId: id,
    summary: `Dokument "${dokument.title}" entfernt`,
  });
}

/** Endgueltiges Löschen geloeschter Dateien (taeglicher Job, 30 Tage Frist). */
export async function papierkorbLeeren(tage = 30): Promise<number> {
  const grenze = new Date(Date.now() - tage * 86400000);
  const alte = await db.document.findMany({ where: { deletedAt: { lt: grenze } } });
  for (const dokument of alte) {
    await removeStored(dokument.filePath).catch(() => {});
    await db.document.delete({ where: { id: dokument.id } });
  }
  return alte.length;
}

/**
 * Darf dieser Benutzer das Dokument sehen?
 * Mitarbeiter sehen ihre eigenen Dokumente nur, wenn sie freigegeben sind.
 */
export async function darfSehen(user: SessionUser, dokumentId: string): Promise<boolean> {
  const dokument = await db.document.findFirst({
    where: { id: dokumentId, deletedAt: null },
    include: { employee: { select: { partnerId: true } }, event: { select: { customerId: true } } },
  });
  if (!dokument) return false;

  switch (user.scope) {
    case 'ALLE':
      return true;
    case 'EVENT':
      return Boolean(dokument.eventId || dokument.employeeId);
    case 'PARTNER':
      return dokument.partnerId === user.partnerId || dokument.employee?.partnerId === user.partnerId;
    case 'KUNDE':
      return dokument.customerId === user.customerId || dokument.event?.customerId === user.customerId;
    default:
      return dokument.employeeId === user.employeeId && dokument.visibleToEmployee;
  }
}
