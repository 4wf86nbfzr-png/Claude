import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db';
import { can } from '../auth/rbac';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

/**
 * Zugriff auf Dokumente (SecPlan 6 und 16).
 *
 * Grundsatz: es gibt keine Adresse, unter der eine Datei ohne Prüfung
 * liegt. Jeder Abruf läuft über eine Route, die vier Dinge prüft –
 * Anmeldung, Recht, Zugriffsebene, Bezug zur Person – und die jeden
 * Versuch protokolliert, auch den abgewiesenen. Gerade der abgewiesene
 * ist interessant.
 *
 * Für den Fall, dass ein Dokument kurz ohne Sitzung erreichbar sein muss
 * (Weiterleitung an einen Prüfer, Öffnen in einer anderen Anwendung),
 * gibt es einen Token: eine Zeichenkette, die für genau eine Datei,
 * genau eine Person und genau eine Stunde gilt und danach verfällt.
 */

export interface Zugriffsurteil {
  erlaubt: boolean;
  /** Wenn nicht erlaubt: welche Prüfung gegriffen hat. */
  grund?: string;
}

/** Welche Rollen erreichen welche Zugriffsebene? */
function ebeneErlaubt(user: SessionUser, ebene: $Enums.DocumentAccess): boolean {
  switch (ebene) {
    case 'PERSONAL_INTERN':
      return can(user.role, 'employees.file');
    case 'DISPOSITION':
      return can(user.role, 'employees.file') || can(user.role, 'dispo.view');
    case 'EINSATZBEZOGEN':
      return can(user.role, 'documents.view');
    case 'MITARBEITER':
      return true;   // zusätzlich greift unten die Prüfung auf den Bezug
    case 'KUNDE':
      return user.scope === 'KUNDE' || can(user.role, 'documents.view');
    case 'PARTNER':
      return user.scope === 'PARTNER' || can(user.role, 'documents.view');
    default:
      return false;
  }
}

/**
 * Darf dieser Benutzer dieses Dokument abrufen?
 *
 * Die Reihenfolge ist Absicht: erst das grobe Recht, dann die
 * Zugriffsebene, dann der Bezug zur Person. So steht im Protokoll nicht
 * „kein Zugriff", sondern welcher Schritt gegriffen hat.
 */
export async function pruefeDokumentZugriff(user: SessionUser, dokumentId: string): Promise<Zugriffsurteil> {
  const dokument = await db.document.findFirst({
    where: { id: dokumentId, deletedAt: null },
    select: {
      id: true, access: true, specialCategory: true, visibleToEmployee: true,
      employeeId: true, customerId: true, partnerId: true, eventId: true,
      employee: { select: { partnerId: true } },
      event: { select: { customerId: true } },
    },
  });
  if (!dokument) return { erlaubt: false, grund: 'Das Dokument gibt es nicht oder es liegt im Papierkorb.' };

  // Der eigene Mitarbeiter darf seine freigegebenen Unterlagen immer sehen.
  const istEigenes = dokument.employeeId !== null && dokument.employeeId === user.employeeId;
  if (istEigenes && dokument.visibleToEmployee && !dokument.specialCategory) {
    return { erlaubt: true };
  }

  if (!can(user.role, 'documents.view')) {
    return { erlaubt: false, grund: 'Die Rolle hat kein Recht, Dokumente zu sehen.' };
  }

  // Besondere Kategorien nach Art. 9 DSGVO: eigenes Recht, keine Ausnahme.
  if (dokument.specialCategory && !can(user.role, 'employees.sensitive')) {
    return { erlaubt: false, grund: 'Besondere Kategorie nach Art. 9 DSGVO – gesonderte Freigabe erforderlich.' };
  }

  if (!ebeneErlaubt(user, dokument.access)) {
    return { erlaubt: false, grund: `Zugriffsebene ${dokument.access} ist für diese Rolle nicht freigegeben.` };
  }

  // Bezug zur eigenen Zuständigkeit.
  switch (user.scope) {
    case 'ALLE':
      return { erlaubt: true };
    case 'EVENT':
      if (dokument.eventId || dokument.employeeId) return { erlaubt: true };
      return { erlaubt: false, grund: 'Das Dokument gehört zu keinem Einsatz, auf dem Sie stehen.' };
    case 'PARTNER':
      if (dokument.partnerId === user.partnerId || dokument.employee?.partnerId === user.partnerId) return { erlaubt: true };
      return { erlaubt: false, grund: 'Das Dokument gehört nicht zu Ihrem Unternehmen.' };
    case 'KUNDE':
      if (dokument.customerId === user.customerId || dokument.event?.customerId === user.customerId) return { erlaubt: true };
      return { erlaubt: false, grund: 'Das Dokument gehört nicht zu Ihren Aufträgen.' };
    default:
      if (istEigenes && dokument.visibleToEmployee) return { erlaubt: true };
      return { erlaubt: false, grund: 'Das Dokument ist für Sie nicht freigegeben.' };
  }
}

