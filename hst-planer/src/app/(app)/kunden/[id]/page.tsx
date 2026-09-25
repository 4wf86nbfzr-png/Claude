import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { EVENT_STATUS, label } from '@/lib/status';
import { Karte, Leer, Paar, Seitenkopf, StatusMarke } from '@/components/ui';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { ansprechpartnerAktion, kundeDeaktivierenAktion } from '../actions';

export const dynamic = 'force-dynamic';

export default async function KundeDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('customers.view');
  const { id } = await params;
  if (user.scope === 'KUNDE' && user.customerId !== id) notFound();

  const kunde = await db.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      contacts: { orderBy: [{ primary: 'desc' }, { name: 'asc' }] },
      locations: { orderBy: { name: 'asc' } },
      events: {
        where: { deletedAt: null },
        select: { id: true, reference: true, name: true, date: true, status: true, startTime: true, endTime: true },
        orderBy: { date: 'desc' }, take: 25,
      },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!kunde) notFound();

  const darfBearbeiten = can(user.role, 'customers.edit');
  const darfFinanzen = can(user.role, 'finance.view');

  return (
    <>
      <Seitenkopf
        titel={kunde.name}
        brotkrumen={[{ href: '/kunden', label: 'Kunden' }]}
        unter={[kunde.city, kunde.email].filter(Boolean).join(' · ') || undefined}
        aktionen={
          <>
            <Link href={`/events/neu?kunde=${id}`} className="knopf">Event für diesen Kunden</Link>
            {darfBearbeiten && <Link href={`/kunden/${id}/bearbeiten`} className="knopf knopf-primaer">Bearbeiten</Link>}
          </>
        }
      />

      <div className="zweispaltig zweispaltig-breit" style={{ ['--zweite' as string]: '260px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Events">
            {kunde.events.length === 0 ? <Leer>Noch keine Events.</Leer> : (
              <table className="tabelle">
                <thead><tr><th>Datum</th><th>Event</th><th>Zeit</th><th>Status</th></tr></thead>
                <tbody>
                  {kunde.events.map((event) => (
                    <tr key={event.id}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(event.date)}</td>
                      <td><Link href={`/events/${event.id}`}>{event.name}</Link></td>
                      <td className="zahl">{event.startTime ?? '–'}–{event.endTime ?? '–'}</td>
                      <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Karte>

          <Karte titel="Ansprechpartner">
            {kunde.contacts.length === 0 ? <Leer>Keine Ansprechpartner hinterlegt.</Leer> : (
              <table className="tabelle">
                <thead><tr><th>Name</th><th>Funktion</th><th>E-Mail</th><th>Telefon</th></tr></thead>
                <tbody>
                  {kunde.contacts.map((kontakt) => (
                    <tr key={kontakt.id}>
                      <td>{kontakt.name}{kontakt.primary && <span className="marke marke-blau" style={{ marginLeft: 6 }}>Hauptkontakt</span>}</td>
                      <td style={{ color: 'var(--text-2)' }}>{kontakt.role ?? '–'}</td>
                      <td style={{ fontSize: 12 }}>{kontakt.email ? <a href={`mailto:${kontakt.email}`}>{kontakt.email}</a> : '–'}</td>
                      <td style={{ fontSize: 12 }}>{kontakt.phone ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {darfBearbeiten && (
              <div style={{ padding: 14, borderTop: '1px solid var(--linie)' }}>
                <Ausklapp titel="+ Ansprechpartner" knopfKlasse="knopf knopf-klein">
                  <AktionsFormular aktion={ansprechpartnerAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', maxWidth: 640 }}>
                    <input type="hidden" name="customerId" value={id} />
                    <input name="name" className="feld" required placeholder="Name" style={{ width: 'auto', flex: '1 1 140px' }} aria-label="Name" />
                    <input name="role" className="feld" placeholder="Funktion" style={{ width: 'auto', flex: '1 1 120px' }} aria-label="Funktion" />
                    <input name="email" type="email" className="feld" placeholder="E-Mail" style={{ width: 'auto', flex: '1 1 160px' }} aria-label="E-Mail" />
                    <input name="phone" type="tel" className="feld" placeholder="Telefon" style={{ width: 'auto', flex: '1 1 120px' }} aria-label="Telefon" />
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      <input type="checkbox" name="primary" /> Hauptkontakt
                    </label>
                    <AktionsKnopf klasse="knopf knopf-klein knopf-primaer">Hinzufügen</AktionsKnopf>
                  </AktionsFormular>
                </Ausklapp>
              </div>
            )}
          </Karte>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Stammdaten">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Paar label="Adresse">{[kunde.street, [kunde.zip, kunde.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}</Paar>
              <Paar label="E-Mail">{kunde.email ? <a href={`mailto:${kunde.email}`}>{kunde.email}</a> : '–'}</Paar>
              <Paar label="Telefon">{kunde.phone ?? '–'}</Paar>
              <Paar label="USt-IdNr.">{kunde.vatId ?? '–'}</Paar>
              {darfFinanzen && <Paar label="Stundensatz">{kunde.hourlyRate ? `${String(kunde.hourlyRate)} EUR` : '–'}</Paar>}
              {kunde.contractNote && <Paar label="Vertrag"><span style={{ whiteSpace: 'pre-wrap' }}>{kunde.contractNote}</span></Paar>}
            </div>
          </Karte>

          {kunde.locations.length > 0 && (
            <Karte titel="Einsatzorte">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {kunde.locations.map((ort) => (
                  <li key={ort.id} style={{ padding: '9px 14px', borderBottom: '1px solid var(--linie)', fontSize: 13 }}>
                    <strong>{ort.name}</strong>
                    <span style={{ display: 'block', color: 'var(--text-2)', fontSize: 12 }}>
                      {[ort.street, [ort.zip, ort.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Karte>
          )}

          {darfBearbeiten && kunde.notesInternal && (
            <Karte titel="Interne Notizen">
              <div style={{ padding: 14, whiteSpace: 'pre-wrap', fontSize: 13 }}>{kunde.notesInternal}</div>
            </Karte>
          )}

          {darfBearbeiten && kunde.active && (
            <Karte titel="Aktionen">
              <div style={{ padding: 14 }}>
                <AktionsFormular aktion={kundeDeaktivierenAktion}>
                  <input type="hidden" name="id" value={id} />
                  <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr">Kunde deaktivieren</AktionsKnopf>
                </AktionsFormular>
              </div>
            </Karte>
          )}
        </div>
      </div>
    </>
  );
}
