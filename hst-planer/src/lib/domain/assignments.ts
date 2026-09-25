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
import { pruefe, type Konflikt, type NachweisStand } from '../dispo/pruefung';

/**
 * Mitarbeiter einer Position zuweisen (Spec 8).
 *
 * Geprüft wird vor dem Speichern:
 *  * Ist der Mitarbeiter gesperrt oder inaktiv?
 *  * Ist er an diesem Tag bereits anderweitig eingeteilt (Überschneidung)?
 *  * Hat er sich für den Zeitraum abgemeldet (Urlaub/krank)?
 *
 * Die ersten beiden Punkte blockieren, der dritte ist eine Warnung, die der
 * Disponent bewusst übergehen kann (`trotzdem`).
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

export type { Konflikt } from '../dispo/pruefung';

/**
 * Daten fuer die Pruefung zusammentragen und an die reinen Regeln in
 * `lib/dispo/pruefung` uebergeben. Die Regeln selbst stehen bewusst
 * dort – so pruefen Oberflaeche und Server nach derselben Vorschrift.
 */
export async function pruefeZuweisung(positionId: string, employeeId: string): Promise<Konflikt[]> {
  const position = await db.position.findUnique({
    where: { id: positionId },
    include: { event: true, requirements: { include: { qualification: true } } },
  });
  if (!position) throw new NotFoundError('Die Position wurde nicht gefunden.');

  const tag = position.event.date;
  const vortag = new Date(tag);
  vortag.setDate(vortag.getDate() - 1);

  const employee = await db.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: {
      qualifications: { include: { qualification: true } },
      availabilities: true,
      documents: { where: { deletedAt: null }, select: { type: true, title: true, expiresAt: true } },
      assignments: {
        where: {
          deletedAt: null,
          status: { notIn: ['ABGESAGT', 'STORNIERT'] },
          event: { date: { in: [tag, vortag] } },
        },
        include: { event: true, position: true },
      },
    },
  });
  if (!employee) throw new NotFoundError('Der Mitarbeiter wurde nicht gefunden.');

  const name = `${employee.firstName} ${employee.lastName}`;
  const amTag = employee.assignments.filter((a) => a.event.date.getTime() === tag.getTime());
  const amVortag = employee.assignments.filter((a) => a.event.date.getTime() === vortag.getTime());

  // Bereits genau diese Position? Das ist kein Regelfall, sondern ein Versehen.
  if (amTag.some((a) => a.positionId === positionId)) {
    return [{
      art: 'UEBERSCHNEIDUNG',
      text: `${name} steht bereits auf dieser Position.`,
      blockierend: true,
    }];
  }

  const vorhandene = new Map(employee.qualifications.map((q) => [q.qualificationId, q]));
  const qualifikationen: NachweisStand[] = position.requirements.map((anforderung) => {
    const treffer = vorhandene.get(anforderung.qualificationId);
    return {
      name: anforderung.qualification.name,
      vorhanden: Boolean(treffer),
      laeuftAb: treffer?.expiresAt ?? null,
    };
  });

  // Pflichtschulungen: alles, was als wiederkehrend hinterlegt ist.
  const pflichtschulungen = await db.training.findMany({
    where: { deletedAt: null, mandatory: true },
    select: { id: true, title: true, repeatMonths: true, participants: { where: { employeeId }, select: { result: true, training: { select: { endsAt: true } } } } },
  });
  const schulungen: NachweisStand[] = pflichtschulungen.map((schulung) => {
    const bestanden = schulung.participants.find((t) => t.result === 'BESTANDEN' || t.result === 'TEILGENOMMEN');
    let laeuftAb: Date | null = null;
    if (bestanden && schulung.repeatMonths) {
      laeuftAb = new Date(bestanden.training.endsAt);
      laeuftAb.setMonth(laeuftAb.getMonth() + schulung.repeatMonths);
    }
    return { name: schulung.title, vorhanden: Boolean(bestanden), laeuftAb };
  });

  // Pflichtunterlagen: Fuehrungszeugnis und Dienstausweis.
  //
  // Das Fehlen wird nur auf Positionen gemeldet, die ueberhaupt eine
  // Qualifikation verlangen – also auf den bewachungsrechtlich geregelten
  // Posten. Sonst stuende auf jeder Garderobenschicht eine Warnung, und
  // Warnungen, die immer da sind, liest nach einer Woche niemand mehr.
  // Ein abgelaufenes Dokument wird dagegen immer gemeldet.
  const geregelt = position.requirements.length > 0;
  const dokumente: NachweisStand[] = (['FUEHRUNGSZEUGNIS', 'AUSWEIS'] as const).flatMap((typ) => {
    const treffer = employee.documents
      .filter((d) => d.type === typ)
      .sort((a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0))[0];
    if (!treffer && !geregelt) return [];
    return [{
      name: typ === 'FUEHRUNGSZEUGNIS' ? 'Führungszeugnis' : 'Dienstausweis',
      vorhanden: Boolean(treffer),
      laeuftAb: treffer?.expiresAt ?? null,
    }];
  });

  return pruefe({
    tag,
    ziel: {
      start: position.startTime ?? position.event.startTime,
      ende: position.endTime ?? position.event.endTime,
      bezeichnung: position.title,
    },
    person: {
      name,
      aktiv: employee.active,
      gesperrt: employee.blocked,
      sperrgrund: employee.blockReason,
    },
    belegt: amTag.map((a) => ({
      start: a.plannedStart ?? a.position.startTime ?? a.event.startTime,
      ende: a.plannedEnd ?? a.position.endTime ?? a.event.endTime,
      bezeichnung: a.event.name,
    })),
    belegtVortag: amVortag.map((a) => ({
      start: a.plannedStart ?? a.position.startTime ?? a.event.startTime,
      ende: a.plannedEnd ?? a.position.endTime ?? a.event.endTime,
      bezeichnung: a.event.name,
    })),
    abwesend: employee.availabilities
      .filter((z) => ['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'].includes(z.kind) && z.from <= tag && z.to >= tag)
      .map((z) => ({ art: z.kind, hinweis: z.note })),
    qualifikationen,
    schulungen,
    dokumente,
    vortagEnde: amVortag
      .map((a) => a.plannedEnd ?? a.position.endTime ?? a.event.endTime)
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null,
  });
}

export async function zuweisen(user: SessionUser, eingabe: ZuweisungEingabe) {
  const konflikte = await pruefeZuweisung(eingabe.positionId, eingabe.employeeId);
  const blockierend = konflikte.filter((k) => k.blockierend);
  if (blockierend.length) {
    throw new ConflictError(`Zuweisung nicht möglich: ${blockierend.map((k) => k.text).join(' ')}`, konflikte);
  }
  if (!eingabe.trotzdem && konflikte.length) {
    throw new ConflictError(
      `Bitte bestätigen Sie: ${konflikte.map((k) => k.text).join(' ')}`,
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
      body: grund ?? 'Die Disposition hat die Einteilung zurückgenommen.',
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
  if (!assignment) throw new NotFoundError('Dieser Einsatz gehört nicht zu Ihrem Profil.');
  if (assignment.event.date < new Date(Date.now() - 86400000)) {
    throw new ValidationError('Dieser Einsatz liegt in der Vergangenheit.');
  }
  if (!annehmen && !grund?.trim() && assignment.status === 'ZUGESAGT') {
    throw new ValidationError('Bitte geben Sie kurz an, warum Sie den bereits zugesagten Einsatz nicht wahrnehmen können.');
  }
  await statusSetzen(user, id, annehmen ? 'ZUGESAGT' : 'ABGESAGT', grund);
}
