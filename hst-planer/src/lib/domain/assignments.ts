import 'server-only';
import { db } from '../db';
import { audit } from '../audit';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { notifyDispo, notifyUsers } from '../notify';
import { dispatchWebhook } from '../webhooks';
import { statusNachziehen } from '../queries/coverage';
import { formatDateDE, shiftDuration } from '../time';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

/**
 * Mitarbeiter einer Position zuweisen (Spec 8).
 *
 * Geprueft wird vor dem Speichern:
 *  * Ist der Mitarbeiter gesperrt oder inaktiv?
 *  * Ist er an diesem Tag bereits anderweitig eingeteilt (Ueberschneidung)?
 *  * Hat er sich fuer den Zeitraum abgemeldet (Urlaub/krank)?
 *
 * Die ersten beiden Punkte blockieren, der dritte ist eine Warnung, die der
 * Disponent bewusst uebergehen kann (`trotzdem`).
 */
export interface ZuweisungEingabe {
  positionId: string;
  employeeId: string;
  roleInTeam?: $Enums.AssignmentRole;
  isReserve?: boolean;
  status?: $Enums.AssignmentStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  plannedBreakMinutes?: number;
  noteForEmployee?: string | null;
  trotzdem?: boolean;
}

export interface Konflikt { art: 'UEBERSCHNEIDUNG' | 'ABWESEND' | 'GESPERRT' | 'QUALIFIKATION'; text: string; blockierend: boolean }

export async function pruefeZuweisung(positionId: string, employeeId: string): Promise<Konflikt[]> {
  const position = await db.position.findUnique({
    where: { id: positionId },
    include: { event: true, requirements: { include: { qualification: true } } },
  });
  if (!position) throw new NotFoundError('Die Position wurde nicht gefunden.');

  const employee = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: {
      qualifications: { include: { qualification: true } },
      availabilities: true,
      assignments: {
        where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { date: position.event.date } },
        include: { event: true, position: true },
      },
    },
  });
  if (!employee) throw new NotFoundError('Der Mitarbeiter wurde nicht gefunden.');

  const konflikte: Konflikt[] = [];

  if (!employee.active) konflikte.push({ art: 'GESPERRT', text: 'Der Mitarbeiter ist deaktiviert.', blockierend: true });
  if (employee.blocked) {
    konflikte.push({ art: 'GESPERRT', text: `Sperrvermerk: ${employee.blockReason ?? 'ohne Angabe'}`, blockierend: true });
  }

  // Ueberschneidung am selben Tag
  const start = position.startTime ?? position.event.startTime;
  const ende = position.endTime ?? position.event.endTime;
  for (const vorhanden of employee.assignments) {
    if (vorhanden.positionId === positionId) {
      konflikte.push({ art: 'UEBERSCHNEIDUNG', text: 'Der Mitarbeiter ist dieser Position bereits zugewiesen.', blockierend: true });
      continue;
    }
    const vStart = vorhanden.plannedStart ?? vorhanden.position.startTime ?? vorhanden.event.startTime;
    const vEnde = vorhanden.plannedEnd ?? vorhanden.position.endTime ?? vorhanden.event.endTime;
    if (ueberschneidet(start, ende, vStart, vEnde)) {
      konflikte.push({
        art: 'UEBERSCHNEIDUNG',
        text: `Bereits eingeteilt: ${vorhanden.event.name} (${vStart ?? '?'}–${vEnde ?? '?'})`,
        blockierend: true,
      });
    }
  }

  // Abwesenheit
  const tag = position.event.date;
  for (const zeitraum of employee.availabilities) {
    if (['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'].includes(zeitraum.kind) && zeitraum.from <= tag && zeitraum.to >= tag) {
      konflikte.push({ art: 'ABWESEND', text: `Abwesend (${zeitraum.kind.toLowerCase()}${zeitraum.note ? `: ${zeitraum.note}` : ''})`, blockierend: false });
    }
  }

  // Qualifikationen
  const vorhandene = new Map(employee.qualifications.map((q) => [q.qualificationId, q]));
  for (const anforderung of position.requirements) {
    const treffer = vorhandene.get(anforderung.qualificationId);
    if (!treffer) {
      konflikte.push({ art: 'QUALIFIKATION', text: `Nachweis fehlt: ${anforderung.qualification.name}`, blockierend: false });
    } else if (treffer.expiresAt && treffer.expiresAt < tag) {
      konflikte.push({ art: 'QUALIFIKATION', text: `Nachweis abgelaufen: ${anforderung.qualification.name}`, blockierend: false });
    }
  }

  return konflikte;
}

