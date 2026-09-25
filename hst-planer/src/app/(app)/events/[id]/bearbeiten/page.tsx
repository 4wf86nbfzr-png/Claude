import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { EventFormular } from '../../event-formular';

export const metadata = { title: 'Event bearbeiten' };
export const dynamic = 'force-dynamic';

export default async function EventBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('events.edit');
  const { id } = await params;

  const [event, kunden, bereiche, leitungen] = await Promise.all([
    db.event.findFirst({ where: { id, ...eventFilter(user) } }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.employee.findMany({ where: { deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
  ]);
  if (!event) notFound();

  return (
    <EventFormular
      werte={{
        id: event.id, name: event.name, customerId: event.customerId, serviceTypeId: event.serviceTypeId,
        contactName: event.contactName, contactPhone: event.contactPhone, contactEmail: event.contactEmail,
        venue: event.venue, street: event.street, zip: event.zip, city: event.city,
        date: event.date.toISOString().slice(0, 10),
        startTime: event.startTime, endTime: event.endTime,
        buildUpTime: event.buildUpTime, teardownTime: event.teardownTime,
        meetingPoint: event.meetingPoint, meetingTime: event.meetingTime,
        eventKind: event.eventKind, priority: event.priority, status: event.status,
        dressCode: event.dressCode, tasks: event.tasks, hints: event.hints, notesInternal: event.notesInternal,
        operationLeadId: event.operationLeadId,
        revenue: event.revenue ? String(event.revenue) : null,
      }}
      kunden={kunden}
      bereiche={bereiche}
      leitungen={leitungen.map((l) => ({ id: l.id, name: `${l.firstName} ${l.lastName}` }))}
      darfFinanzen={can(user.role, 'finance.view')}
    />
  );
}
