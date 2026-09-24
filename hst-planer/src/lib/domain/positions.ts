import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit, diff } from '../audit';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { statusNachziehen } from '../queries/coverage';
import type { SessionUser } from '../auth/session';

const ZEIT = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte im Format HH:MM angeben.'), z.literal('')])
  .optional().transform((v) => (v ? v : null));

const SCHEMA = z.object({
  title: z.string().trim().min(2, 'Bitte geben Sie der Position einen Namen.').max(150),
  serviceTypeId: z.string().trim().optional().transform((v) => (v ? v : null)),
  requiredCount: z.coerce.number().int().min(1, 'Mindestens eine Kraft.').max(999, 'Hoechstens 999 Kraefte je Position.'),
  startTime: ZEIT,
  endTime: ZEIT,
  breakMinutes: z.coerce.number().int().min(0).max(600).default(0),
  dressCode: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
  note: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
  hourlyRate: z.union([z.string().trim(), z.literal('')]).optional().transform((v) => (v ? v.replace(',', '.') : null)),
});

function lies(formData: FormData) {
  const ergebnis = SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte pruefen Sie Ihre Eingaben.');
  return ergebnis.data;
}

/** Anforderungen als Liste von Qualifikations-IDs (Mehrfachauswahl im Formular). */
function anforderungen(formData: FormData): string[] {
  return formData.getAll('qualifikationen').map(String).filter(Boolean);
}

export async function positionAnlegen(user: SessionUser, eventId: string, formData: FormData) {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new NotFoundError('Das Event wurde nicht gefunden.');
  const daten = lies(formData);

  const anzahl = await db.position.count({ where: { eventId } });
  const position = await db.position.create({
    data: {
      ...daten, eventId, sortOrder: anzahl,
      requirements: { create: anforderungen(formData).map((qualificationId) => ({ qualificationId })) },
    },
  });

  await statusNachziehen(eventId);
  await audit(user, {
    action: 'position.create', entity: 'Position', entityId: position.id,
    summary: `Position "${position.title}" (${position.requiredCount} Kraefte) zu ${event.reference} angelegt`,
    after: daten,
  });
  return position;
}

export async function positionAendern(user: SessionUser, id: string, formData: FormData) {
  const vorher = await db.position.findUnique({ where: { id }, include: { event: true, requirements: true } });
  if (!vorher) throw new NotFoundError('Die Position wurde nicht gefunden.');
  const daten = lies(formData);

  const besetzt = await db.assignment.count({ where: { positionId: id, deletedAt: null, isReserve: false, status: { notIn: ['ABGESAGT', 'STORNIERT'] } } });
  if (daten.requiredCount < besetzt) {
    throw new ConflictError(`Es sind bereits ${besetzt} Kraefte eingeteilt. Entfernen Sie zuerst ueberzaehlige Zuweisungen.`);
  }

  const gewuenscht = anforderungen(formData);
  await db.$transaction([
    db.position.update({ where: { id }, data: daten }),
    db.positionRequirement.deleteMany({ where: { positionId: id, qualificationId: { notIn: gewuenscht } } }),
    ...gewuenscht.map((qualificationId) =>
      db.positionRequirement.upsert({
        where: { positionId_qualificationId: { positionId: id, qualificationId } },
        create: { positionId: id, qualificationId },
        update: {},
      }),
    ),
  ]);

  await statusNachziehen(vorher.eventId);
  const unterschied = diff(vorher as unknown as Record<string, unknown>, daten as Record<string, unknown>);
  await audit(user, {
    action: 'position.update', entity: 'Position', entityId: id,
    summary: `Position "${vorher.title}" geaendert (${unterschied.changed.join(', ') || 'Anforderungen'})`,
    before: unterschied.before, after: unterschied.after,
  });
}

export async function positionEntfernen(user: SessionUser, id: string) {
  const position = await db.position.findUnique({
    where: { id },
    include: { event: true, _count: { select: { assignments: { where: { deletedAt: null } } } } },
  });
  if (!position) throw new NotFoundError('Die Position wurde nicht gefunden.');
  if (position._count.assignments > 0) {
    throw new ConflictError('Die Position hat noch Zuweisungen. Bitte entfernen Sie diese zuerst.');
  }

  await db.position.delete({ where: { id } });
  await statusNachziehen(position.eventId);
  await audit(user, {
    action: 'position.delete', entity: 'Position', entityId: id,
    summary: `Position "${position.title}" aus ${position.event.reference} entfernt`,
    before: { titel: position.title, anzahl: position.requiredCount },
  });
}