function ueberschneidet(aStart: string | null, aEnde: string | null, bStart: string | null, bEnde: string | null): boolean {
  if (!aStart || !aEnde || !bStart || !bEnde) return false;
  const min = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
  const a1 = min(aStart);
  const a2 = a1 + (shiftDuration(aStart, aEnde)?.grossMinutes ?? 0);
  const b1 = min(bStart);
  const b2 = b1 + (shiftDuration(bStart, bEnde)?.grossMinutes ?? 0);
  return a1 < b2 && b1 < a2;
}

export async function zuweisen(user: SessionUser, eingabe: ZuweisungEingabe) {
  const konflikte = await pruefeZuweisung(eingabe.positionId, eingabe.employeeId);
  const blockierend = konflikte.filter((k) => k.blockierend);
  if (blockierend.length) {
    throw new ConflictError(`Zuweisung nicht moeglich: ${blockierend.map((k) => k.text).join(' ')}`, konflikte);
  }
  if (!eingabe.trotzdem && konflikte.length) {
    throw new ConflictError(
      `Bitte bestaetigen Sie: ${konflikte.map((k) => k.text).join(' ')}`,
      { konflikte, bestaetigungNoetig: true },
    );
  }

  const position = await db.position.findUnique({ where: { id: eingabe.positionId }, include: { event: true } });
  if (!position) throw new NotFoundError('Die Position wurde nicht gefunden.');

  const assignment = await db.assignment.create({
    data: {
      eventId: position.eventId,
      positionId: position.id,
      employeeId: eingabe.employeeId,
      roleInTeam: eingabe.roleInTeam ?? 'MITARBEITER',
      isReserve: eingabe.isReserve ?? false,
      status: eingabe.status ?? 'ANGEFRAGT',
      plannedStart: eingabe.plannedStart ?? position.startTime,
      plannedEnd: eingabe.plannedEnd ?? position.endTime,
      plannedBreakMinutes: eingabe.plannedBreakMinutes ?? position.breakMinutes,
      noteForEmployee: eingabe.noteForEmployee ?? null,
      createdById: user.id, updatedById: user.id,
    },
    include: { employee: { include: { user: { select: { id: true } } } } },
  });

  await statusNachziehen(position.eventId);
  await audit(user, {
    action: 'assignment.create', entity: 'Assignment', entityId: assignment.id,
    summary: `${assignment.employee.firstName} ${assignment.employee.lastName} wurde "${position.title}" (${position.event.name}, ${formatDateDE(position.event.date)}) zugewiesen`,
    after: { status: assignment.status, position: position.title },
  });

  if (assignment.employee.user?.id) {
    await notifyUsers([assignment.employee.user.id], {
      kind: 'SYSTEM',
      title: `Neue Einsatzanfrage: ${position.event.name}`,
      body: `${formatDateDE(position.event.date)} · ${assignment.plannedStart ?? '?'}–${assignment.plannedEnd ?? '?'} · ${position.title}`,
      link: '/meine-einsaetze',
    });
  }
  await dispatchWebhook('assignment.created', {
    id: assignment.id, eventId: position.eventId, employeeId: eingabe.employeeId, status: assignment.status,
  });

  return assignment;
}

