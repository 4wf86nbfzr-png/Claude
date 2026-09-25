import 'server-only';
import { db } from '../db';
import { NotFoundError } from '../errors';
import type { Prisma } from '@prisma/client';

/**
 * Personal-Suche für eine offene Position (Spec 36).
 *
 * Die Reihenfolge der Vorschläge bildet ab, wie ein Disponent entscheidet:
 * passende Qualifikation zuerst, dann Erfahrung im selben Objekt, dann
 * Erfahrung im Leistungsbereich – wer abwesend oder schon eingeteilt ist,
 * rutscht ans Ende, verschwindet aber nicht (manchmal fragt man trotzdem).
 */
export interface SuchFilter {
  q?: string;
  nurVerfuegbar?: boolean;
  qualifikationId?: string;
  beschaeftigung?: string;
  bereich?: string;
  partnerId?: string;
  ohneSperrvermerk?: boolean;
}

export interface Vorschlag {
  id: string;
  name: string;
  personnelNo: string;
  mobile: string | null;
  employmentType: string;
  city: string | null;
  punkte: number;
  qualifiziert: boolean;
  fehlendeNachweise: string[];
  abwesend: string | null;
  belegt: string | null;
  bereitsZugewiesen: boolean;
  einsaetzeBeiKunde: number;
  einsaetzeGesamt: number;
  gesperrt: boolean;
}

export async function personalVorschlaege(positionId: string, filter: SuchFilter = {}, limit = 40): Promise<Vorschlag[]> {
  const position = await db.position.findUnique({
    where: { id: positionId },
    include: { event: { select: { id: true, date: true, customerId: true, startTime: true, endTime: true } }, requirements: { include: { qualification: { select: { name: true } } } } },
  });
  if (!position) throw new NotFoundError('Die Position wurde nicht gefunden.');

  const tag = position.event.date;
  const where: Prisma.EmployeeWhereInput = { deletedAt: null, active: true };
  if (filter.ohneSperrvermerk !== false) where.blocked = false;
  if (filter.partnerId) where.partnerId = filter.partnerId;
  if (filter.beschaeftigung) where.employmentType = filter.beschaeftigung as Prisma.EmployeeWhereInput['employmentType'];
  if (filter.bereich) where.preferredAreas = { has: filter.bereich };
  if (filter.qualifikationId) where.qualifications = { some: { qualificationId: filter.qualifikationId } };
  if (filter.q) {
    where.OR = [
      { firstName: { contains: filter.q, mode: 'insensitive' } },
      { lastName: { contains: filter.q, mode: 'insensitive' } },
      { personnelNo: { contains: filter.q, mode: 'insensitive' } },
    ];
  }

  const kandidaten = await db.employee.findMany({
    where,
    include: {
      qualifications: { include: { qualification: { select: { name: true } } } },
      availabilities: { where: { from: { lte: tag }, to: { gte: tag } } },
      assignments: {
        where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] } },
        select: {
          id: true, positionId: true, plannedStart: true, plannedEnd: true,
          event: { select: { id: true, name: true, date: true, customerId: true } },
        },
      },
    },
    take: 400,
  });

  const noetig = new Set(position.requirements.map((r) => r.qualificationId));

  const vorschlaege: Vorschlag[] = kandidaten.map((employee) => {
    const vorhandene = new Map(employee.qualifications.map((q) => [q.qualificationId, q]));
    const fehlend: string[] = [];
    for (const r of position.requirements) {
      const treffer = vorhandene.get(r.qualificationId);
      const gueltig = treffer && (!treffer.expiresAt || treffer.expiresAt >= tag);
      if (!gueltig) fehlend.push(r.qualification.name);
    }

    const abwesenheit = employee.availabilities.find((a) => ['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'].includes(a.kind));
    const amTag = employee.assignments.filter((a) => a.event.date.getTime() === tag.getTime());
    const belegt = amTag.find((a) => a.positionId !== positionId);
    const bereitsZugewiesen = amTag.some((a) => a.positionId === positionId);
    const einsaetzeBeiKunde = employee.assignments.filter((a) => a.event.customerId && a.event.customerId === position.event.customerId).length;

    let punkte = 0;
    if (fehlend.length === 0 && noetig.size > 0) punkte += 40;
    if (noetig.size === 0) punkte += 10;
    if (employee.preferredAreas.includes(position.serviceTypeId ?? '')) punkte += 5;
    punkte += Math.min(20, einsaetzeBeiKunde * 4);            // Objekterfahrung
    punkte += Math.min(10, employee.assignments.length);      // allgemeine Erfahrung
    if (abwesenheit) punkte -= 60;
    if (belegt) punkte -= 80;
    if (bereitsZugewiesen) punkte -= 200;
    if (employee.blocked) punkte -= 100;

    return {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      personnelNo: employee.personnelNo,
      mobile: employee.mobile,
      employmentType: employee.employmentType,
      city: employee.city,
      punkte,
      qualifiziert: fehlend.length === 0,
      fehlendeNachweise: fehlend,
      abwesend: abwesenheit ? `${abwesenheit.kind.toLowerCase()}${abwesenheit.note ? ` (${abwesenheit.note})` : ''}` : null,
      belegt: belegt ? `${belegt.event.name} ${belegt.plannedStart ?? ''}–${belegt.plannedEnd ?? ''}`.trim() : null,
      bereitsZugewiesen,
      einsaetzeBeiKunde,
      einsaetzeGesamt: employee.assignments.length,
      gesperrt: employee.blocked,
    };
  });

  const gefiltert = filter.nurVerfuegbar
    ? vorschlaege.filter((v) => !v.abwesend && !v.belegt && !v.bereitsZugewiesen)
    : vorschlaege;

  return gefiltert.sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de')).slice(0, limit);
}
