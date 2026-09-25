import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, toDateOnly, weekdayDE } from '@/lib/time';
import { ASSIGNMENT_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AktionsFormular, AktionsKnopf, Ausklapp } from '@/components/aktion';
import { einsatzAntwortAktion } from '../events/actions';
import { nachrichtAnDispoAktion } from '../meine-dokumente/actions';

export const metadata: Metadata = { title: 'Meine Einsätze' };
export const dynamic = 'force-dynamic';

/**
 * Mitarbeiteransicht (Spec 12/13/44).
 *
 * Bewusst ohne Tabellen: große Flaechen, wenig Text, die wichtigste
 * Information (heute, wann, wo, Treffpunkt) zuerst. Interne Notizen
 * erscheinen hier nie – nur `hints` und `noteForEmployee`.
 */
export default async function MeineEinsaetze() {
  const user = await seite('self.shifts');
  if (!user.employeeId) {
    return (
      <>
        <Seitenkopf titel="Meine Einsätze" />
        <Hinweis art="info">
          Ihr Zugang ist keinem Mitarbeiterprofil zugeordnet. Bitte wenden Sie sich an die Disposition.
        </Hinweis>
      </>
    );
  }

  const heute = toDateOnly(new Date());
  const einsaetze = await einsaetzeLaden(user.employeeId, new Date(heute.getTime() - 86400000));

  const heutige = einsaetze.filter((e) => toDateOnly(e.event.date).getTime() === heute.getTime());
  const offen = einsaetze.filter((e) => e.status === 'ANGEFRAGT');
  const kommende = einsaetze.filter((e) => toDateOnly(e.event.date).getTime() > heute.getTime());

  return (
    <>
      <Seitenkopf titel="Meine Einsätze" unter={`${weekdayDE(new Date())}, ${formatDateDE(new Date())}`}
                  aktionen={
                    <>
                      <Link href="/meine-verfuegbarkeit" className="knopf"><Icon name="calendar" /> Verfügbarkeit melden</Link>
                      <Link href="/meine-dokumente" className="knopf"><Icon name="file" /> Meine Dokumente</Link>
                    </>
                  } />

      {offen.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gelb)', margin: '0 0 8px' }}>
            Bitte um Rueckmeldung ({offen.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {offen.map((einsatz) => <EinsatzKarte key={einsatz.id} einsatz={einsatz} antwortNoetig />)}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 8px' }}>Heute</h2>
        {heutige.length === 0
          ? <Karte><Leer>Heute haben Sie keinen Einsatz.</Leer></Karte>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {heutige.map((einsatz) => <EinsatzKarte key={einsatz.id} einsatz={einsatz} gross />)}
            </div>}
      </section>

      <section>
        <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 8px' }}>
          Kommende Einsätze
        </h2>
        {kommende.length === 0
          ? <Karte><Leer>Zurzeit sind keine weiteren Einsätze eingeplant.</Leer></Karte>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {kommende.map((einsatz) => <EinsatzKarte key={einsatz.id} einsatz={einsatz} antwortNoetig={einsatz.status === 'ANGEFRAGT'} />)}
            </div>}
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 8px' }}>
          Nachricht an die Disposition
        </h2>
        <Karte>
          <div style={{ padding: 16 }}>
            <AktionsFormular aktion={nachrichtAnDispoAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="feld-gruppe">
                <span className="feld-label">Worum geht es?</span>
                <input name="betreff" className="feld" required maxLength={120} placeholder="z. B. Frage zum Treffpunkt" />
              </label>
              <label className="feld-gruppe">
                <span className="feld-label">Betrifft einen Einsatz?</span>
                <select name="eventId" className="feld" defaultValue="">
                  <option value="">– allgemein –</option>
                  {einsaetze.map((einsatz) => (
                    <option key={einsatz.id} value={einsatz.event.id}>
                      {formatDateDE(einsatz.event.date)} · {einsatz.event.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="feld-gruppe">
                <span className="feld-label">Ihre Nachricht</span>
                <textarea name="text" className="feld" rows={4} required placeholder="Moin, …" />
              </label>
              <div><AktionsKnopf klasse="knopf knopf-primaer knopf-gross">Absenden</AktionsKnopf></div>
            </AktionsFormular>
          </div>
        </Karte>
      </section>
    </>
  );
}

/**
 * Der Typ eines Einsatzes leitet sich direkt aus der Abfrage oben ab –
 * so bleibt die Karte automatisch passend, wenn sich die Auswahl ändert.
 */
type Einsatz = Awaited<ReturnType<typeof einsaetzeLaden>>[number];

function einsaetzeLaden(employeeId: string, ab: Date) {
  return db.assignment.findMany({
    where: {
      employeeId, deletedAt: null, status: { notIn: ['STORNIERT'] },
      event: { date: { gte: ab }, deletedAt: null, status: { not: 'STORNIERT' } },
    },
    include: {
      event: {
        select: {
          id: true, name: true, date: true, startTime: true, endTime: true,
          venue: true, street: true, zip: true, city: true,
          meetingPoint: true, meetingTime: true, dressCode: true, hints: true, tasks: true,
          contactName: true, contactPhone: true,
          customer: { select: { name: true } },
          operationLead: { select: { firstName: true, lastName: true, mobile: true } },
        },
      },
      position: { select: { title: true, dressCode: true, note: true } },
    },
    orderBy: [{ event: { date: 'asc' } }, { plannedStart: 'asc' }],
    take: 60,
  });
}

function EinsatzKarte({ einsatz, gross, antwortNoetig }: { einsatz: Einsatz; gross?: boolean; antwortNoetig?: boolean }) {
  const event = einsatz.event;
  const adresse = [event.street, [event.zip, event.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const karte = adresse ? `https://www.openstreetmap.org/search?query=${encodeURIComponent([event.venue, adresse].filter(Boolean).join(', '))}` : null;

  return (
    <Karte>
      <div style={{ padding: gross ? 18 : 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div className="zahl" style={{ fontSize: gross ? 30 : 20, fontWeight: 650, lineHeight: 1.1 }}>
              {einsatz.plannedStart ?? event.startTime ?? '–'}
              <span style={{ fontSize: gross ? 18 : 14, color: 'var(--text-2)', fontWeight: 500 }}>
                {' '}bis {einsatz.plannedEnd ?? event.endTime ?? '–'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {weekdayDE(event.date)}, {formatDateDE(event.date)}
            </div>
          </div>
          <StatusMarke status={label(ASSIGNMENT_STATUS, einsatz.status)} />
        </div>

        <div>
          <div style={{ fontSize: gross ? 18 : 15, fontWeight: 600 }}>{(event.venue ?? event.city ?? event.name).toUpperCase()}</div>
          <div style={{ fontSize: 14 }}>{einsatz.position.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{event.name}{event.customer ? ` · ${event.customer.name}` : ''}</div>
        </div>

        {event.meetingPoint && (
          <div style={{ background: 'var(--blau-flaeche)', color: 'var(--blau)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 14 }}>
            <strong>Treffpunkt{event.meetingTime ? ` um ${event.meetingTime}` : ''}:</strong> {event.meetingPoint}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          {(einsatz.position.dressCode || event.dressCode) && (
            <div><strong>Dresscode:</strong> {einsatz.position.dressCode ?? event.dressCode}</div>
          )}
          {adresse && <div><strong>Adresse:</strong> {adresse}</div>}
          {event.operationLead && (
            <div>
              <strong>Einsatzleitung:</strong> {event.operationLead.firstName} {event.operationLead.lastName}
              {event.operationLead.mobile && <> · <a href={`tel:${event.operationLead.mobile.replace(/\s/g, '')}`}>{event.operationLead.mobile}</a></>}
            </div>
          )}
          {event.contactName && (
            <div>
              <strong>Ansprechpartner:</strong> {event.contactName}
              {event.contactPhone && <> · <a href={`tel:${event.contactPhone.replace(/\s/g, '')}`}>{event.contactPhone}</a></>}
            </div>
          )}
          {einsatz.noteForEmployee && <div><strong>Hinweis:</strong> {einsatz.noteForEmployee}</div>}
          {event.hints && <div style={{ whiteSpace: 'pre-wrap' }}>{event.hints}</div>}
        </div>

        {antwortNoetig ? (
          <AktionsFormular aktion={einsatzAntwortAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="hidden" name="assignmentId" value={einsatz.id} />
            <button type="submit" name="antwort" value="annehmen" className="knopf knopf-primaer knopf-gross" style={{ flex: '1 1 140px', justifyContent: 'center' }}>
              <Icon name="check" /> Annehmen
            </button>
            <Ausklapp titel="Ablehnen" knopfKlasse="knopf knopf-gross knopf-gefahr">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input name="grund" className="feld" placeholder="Grund (freiwillig)" style={{ flex: '1 1 160px' }} />
                <button type="submit" name="antwort" value="ablehnen" className="knopf knopf-gefahr">Absage senden</button>
              </div>
            </Ausklapp>
          </AktionsFormular>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {karte && <a href={karte} target="_blank" rel="noreferrer" className="knopf"><Icon name="pin" /> Route</a>}
            {einsatz.status === 'ZUGESAGT' && (
              <AktionsFormular aktion={einsatzAntwortAktion} stil={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                <input type="hidden" name="assignmentId" value={einsatz.id} />
                <Ausklapp titel="Verhindert / krank melden" knopfKlasse="knopf knopf-gefahr">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <input name="grund" className="feld" required placeholder="Kurz: was ist los?" style={{ flex: '1 1 180px' }} />
                    <button type="submit" name="antwort" value="ablehnen" className="knopf knopf-gefahr">Der Disposition melden</button>
                  </div>
                </Ausklapp>
              </AktionsFormular>
            )}
          </div>
        )}
      </div>
    </Karte>
  );
}
