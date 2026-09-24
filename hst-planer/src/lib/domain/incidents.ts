import 'server-only';
import { z } from 'zod';
import { db } from '../db';
import { audit } from '../audit';
import { NotFoundError, ValidationError } from '../errors';
import { notifyDispo } from '../notify';
import { INCIDENT_KIND } from '../status';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';

const SCHEMA = z.object({
  kind: z.enum(['NICHT_ERSCHIENEN', 'VERSPAETET', 'FALSCHE_KLEIDUNG', 'ERSATZ_ERFORDERLICH', 'KUNDENBESCHWERDE', 'TECHNISCHES_PROBLEM', 'SONSTIGES']),
  priority: z.enum(['NIEDRIG', 'NORMAL', 'HOCH', 'KRITISCH']).default('NORMAL'),
  employeeId: z.string().trim().optional().transform((v) => (v ? v : null)),
  description: z.string().trim().min(3, 'Bitte beschreiben Sie den Vorfall kurz.').max(2000),
});

/** Vorfall zu einem Einsatz erfassen (Spec 38). */
export async function vorfallAnlegen(user: SessionUser, eventId: string, formData: FormData) {
  const event = await db.event.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) throw new NotFoundError('Das Event wurde nicht gefunden.');

  const ergebnis = SCHEMA.safeParse(Object.fromEntries(formData.entries()));
  if (!ergebnis.success) throw new ValidationError(ergebnis.error.issues[0]?.message ?? 'Bitte pruefen Sie Ihre Eingaben.');

  const vorfall = await db.incident.create({
    data: { ...ergebnis.data, eventId, createdById: user.id, assigneeId: null },
  });

  // Ein nicht erschienener Mitarbeiter wird auch in der Zuweisung sichtbar.
  if (ergebnis.data.kind === 'NICHT_ERSCHIENEN' && ergebnis.data.employeeId) {
    await db.assignment.updateMany({
      where: { eventId, employeeId: ergebnis.data.employeeId, deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] } },
      data: { status: 'NICHT_ERSCHIENEN' },
    });
  }

  await audit(user, {
    action: 'incident.create', entity: 'Incident', entityId: vorfall.id,
    summary: `Vorfall "${INCIDENT_KIND[ergebnis.data.kind]}" bei ${event.reference} erfasst`,
    after: ergebnis.data,
  });

  if (['HOCH', 'KRITISCH'].includes(ergebnis.data.priority)) {
    await notifyDispo({
      kind: 'SYSTEM',
      title: `${INCIDENT_KIND[ergebnis.data.kind]}: ${event.name}`,
      body: ergebnis.data.description,
      link: `/events/${eventId}`,
    });
  }
  return vorfall;
}

export async function vorfallStatus(user: SessionUser, id: string, status: $Enums.IncidentStatus, loesung?: string) {
  const vorfall = await db.incident.findUnique({ where: { id }, include: { event: true } });
  if (!vorfall) throw new NotFoundError('Der Vorfall wurde nicht gefunden.');

  await db.incident.update({
    where: { id },
    data: { status, resolution: loesung ?? vorfall.resolution, assigneeId: vorfall.assigneeId ?? user.id },
  });
  await audit(user, {
    action: 'incident.status', entity: 'Incident', entityId: id,
    summary: `Vorfall bei ${vorfall.event.reference}: "${vorfall.status}" → "${status}"`,
    before: { status: vorfall.status }, after: { status, loesung },
  });
}
