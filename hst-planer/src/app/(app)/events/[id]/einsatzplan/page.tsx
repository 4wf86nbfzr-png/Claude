import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, weekdayDE } from '@/lib/time';
import { Drucken } from './drucken';

export const metadata = { title: 'Einsatzplan' };
export const dynamic = 'force-dynamic';

/**
 * Druckbarer Einsatzplan (Spec 62/63).
 * Bewusst schlicht und ohne Navigation – das Blatt geht an die Einsatzleitung
 * und hängt häufig ausgedruckt im Container.
 */
export default async function Einsatzplan({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('events.view');
  const { id } = await params;

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: {
      customer: { select: { name: true } },
      operationLead: { select: { firstName: true, lastName: true, mobile: true } },
      positions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          assignments: {
            where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] } },
            include: { employee: { select: { firstName: true, lastName: true, mobile: true, personnelNo: true } } },
            orderBy: [{ isReserve: 'asc' }, { roleInTeam: 'asc' }],
          },
        },
      },
    },
  });
  if (!event) notFound();

  return (
    <div style={{ maxWidth: 900 }}>
      <Drucken />

      <div className="druck-block" style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', margin: 0 }}>
          HERM Service Team · Einsatzplan
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 650, margin: '4px 0 6px' }}>{event.name}</h1>
        <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            <Zeile label="Event-ID" wert={event.reference} />
            <Zeile label="Datum" wert={`${weekdayDE(event.date)}, ${formatDateDE(event.date)}`} />
            <Zeile label="Zeit" wert={`${event.startTime ?? '–'} bis ${event.endTime ?? '–'}`} />
            <Zeile label="Kunde" wert={event.customer?.name ?? '–'} />
            <Zeile label="Ort" wert={[event.venue, event.street, [event.zip, event.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'} />
            <Zeile label="Treffpunkt" wert={[event.meetingPoint, event.meetingTime ? `um ${event.meetingTime}` : null].filter(Boolean).join(' ') || '–'} />
            <Zeile label="Einsatzleitung" wert={event.operationLead
              ? `${event.operationLead.firstName} ${event.operationLead.lastName}${event.operationLead.mobile ? ` · ${event.operationLead.mobile}` : ''}`
              : '–'} />
            <Zeile label="Dresscode" wert={event.dressCode ?? '–'} />
            <Zeile label="Ansprechpartner Kunde" wert={[event.contactName, event.contactPhone].filter(Boolean).join(' · ') || '–'} />
          </tbody>
        </table>
      </div>

      {event.positions.map((position) => (
        <div key={position.id} className="druck-block karte" style={{ marginBottom: 14 }}>
          <div className="karte-titel">
            <span>{position.title}</span>
            <span style={{ fontWeight: 400, fontSize: 12 }}>
              {position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'} · Pause {position.breakMinutes} Min
              · {position.assignments.filter((a) => !a.isReserve).length}/{position.requiredCount} besetzt
            </span>
          </div>
          <table className="tabelle">
            <thead><tr><th>Nr.</th><th>Mitarbeiter</th><th>Funktion</th><th>Telefon</th><th>Von</th><th>Bis</th><th>Bemerkung</th></tr></thead>
            <tbody>
              {position.assignments.length === 0 ? (
                <tr><td colSpan={7} style={{ color: 'var(--text-3)' }}>Nicht besetzt</td></tr>
              ) : position.assignments.map((a, index) => (
                <tr key={a.id}>
                  <td className="zahl">{index + 1}</td>
                  <td>{a.employee.lastName}, {a.employee.firstName}
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>{a.employee.personnelNo}</span>
                  </td>
                  <td>{a.isReserve ? 'Ersatz' : a.roleInTeam === 'MITARBEITER' ? '–' : a.roleInTeam.toLowerCase()}</td>
                  <td className="zahl">{a.employee.mobile ?? '–'}</td>
                  <td className="zahl">{a.plannedStart ?? position.startTime ?? '–'}</td>
                  <td className="zahl">{a.plannedEnd ?? position.endTime ?? '–'}</td>
                  <td style={{ fontSize: 11 }}>{a.noteForEmployee ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {(event.tasks || event.hints) && (
        <div className="druck-block karte" style={{ padding: 14 }}>
          {event.tasks && <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}><strong>Aufgaben:</strong> {event.tasks}</p>}
          {event.hints && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong>Hinweise:</strong> {event.hints}</p>}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16 }}>
        Stand: {new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · Interne Notizen sind in diesem Plan bewusst nicht enthalten.
      </p>
    </div>
  );
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <tr>
      <th style={{ textAlign: 'left', padding: '2px 16px 2px 0', fontWeight: 600, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</th>
      <td style={{ padding: '2px 0' }}>{wert}</td>
    </tr>
  );
}