export interface Spur {
  ip?: string | null;
  userAgent?: string | null;
}

/** Jeden Versuch festhalten – den gewährten wie den abgewiesenen. */
export async function protokolliereZugriff(
  dokumentId: string,
  user: SessionUser | null,
  aktion: 'ANSEHEN' | 'HERUNTERLADEN' | 'TOKEN_ERZEUGT' | 'TOKEN_EINGELOEST',
  urteil: Zugriffsurteil,
  spur: Spur = {},
): Promise<void> {
  await db.documentAccessLog.create({
    data: {
      documentId: dokumentId,
      userId: user?.id ?? null,
      role: user?.role ?? null,
      action: aktion,
      result: urteil.erlaubt ? 'GEWAEHRT' : 'VERWEIGERT',
      reason: urteil.erlaubt ? null : (urteil.grund ?? null),
      ip: spur.ip ?? null,
      userAgent: spur.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Wie lange ein Zugriffstoken gilt. Eine Stunde ist lang genug zum
 *  Weiterleiten und kurz genug, um nicht in einem Postfach zu veralten. */
export const TOKEN_GUELTIG_MINUTEN = 60;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Erzeugt einen kurzlebigen Token für genau dieses Dokument und genau
 * diesen Benutzer. Gespeichert wird nur der Hash – wer die Datenbank
 * liest, bekommt damit keinen Zugriff.
 */
export async function tokenErzeugen(user: SessionUser, dokumentId: string, spur: Spur = {}): Promise<string | null> {
  const urteil = await pruefeDokumentZugriff(user, dokumentId);
  await protokolliereZugriff(dokumentId, user, 'TOKEN_ERZEUGT', urteil, spur);
  if (!urteil.erlaubt) return null;

  const token = randomBytes(32).toString('hex');
  await db.documentToken.create({
    data: {
      tokenHash: hash(token),
      documentId: dokumentId,
      userId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_GUELTIG_MINUTEN * 60_000),
    },
  });
  return token;
}

export interface TokenEinloesung {
  dokumentId: string;
  userId: string;
}

/**
 * Löst einen Token ein. Ein Token gilt genau einmal: danach steht
 * `usedAt`, und ein zweiter Aufruf läuft ins Leere. Das ist strenger als
 * nötig, aber es macht einen weitergeleiteten Link harmlos, sobald ihn
 * jemand geöffnet hat.
 */
export async function tokenEinloesen(token: string): Promise<TokenEinloesung | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;

  const eintrag = await db.documentToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!eintrag) return null;
  if (eintrag.usedAt) return null;
  if (eintrag.expiresAt < new Date()) return null;

  await db.documentToken.update({ where: { id: eintrag.id }, data: { usedAt: new Date() } });
  return { dokumentId: eintrag.documentId, userId: eintrag.userId };
}

/** Abgelaufene Token aufräumen – läuft mit den täglichen Aufgaben. */
export async function tokenAufraeumen(): Promise<number> {
  const { count } = await db.documentToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] },
  });
  return count;
}