export async function zuweisungEntfernen(user: SessionUser, id: string, grund?: string) {
  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    include: { employee: { include: { user: { select: { id: true } } } }, event: true, position: true },
  });
  if (!assignment) throw new NotFoundError('Die Zuweisung wurde nicht gefunden.');

  await db.assignment.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
  await statusNachziehen(assignment.eventId);

  await audit(user, {
    action: 'assignment.delete', entity: 'Assignment', entityId: id,
    summary: `${assignment.employee.firstName} ${assignment.employee.lastName} wurde aus "${assignment.position.title}" (${assignment.event.name}) entfernt${grund ? `: ${grund}` : ''}`,
    before: { status: assignment.status },
  });

  if (assignment.employee.user?.id && ['ZUGESAGT', 'EINGETEILT', 'ANGEFRAGT'].includes(assignment.status)) {
    await notifyUsers([assignment.employee.user.id], {
      kind: 'EINSATZ_ABGESAGT',
      title: `Einteilung aufgehoben: ${assignment.event.name}`,
      body: grund ?? 'Die Disposition hat die Einteilung zurueckgenommen.',
      link: '/meine-einsaetze',
    });
  }
}

export async function statusSetzen(user: SessionUser, id: string, status: $Enums.AssignmentStatus, grund?: string) {
  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null },
    include: { event: true, position: true, employee: true },
  });
  if (!assignment) throw new NotFoundError('Die Zuweisung wurde nicht gefunden.');

  await db.assignment.update({
    where: { id },
    data: {
      status,
      declineReason: status === 'ABGESAGT' ? grund ?? null : null,
      respondedAt: ['ZUGESAGT', 'ABGESAGT'].includes(status) ? new Date() : assignment.respondedAt,
      updatedById: user.id,
    },
  });
  await statusNachziehen(assignment.eventId);

  await audit(user, {
    action: 'assignment.status', entity: 'Assignment', entityId: id,
    summary: `${assignment.employee.firstName} ${assignment.employee.lastName}: Status "${assignment.status}" → "${status}"${grund ? ` (${grund})` : ''}`,
    before: { status: assignment.status }, after: { status },
  });

  if (status === 'ABGESAGT') {
    await notifyDispo({
      kind: 'EINSATZ_ABGESAGT',
      title: `Absage: ${assignment.employee.firstName} ${assignment.employee.lastName}`,
      body: `${assignment.event.name} am ${formatDateDE(assignment.event.date)}${grund ? ` – ${grund}` : ''}`,
      link: `/events/${assignment.eventId}`,
      webhookEvent: 'assignment.declined',
      webhookPayload: { assignmentId: id, eventId: assignment.eventId, grund },
    });
  }
  if (status === 'ZUGESAGT') {
    await notifyDispo({
      kind: 'EINSATZ_ZUGESAGT',
      title: `Zusage: ${assignment.employee.firstName} ${assignment.employee.lastName}`,
      body: `${assignment.event.name} am ${formatDateDE(assignment.event.date)}`,
      link: `/events/${assignment.eventId}`,
      webhookEvent: 'assignment.confirmed',
      webhookPayload: { assignmentId: id, eventId: assignment.eventId },
    });
  }
}

/** Antwort des Mitarbeiters auf eine Einsatzanfrage (Spec 13). */
export async function mitarbeiterAntwort(user: SessionUser, id: string, annehmen: boolean, grund?: string) {
  if (!user.employeeId) throw new ForbiddenError('Ihr Zugang ist keinem Mitarbeiterprofil zugeordnet.');
  const assignment = await db.assignment.findFirst({
    where: { id, deletedAt: null, employeeId: user.employeeId },
    include: { event: true, employee: true, position: true },
  });
  if (!assignment) throw new NotFoundError('Dieser Einsatz gehoert nicht zu Ihrem Profil.');
  if (assignment.event.date < new Date(Date.now() - 86400000)) {
    throw new ValidationError('Dieser Einsatz liegt in der Vergangenheit.');
  }
  if (!annehmen && !grund?.trim() && assignment.status === 'ZUGESAGT') {
    throw new ValidationError('Bitte geben Sie kurz an, warum Sie den bereits zugesagten Einsatz nicht wahrnehmen koennen.');
  }
  await statusSetzen(user, id, annehmen ? 'ZUGESAGT' : 'ABGESAGT', grund);
}
